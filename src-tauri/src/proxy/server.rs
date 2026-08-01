//! HTTP代理服务器
//!
//! 基于Axum的HTTP服务器，处理代理请求
//!
//! Uses a manual hyper HTTP/1.1 accept loop with `preserve_header_case(true)` so
//! that the original header-name casing from the CLI client is captured in a
//! `HeaderCaseMap` extension.  This map is later forwarded to the upstream via
//! the hyper-based HTTP client, producing wire-level header casing identical to
//! a direct (non-proxied) CLI request.

use super::{
    failover_switch::FailoverSwitchManager,
    handlers,
    log_codes::srv as log_srv,
    provider_router::ProviderRouter,
    providers::{codex_chat_history::CodexChatHistoryStore, gemini_shadow::GeminiShadowStore},
    types::*,
    ProxyError,
};
use crate::database::Database;
use axum::{
    extract::DefaultBodyLimit,
    routing::{any, get, post},
    Router,
};
use hyper_util::rt::TokioIo;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::{oneshot, RwLock};
use tokio::task::JoinHandle;

/// 代理服务器状态（共享）
#[derive(Clone)]
pub struct ProxyState {
    pub db: Arc<Database>,
    pub config: Arc<RwLock<ProxyConfig>>,
    pub status: Arc<RwLock<ProxyStatus>>,
    pub start_time: Arc<RwLock<Option<std::time::Instant>>>,
    /// 每个应用类型当前使用的 provider (app_type -> (provider_id, provider_name))
    pub current_providers: Arc<RwLock<std::collections::HashMap<String, (String, String)>>>,
    /// 共享的 ProviderRouter（持有熔断器状态，跨请求保持）
    pub provider_router: Arc<ProviderRouter>,
    /// Gemini Native shadow state，用于 thoughtSignature / tool call 回放
    pub gemini_shadow: Arc<GeminiShadowStore>,
    /// Codex Chat bridge history，用于恢复 previous_response_id 指向的 tool call
    pub codex_chat_history: Arc<CodexChatHistoryStore>,
    /// AppHandle，用于发射事件和更新托盘菜单
    pub app_handle: Option<tauri::AppHandle>,
    /// 故障转移切换管理器
    pub failover_manager: Arc<FailoverSwitchManager>,
}

#[cfg(test)]
#[allow(clippy::items_after_test_module)]
mod tests {
    use super::*;
    use crate::provider::Provider;
    use axum::body::Body;
    use axum::extract::State;
    use axum::response::Response;
    use http_body_util::BodyExt;
    use serde_json::{json, Value};
    use std::collections::VecDeque;
    use std::time::Duration;
    use tokio::sync::Mutex;

    struct CapturedRequest {
        method: http::Method,
        uri: http::Uri,
        headers: http::HeaderMap,
        body: Value,
    }

    struct MockReply {
        status: http::StatusCode,
        body: Value,
        delay: Duration,
        content_type: &'static str,
    }

    impl MockReply {
        fn json(status: http::StatusCode, body: Value) -> Self {
            Self {
                status,
                body,
                delay: Duration::ZERO,
                content_type: "application/json",
            }
        }

        fn typed(status: http::StatusCode, body: Value, content_type: &'static str) -> Self {
            Self {
                status,
                body,
                delay: Duration::ZERO,
                content_type,
            }
        }

        fn delayed(status: http::StatusCode, body: Value, delay: Duration) -> Self {
            Self {
                status,
                body,
                delay,
                content_type: "application/json",
            }
        }
    }

    #[derive(Clone)]
    struct MockUpstreamState {
        requests: Arc<Mutex<Vec<CapturedRequest>>>,
        replies: Arc<Mutex<VecDeque<MockReply>>>,
    }

    async fn capture_request(
        State(state): State<MockUpstreamState>,
        request: axum::extract::Request,
    ) -> Response {
        let (parts, body) = request.into_parts();
        let body = body
            .collect()
            .await
            .expect("collect mock request body")
            .to_bytes();
        let body = serde_json::from_slice(&body).expect("parse mock request body");
        state.requests.lock().await.push(CapturedRequest {
            method: parts.method,
            uri: parts.uri,
            headers: parts.headers,
            body,
        });
        let reply = state.replies.lock().await.pop_front().expect("mock reply");
        if !reply.delay.is_zero() {
            tokio::time::sleep(reply.delay).await;
        }

        Response::builder()
            .status(reply.status)
            .header("content-type", reply.content_type)
            .body(Body::from(
                serde_json::to_vec(&reply.body).expect("serialize mock response"),
            ))
            .expect("build mock response")
    }

    async fn spawn_upstream(
        replies: Vec<MockReply>,
    ) -> (
        String,
        Arc<Mutex<Vec<CapturedRequest>>>,
        tokio::task::JoinHandle<()>,
    ) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind mock upstream");
        let address = listener.local_addr().expect("mock upstream address");
        let requests = Arc::new(Mutex::new(Vec::new()));
        let state = MockUpstreamState {
            requests: requests.clone(),
            replies: Arc::new(Mutex::new(replies.into())),
        };
        let app = Router::new()
            .fallback(any(capture_request))
            .with_state(state);
        let handle = tokio::spawn(async move {
            axum::serve(listener, app)
                .await
                .expect("serve mock upstream");
        });
        (format!("http://{address}"), requests, handle)
    }

    async fn configure_codex_failover(db: &Database, max_retries: u32, timeout_seconds: u32) {
        let mut config = db
            .get_proxy_config_for_app("codex")
            .await
            .expect("read Codex proxy config");
        config.enabled = false;
        config.auto_failover_enabled = true;
        config.max_retries = max_retries;
        config.non_streaming_timeout = timeout_seconds;
        db.update_proxy_config_for_app(config)
            .await
            .expect("configure Codex failover");
    }

    fn queued_provider(id: &str, name: &str, origin: &str, sort_index: usize) -> Provider {
        let mut provider = Provider::with_id(
            id.to_string(),
            name.to_string(),
            json!({
                "base_url": format!("{origin}/v1"),
                "auth": {"OPENAI_API_KEY": format!("{id}-secret")}
            }),
            None,
        );
        provider.in_failover_queue = true;
        provider.sort_index = Some(sort_index);
        provider
    }

    async fn start_proxy(db: Arc<Database>) -> (ProxyServer, String) {
        let proxy = ProxyServer::new(
            ProxyConfig {
                listen_port: 0,
                ..Default::default()
            },
            db,
            None,
        );
        let info = proxy.start().await.expect("start proxy");
        let origin = format!("http://127.0.0.1:{}", info.port);
        (proxy, origin)
    }

    #[tokio::test]
    async fn codex_auxiliary_aliases_preserve_native_json_auth_query_and_image_models() {
        let replies = (0..12)
            .map(|index| {
                MockReply::typed(
                    http::StatusCode::CREATED,
                    json!({
                        "request_index": index,
                        "data": [{"b64_json": "OUTPUT-SENTINEL"}],
                        "usage": {"input_tokens": 3, "output_tokens": 1}
                    }),
                    "application/vnd.stackferry.auxiliary+json",
                )
            })
            .collect();
        let (upstream_origin, captured, upstream_handle) = spawn_upstream(replies).await;
        let db = Arc::new(Database::memory().expect("create database"));
        configure_codex_failover(db.as_ref(), 0, 5).await;
        let mut provider = queued_provider("aux-provider", "Aux Provider", &upstream_origin, 0);
        provider.settings_config["env"] = json!({
            "ANTHROPIC_MODEL": "mapped-search-model"
        });
        db.save_provider("codex", &provider).expect("save provider");
        let (proxy, proxy_origin) = start_proxy(db).await;
        let aliases = [
            ("/alpha/search", "/v1/alpha/search", "search-model"),
            ("/v1/alpha/search", "/v1/alpha/search", "search-model"),
            ("/v1/v1/alpha/search", "/v1/alpha/search", "search-model"),
            ("/codex/v1/alpha/search", "/v1/alpha/search", "search-model"),
            (
                "/images/generations",
                "/v1/images/generations",
                "gpt-image-2",
            ),
            (
                "/v1/images/generations",
                "/v1/images/generations",
                "gpt-image-2",
            ),
            (
                "/v1/v1/images/generations",
                "/v1/images/generations",
                "gpt-image-2",
            ),
            (
                "/codex/v1/images/generations",
                "/v1/images/generations",
                "gpt-image-2",
            ),
            ("/images/edits", "/v1/images/edits", "gpt-image-2"),
            ("/v1/images/edits", "/v1/images/edits", "gpt-image-2"),
            ("/v1/v1/images/edits", "/v1/images/edits", "gpt-image-2"),
            ("/codex/v1/images/edits", "/v1/images/edits", "gpt-image-2"),
        ];
        let client = reqwest::Client::new();

        for (index, (alias, _, model)) in aliases.iter().enumerate() {
            let response = client
                .post(format!("{proxy_origin}{alias}?case={index}&format=png"))
                .header("authorization", "Bearer client-secret")
                .header("content-type", "application/json")
                .header("x-required-header", "preserved")
                .body(
                    serde_json::to_vec(&json!({
                        "model": model,
                        "prompt": "bounded prompt",
                        "image": "data:image/png;base64,INPUT-SENTINEL",
                        "_opaque": {"must": "survive"}
                    }))
                    .unwrap(),
                )
                .send()
                .await
                .expect("send auxiliary request");
            assert_eq!(response.status(), http::StatusCode::CREATED);
            assert_eq!(
                response
                    .headers()
                    .get("content-type")
                    .and_then(|value| value.to_str().ok()),
                Some("application/vnd.stackferry.auxiliary+json")
            );
            let body = response.json::<Value>().await.expect("parse response");
            assert_eq!(body["request_index"], index);
            assert_eq!(body["data"][0]["b64_json"], "OUTPUT-SENTINEL");
        }

        proxy.stop().await.expect("stop proxy");
        upstream_handle.abort();

        let captured = captured.lock().await;
        assert_eq!(captured.len(), aliases.len());
        for (index, (request, (_, expected_path, model))) in
            captured.iter().zip(aliases.iter()).enumerate()
        {
            assert_eq!(request.method, http::Method::POST);
            assert_eq!(request.uri.path(), *expected_path);
            assert_eq!(
                request.uri.query(),
                Some(format!("case={index}&format=png").as_str())
            );
            assert_eq!(
                request
                    .headers
                    .get("authorization")
                    .and_then(|value| value.to_str().ok()),
                Some("Bearer aux-provider-secret")
            );
            assert_eq!(
                request
                    .headers
                    .get("x-required-header")
                    .and_then(|value| value.to_str().ok()),
                Some("preserved")
            );
            let expected_model = if expected_path.ends_with("alpha/search") {
                "mapped-search-model"
            } else {
                model
            };
            assert_eq!(request.body["model"], *expected_model);
            assert_eq!(request.body["_opaque"]["must"], "survive");
            assert_eq!(
                request.body["image"],
                "data:image/png;base64,INPUT-SENTINEL"
            );
            assert!(!request
                .headers
                .values()
                .filter_map(|value| value.to_str().ok())
                .any(|value| value.contains("client-secret")));
        }
    }

    #[tokio::test]
    async fn auxiliary_capability_misses_fail_over_without_mutating_main_health_or_target() {
        let (p1_origin, p1_requests, p1_handle) = spawn_upstream(vec![
            MockReply::json(http::StatusCode::NOT_FOUND, json!({"code": 404})),
            MockReply::json(http::StatusCode::METHOD_NOT_ALLOWED, json!({"code": 405})),
            MockReply::json(http::StatusCode::NOT_IMPLEMENTED, json!({"code": 501})),
        ])
        .await;
        let (p2_origin, p2_requests, p2_handle) = spawn_upstream(vec![
            MockReply::json(http::StatusCode::OK, json!({"served_by": "p2"})),
            MockReply::json(http::StatusCode::OK, json!({"served_by": "p2"})),
            MockReply::json(http::StatusCode::OK, json!({"served_by": "p2"})),
        ])
        .await;
        let db = Arc::new(Database::memory().expect("create database"));
        configure_codex_failover(db.as_ref(), 1, 5).await;
        let p1 = queued_provider("capability-p1", "Capability P1", &p1_origin, 0);
        let p2 = queued_provider("capability-p2", "Capability P2", &p2_origin, 1);
        db.save_provider("codex", &p1).expect("save p1");
        db.save_provider("codex", &p2).expect("save p2");
        db.set_current_provider("codex", &p1.id)
            .expect("set current provider");
        let (proxy, proxy_origin) = start_proxy(db.clone()).await;
        proxy
            .state
            .current_providers
            .write()
            .await
            .insert("codex".to_string(), (p1.id.clone(), p1.name.clone()));
        let client = reqwest::Client::new();

        for endpoint in ["/alpha/search", "/images/generations", "/images/edits"] {
            let response = client
                .post(format!("{proxy_origin}{endpoint}"))
                .json(&json!({"model": "gpt-image-2", "prompt": "capability"}))
                .send()
                .await
                .expect("send capability request");
            assert_eq!(response.status(), http::StatusCode::OK);
            assert_eq!(response.json::<Value>().await.unwrap()["served_by"], "p2");
        }

        proxy.stop().await.expect("stop proxy");
        p1_handle.abort();
        p2_handle.abort();
        assert_eq!(p1_requests.lock().await.len(), 3);
        assert_eq!(p2_requests.lock().await.len(), 3);
        let health = db
            .get_provider_health(&p1.id, "codex")
            .await
            .expect("read health");
        assert_eq!(health.consecutive_failures, 0);
        assert!(health.last_failure_at.is_none());
        assert_eq!(
            db.get_current_provider("codex").expect("read current"),
            Some(p1.id.clone())
        );
        assert_eq!(
            proxy
                .state
                .current_providers
                .read()
                .await
                .get("codex")
                .cloned(),
            Some((p1.id, p1.name))
        );
    }

    #[tokio::test]
    async fn auxiliary_client_errors_do_not_fan_out_or_pollute_provider_health() {
        let (p1_origin, p1_requests, p1_handle) = spawn_upstream(vec![
            MockReply::json(http::StatusCode::BAD_REQUEST, json!({"code": 400})),
            MockReply::json(http::StatusCode::UNPROCESSABLE_ENTITY, json!({"code": 422})),
        ])
        .await;
        let (p2_origin, p2_requests, p2_handle) = spawn_upstream(Vec::new()).await;
        let db = Arc::new(Database::memory().expect("create database"));
        configure_codex_failover(db.as_ref(), 1, 5).await;
        let p1 = queued_provider("client-error-p1", "Client Error P1", &p1_origin, 0);
        let p2 = queued_provider("client-error-p2", "Client Error P2", &p2_origin, 1);
        db.save_provider("codex", &p1).expect("save p1");
        db.save_provider("codex", &p2).expect("save p2");
        let (proxy, proxy_origin) = start_proxy(db.clone()).await;
        let client = reqwest::Client::new();

        for (endpoint, status) in [
            ("/alpha/search", http::StatusCode::BAD_REQUEST),
            (
                "/images/generations",
                http::StatusCode::UNPROCESSABLE_ENTITY,
            ),
        ] {
            let response = client
                .post(format!("{proxy_origin}{endpoint}"))
                .json(&json!({"model": "gpt-image-2", "prompt": "invalid"}))
                .send()
                .await
                .expect("send client error request");
            assert_eq!(response.status(), status);
        }

        proxy.stop().await.expect("stop proxy");
        p1_handle.abort();
        p2_handle.abort();
        assert_eq!(p1_requests.lock().await.len(), 2);
        assert_eq!(p2_requests.lock().await.len(), 0);
        let health = db
            .get_provider_health(&p1.id, "codex")
            .await
            .expect("read health");
        assert_eq!(health.consecutive_failures, 0);
        assert!(health.last_failure_at.is_none());
    }

    #[tokio::test]
    async fn ambiguous_paid_image_timeout_is_not_replayed() {
        let (p1_origin, p1_requests, p1_handle) = spawn_upstream(vec![MockReply::delayed(
            http::StatusCode::OK,
            json!({"data": [{"url": "https://example.test/generated.png"}]}),
            Duration::from_secs(3),
        )])
        .await;
        let (p2_origin, p2_requests, p2_handle) = spawn_upstream(vec![MockReply::json(
            http::StatusCode::OK,
            json!({"data": [{"url": "https://example.test/duplicate.png"}]}),
        )])
        .await;
        let db = Arc::new(Database::memory().expect("create database"));
        configure_codex_failover(db.as_ref(), 1, 1).await;
        let p1 = queued_provider("timeout-p1", "Timeout P1", &p1_origin, 0);
        let p2 = queued_provider("timeout-p2", "Timeout P2", &p2_origin, 1);
        db.save_provider("codex", &p1).expect("save p1");
        db.save_provider("codex", &p2).expect("save p2");
        let (proxy, proxy_origin) = start_proxy(db.clone()).await;

        let response = reqwest::Client::new()
            .post(format!("{proxy_origin}/images/generations"))
            .header("authorization", "Bearer client-secret")
            .json(&json!({
                "model": "gpt-image-2",
                "prompt": "PRIVATE-PROMPT-SENTINEL"
            }))
            .send()
            .await
            .expect("send timeout request");
        assert_eq!(response.status(), http::StatusCode::BAD_GATEWAY);
        let response_text = response.text().await.expect("read timeout response");
        assert!(response_text.contains("未自动重放"));
        assert!(!response_text.contains("PRIVATE-PROMPT-SENTINEL"));
        assert!(!response_text.contains("client-secret"));

        proxy.stop().await.expect("stop proxy");
        p1_handle.abort();
        p2_handle.abort();
        assert_eq!(p1_requests.lock().await.len(), 1);
        assert_eq!(p2_requests.lock().await.len(), 0);
    }

    #[tokio::test]
    async fn paid_images_skip_unhealthy_providers_and_reject_when_none_are_safe() {
        let (p1_origin, p1_requests, p1_handle) = spawn_upstream(Vec::new()).await;
        let (p2_origin, p2_requests, p2_handle) = spawn_upstream(vec![MockReply::json(
            http::StatusCode::OK,
            json!({"served_by": "healthy-p2"}),
        )])
        .await;
        let db = Arc::new(Database::memory().expect("create database"));
        configure_codex_failover(db.as_ref(), 1, 5).await;
        let p1 = queued_provider("unhealthy-p1", "Unhealthy P1", &p1_origin, 0);
        let p2 = queued_provider("healthy-p2", "Healthy P2", &p2_origin, 1);
        db.save_provider("codex", &p1).expect("save p1");
        db.save_provider("codex", &p2).expect("save p2");
        db.update_provider_health_with_threshold(
            &p1.id,
            "codex",
            false,
            Some("persisted failure".to_string()),
            1,
        )
        .await
        .expect("mark p1 unhealthy");
        let (proxy, proxy_origin) = start_proxy(db.clone()).await;

        let activation = proxy
            .select_failover_activation_provider("codex")
            .await
            .expect("select activation provider");
        assert_eq!(activation.id, p2.id);
        let response = reqwest::Client::new()
            .post(format!("{proxy_origin}/images/edits"))
            .json(&json!({
                "model": "gpt-image-2",
                "prompt": "edit",
                "image": "data:image/png;base64,INPUT"
            }))
            .send()
            .await
            .expect("send healthy image request");
        assert_eq!(response.status(), http::StatusCode::OK);
        assert_eq!(
            response.json::<Value>().await.unwrap()["served_by"],
            "healthy-p2"
        );
        db.update_provider_health_with_threshold(
            &p2.id,
            "codex",
            false,
            Some("persisted failure".to_string()),
            1,
        )
        .await
        .expect("mark p2 unhealthy");
        let response = reqwest::Client::new()
            .post(format!("{proxy_origin}/images/generations"))
            .json(&json!({"model": "gpt-image-2", "prompt": "blocked"}))
            .send()
            .await
            .expect("send unsafe image request");
        assert_eq!(response.status(), http::StatusCode::SERVICE_UNAVAILABLE);
        assert!(response
            .text()
            .await
            .unwrap()
            .contains("没有可安全处理付费图片请求的供应商"));

        proxy.stop().await.expect("stop proxy");
        p1_handle.abort();
        p2_handle.abort();
        assert_eq!(p1_requests.lock().await.len(), 0);
        assert_eq!(p2_requests.lock().await.len(), 1);
    }
}

/// 代理HTTP服务器
pub struct ProxyServer {
    config: ProxyConfig,
    state: ProxyState,
    shutdown_tx: Arc<RwLock<Option<oneshot::Sender<()>>>>,
    /// 服务器任务句柄，用于等待服务器实际关闭
    server_handle: Arc<RwLock<Option<JoinHandle<()>>>>,
}

impl ProxyServer {
    pub fn new(
        config: ProxyConfig,
        db: Arc<Database>,
        app_handle: Option<tauri::AppHandle>,
    ) -> Self {
        // 创建共享的 ProviderRouter（熔断器状态将跨所有请求保持）
        let provider_router = Arc::new(ProviderRouter::new(db.clone()));
        // 创建故障转移切换管理器
        let failover_manager = Arc::new(FailoverSwitchManager::new(db.clone()));

        let state = ProxyState {
            db,
            config: Arc::new(RwLock::new(config.clone())),
            status: Arc::new(RwLock::new(ProxyStatus::default())),
            start_time: Arc::new(RwLock::new(None)),
            current_providers: Arc::new(RwLock::new(std::collections::HashMap::new())),
            provider_router,
            gemini_shadow: Arc::new(GeminiShadowStore::default()),
            codex_chat_history: Arc::new(CodexChatHistoryStore::default()),
            app_handle,
            failover_manager,
        };

        Self {
            config,
            state,
            shutdown_tx: Arc::new(RwLock::new(None)),
            server_handle: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn start(&self) -> Result<ProxyServerInfo, ProxyError> {
        // 检查是否已在运行
        if self.shutdown_tx.read().await.is_some() {
            return Err(ProxyError::AlreadyRunning);
        }

        let addr: SocketAddr =
            format!("{}:{}", self.config.listen_address, self.config.listen_port)
                .parse()
                .map_err(|e| ProxyError::BindFailed(format!("无效的地址: {e}")))?;

        // 创建关闭通道
        let (shutdown_tx, shutdown_rx) = oneshot::channel();

        // 构建路由
        let app = self.build_router();

        // 绑定监听器
        let listener = tokio::net::TcpListener::bind(&addr)
            .await
            .map_err(|e| ProxyError::BindFailed(e.to_string()))?;
        let local_addr = listener
            .local_addr()
            .map_err(|e| ProxyError::BindFailed(e.to_string()))?;
        let actual_port = local_addr.port();

        log::info!("[{}] 代理服务器启动于 {local_addr}", log_srv::STARTED);

        // 更新全局代理端口，用于系统代理检测
        crate::proxy::http_client::set_proxy_port(actual_port);

        // 保存关闭句柄
        *self.shutdown_tx.write().await = Some(shutdown_tx);

        // 更新状态
        let mut status = self.state.status.write().await;
        status.running = true;
        status.address = self.config.listen_address.clone();
        status.port = actual_port;
        drop(status);

        // 记录启动时间
        *self.state.start_time.write().await = Some(std::time::Instant::now());

        // 启动服务器 — 使用手动 hyper HTTP/1.1 accept loop
        // 开启 preserve_header_case 以捕获客户端请求头的原始大小写
        let state = self.state.clone();
        let handle = tokio::spawn(async move {
            let mut shutdown_rx = shutdown_rx;
            loop {
                tokio::select! {
                    result = listener.accept() => {
                        let (stream, _remote_addr) = match result {
                            Ok(v) => v,
                            Err(e) => {
                                log::error!("[{SRV}] accept 失败: {e}", SRV = log_srv::ACCEPT_ERR);
                                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                                continue;
                            }
                        };

                        let app = app.clone();
                        tokio::spawn(async move {
                            // Peek raw TCP bytes to capture original header casing
                            // before hyper parses (and lowercases) the header names.
                            let original_cases = {
                                let mut peek_buf = vec![0u8; 8192];
                                match stream.peek(&mut peek_buf).await {
                                    Ok(n) => {
                                        let cases = super::hyper_client::OriginalHeaderCases::from_raw_bytes(&peek_buf[..n]);
                                        log::debug!(
                                            "[ProxyServer] Peeked {} bytes, captured {} header casings",
                                            n, cases.cases.len()
                                        );
                                        cases
                                    }
                                    Err(e) => {
                                        log::debug!("[ProxyServer] peek failed (non-fatal): {e}");
                                        super::hyper_client::OriginalHeaderCases::default()
                                    }
                                }
                            };

                            // service_fn 将 axum Router（tower::Service）桥接到 hyper
                            let service = hyper::service::service_fn(move |req: hyper::Request<hyper::body::Incoming>| {
                                let mut router = app.clone();
                                let cases = original_cases.clone();
                                async move {
                                    // 将 hyper::body::Incoming 转为 axum::body::Body，保留 extensions
                                    let (mut parts, body) = req.into_parts();

                                    // Insert our own header case map alongside hyper's internal one
                                    parts.extensions.insert(cases);

                                    let body = axum::body::Body::new(body);
                                    let axum_req = http::Request::from_parts(parts, body);
                                    <Router as tower::Service<http::Request<axum::body::Body>>>::call(&mut router, axum_req).await
                                }
                            });

                            if let Err(e) = hyper::server::conn::http1::Builder::new()
                                .preserve_header_case(true)
                                .serve_connection(TokioIo::new(stream), service)
                                .await
                            {
                                // Connection reset / broken pipe 等在代理场景下很常见，debug 级别
                                log::debug!("[{SRV}] connection error: {e}", SRV = log_srv::CONN_ERR);
                            }
                        });
                    }
                    _ = &mut shutdown_rx => {
                        break;
                    }
                }
            }

            // 服务器停止后更新状态
            state.status.write().await.running = false;
            *state.start_time.write().await = None;
        });

        // 保存服务器任务句柄
        *self.server_handle.write().await = Some(handle);

        Ok(ProxyServerInfo {
            address: self.config.listen_address.clone(),
            port: actual_port,
            started_at: chrono::Utc::now().to_rfc3339(),
        })
    }

    pub async fn stop(&self) -> Result<(), ProxyError> {
        // 1. 发送关闭信号
        if let Some(tx) = self.shutdown_tx.write().await.take() {
            let _ = tx.send(());
        } else {
            return Err(ProxyError::NotRunning);
        }

        // 2. 等待服务器任务结束（带 5 秒超时保护）
        if let Some(handle) = self.server_handle.write().await.take() {
            match tokio::time::timeout(std::time::Duration::from_secs(5), handle).await {
                Ok(Ok(())) => {
                    log::info!("[{}] 代理服务器已完全停止", log_srv::STOPPED);
                    Ok(())
                }
                Ok(Err(e)) => {
                    log::warn!("[{}] 代理服务器任务异常终止: {e}", log_srv::TASK_ERROR);
                    Err(ProxyError::StopFailed(e.to_string()))
                }
                Err(_) => {
                    log::warn!(
                        "[{}] 代理服务器停止超时（5秒），强制继续",
                        log_srv::STOP_TIMEOUT
                    );
                    Err(ProxyError::StopTimeout)
                }
            }
        } else {
            Ok(())
        }
    }

    pub async fn get_status(&self) -> ProxyStatus {
        let mut status = self.state.status.read().await.clone();

        // 计算运行时间
        if let Some(start) = *self.state.start_time.read().await {
            status.uptime_seconds = start.elapsed().as_secs();
        }

        // 从 current_providers HashMap 获取每个应用类型当前正在使用的 provider
        let current_providers = self.state.current_providers.read().await;
        status.active_targets = current_providers
            .iter()
            .map(|(app_type, (provider_id, provider_name))| ActiveTarget {
                app_type: app_type.clone(),
                provider_id: provider_id.clone(),
                provider_name: provider_name.clone(),
            })
            .collect();

        status
    }

    /// 更新某个应用类型当前“目标供应商”（用于 UI 展示 active_targets）
    ///
    /// 注意：这不代表该供应商一定已经处理过请求，而是用于“热切换/启用故障转移立即切 P1”
    /// 等场景下，让 UI 能立刻反映最新目标。
    pub async fn set_active_target(&self, app_type: &str, provider_id: &str, provider_name: &str) {
        let mut current_providers = self.state.current_providers.write().await;
        current_providers.insert(
            app_type.to_string(),
            (provider_id.to_string(), provider_name.to_string()),
        );
    }

    fn build_router(&self) -> Router {
        Router::new()
            // 健康检查
            .route("/health", get(handlers::health_check))
            .route("/status", get(handlers::get_status))
            // Claude API (支持带前缀和不带前缀两种格式)
            .route("/v1/messages", post(handlers::handle_messages))
            .route("/claude/v1/messages", post(handlers::handle_messages))
            // Claude Desktop 3P 本地 gateway（独立 provider namespace）
            .route(
                "/claude-desktop/v1/models",
                get(handlers::handle_claude_desktop_models),
            )
            .route(
                "/claude-desktop/v1/messages",
                post(handlers::handle_claude_desktop_messages),
            )
            // OpenAI Chat Completions API (Codex CLI，支持带前缀和不带前缀)
            .route("/chat/completions", post(handlers::handle_chat_completions))
            .route(
                "/v1/chat/completions",
                post(handlers::handle_chat_completions),
            )
            .route(
                "/v1/v1/chat/completions",
                post(handlers::handle_chat_completions),
            )
            .route(
                "/codex/v1/chat/completions",
                post(handlers::handle_chat_completions),
            )
            .route("/alpha/search", post(handlers::handle_alpha_search))
            .route("/v1/alpha/search", post(handlers::handle_alpha_search))
            .route("/v1/v1/alpha/search", post(handlers::handle_alpha_search))
            .route(
                "/codex/v1/alpha/search",
                post(handlers::handle_alpha_search),
            )
            .route(
                "/images/generations",
                post(handlers::handle_image_generations),
            )
            .route(
                "/v1/images/generations",
                post(handlers::handle_image_generations),
            )
            .route(
                "/v1/v1/images/generations",
                post(handlers::handle_image_generations),
            )
            .route(
                "/codex/v1/images/generations",
                post(handlers::handle_image_generations),
            )
            .route("/images/edits", post(handlers::handle_image_edits))
            .route("/v1/images/edits", post(handlers::handle_image_edits))
            .route("/v1/v1/images/edits", post(handlers::handle_image_edits))
            .route("/codex/v1/images/edits", post(handlers::handle_image_edits))
            // OpenAI Models API (Codex CLI reachability check)
            .route("/models", get(handlers::handle_models))
            .route("/v1/models", get(handlers::handle_models))
            // OpenAI Responses API (Codex CLI，支持带前缀和不带前缀)
            .route("/responses", post(handlers::handle_responses))
            .route("/v1/responses", post(handlers::handle_responses))
            .route("/v1/v1/responses", post(handlers::handle_responses))
            .route("/codex/v1/responses", post(handlers::handle_responses))
            // Grok Build uses the Responses protocol but has an independent
            // provider namespace and failover queue.
            .route(
                "/grokbuild/v1/responses",
                post(handlers::handle_grokbuild_responses),
            )
            // OpenAI Responses Compact API (Codex CLI 远程压缩，透传)
            .route(
                "/responses/compact",
                post(handlers::handle_responses_compact),
            )
            .route(
                "/v1/responses/compact",
                post(handlers::handle_responses_compact),
            )
            .route(
                "/v1/v1/responses/compact",
                post(handlers::handle_responses_compact),
            )
            .route(
                "/codex/v1/responses/compact",
                post(handlers::handle_responses_compact),
            )
            .route(
                "/grokbuild/v1/responses/compact",
                post(handlers::handle_grokbuild_responses_compact),
            )
            // Gemini API (支持带前缀和不带前缀)
            //
            // 用 `any(..)` 覆盖所有 HTTP 方法：除了 POST `:generateContent` /
            // `:streamGenerateContent` / `:countTokens` 之外，Gemini SDK / CLI 还会发
            // GET `/models`、GET `/models/<id>` 等只读端点。如果只挂 POST，这些 GET
            // 请求会在路由层 404，绕过本地代理的统计、整流和故障转移。
            .route("/v1beta/*path", any(handlers::handle_gemini))
            .route("/gemini/v1beta/*path", any(handlers::handle_gemini))
            // Gemini 的 GA 版本也叫 /v1，给原 SDK 留一条出口
            .route("/gemini/v1/*path", any(handlers::handle_gemini))
            // 提高默认请求体大小限制（避免 413 Payload Too Large）
            .layer(DefaultBodyLimit::max(200 * 1024 * 1024))
            .with_state(self.state.clone())
    }

    /// 在不重启服务的情况下更新运行时配置
    pub async fn apply_runtime_config(&self, config: &ProxyConfig) {
        *self.state.config.write().await = config.clone();
    }

    /// 热更新熔断器配置
    ///
    /// 将新配置应用到所有已创建的熔断器实例
    pub async fn update_circuit_breaker_configs(
        &self,
        config: super::circuit_breaker::CircuitBreakerConfig,
    ) {
        self.state.provider_router.update_all_configs(config).await;
    }

    pub async fn update_circuit_breaker_config_for_app(
        &self,
        app_type: &str,
        config: super::circuit_breaker::CircuitBreakerConfig,
    ) {
        self.state
            .provider_router
            .update_app_configs(app_type, config)
            .await;
    }

    /// 重置指定 Provider 的熔断器
    pub async fn reset_provider_circuit_breaker(&self, provider_id: &str, app_type: &str) {
        self.state
            .provider_router
            .reset_provider_breaker(provider_id, app_type)
            .await;
    }

    pub async fn select_failover_activation_provider(
        &self,
        app_type: &str,
    ) -> Result<crate::provider::Provider, crate::error::AppError> {
        self.state
            .provider_router
            .select_failover_activation_provider(app_type)
            .await
    }
}
