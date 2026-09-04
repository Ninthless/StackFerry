//! 响应处理器模块
//!
//! 统一处理流式和非流式 API 响应

use super::{
    content_encoding::{decompress_body, get_content_encoding},
    forwarder::ActiveConnectionGuard,
    handler_config::{StreamUsageEventFilter, UsageParserConfig},
    handler_context::{RequestContext, StreamingTimeoutConfig},
    hyper_client::ProxyResponse,
    server::ProxyState,
    sse::{strip_sse_field, take_sse_block},
    usage::parser::TokenUsage,
    ProxyError,
};
use crate::database::PRICING_SOURCE_REQUEST;
use axum::http::{header::HeaderMap, HeaderName};
use axum::response::{IntoResponse, Response};
use bytes::Bytes;
use futures::stream::{Stream, StreamExt};
use serde_json::Value;
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::sync::Mutex;

// ============================================================================
// 响应头处理
// ============================================================================

/// RFC 2616 / RFC 7230 中定义的不应被代理继续转发的响应头。
const HOP_BY_HOP_RESPONSE_HEADERS: &[&str] = &[
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "proxy-connection",
    "te",
    "trailer",
    "trailers",
    "transfer-encoding",
    "upgrade",
];

/// 移除响应侧 hop-by-hop 头，以及 `Connection` 中点名的扩展头。
pub(crate) fn strip_hop_by_hop_response_headers(headers: &mut HeaderMap) {
    let connection_listed_headers: Vec<HeaderName> = headers
        .get_all(axum::http::header::CONNECTION)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(','))
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .filter_map(|name| HeaderName::from_bytes(name.as_bytes()).ok())
        .collect();

    for name in HOP_BY_HOP_RESPONSE_HEADERS {
        headers.remove(*name);
    }

    for name in connection_listed_headers {
        headers.remove(name);
    }
}

/// 移除在重建响应体后会失真的实体头。
pub(crate) fn strip_entity_headers_for_rebuilt_body(headers: &mut HeaderMap) {
    headers.remove(axum::http::header::CONTENT_ENCODING);
    headers.remove(axum::http::header::CONTENT_LENGTH);
    headers.remove(axum::http::header::TRANSFER_ENCODING);
}

/// 读取响应体并在需要时解压，确保 headers 与返回 body 一致。
///
/// `body_timeout`: 整包超时。当非零时用 `tokio::time::timeout` 包住 `.bytes()` 调用，
/// 防止上游发完响应头后卡住 body 导致请求永远挂住。
/// 传入 `Duration::ZERO` 表示不启用超时（故障转移关闭时）。
pub(crate) async fn read_decoded_body(
    response: ProxyResponse,
    tag: &str,
    body_timeout: Duration,
) -> Result<(HeaderMap, http::StatusCode, Bytes), ProxyError> {
    let mut headers = response.headers().clone();
    let status = response.status();
    let raw_bytes = if body_timeout.is_zero() {
        response.bytes().await?
    } else {
        tokio::time::timeout(body_timeout, response.bytes())
            .await
            .map_err(|_| {
                ProxyError::Timeout(format!(
                    "响应体读取超时: {}s（上游发完响应头后 body 未到达）",
                    body_timeout.as_secs()
                ))
            })??
    };

    log::debug!(
        "[{tag}] 已接收上游响应体: status={}, bytes={}, headers={}",
        status.as_u16(),
        raw_bytes.len(),
        format_headers(&headers)
    );

    let mut body_bytes = raw_bytes.clone();
    let mut decoded = false;

    if let Some(encoding) = get_content_encoding(&headers) {
        log::debug!("[{tag}] 解压非流式响应: content-encoding={encoding}");
        match decompress_body(&encoding, &raw_bytes) {
            Ok(Some(decompressed)) => {
                body_bytes = Bytes::from(decompressed);
                decoded = true;
            }
            // 不支持的编码：原样透传且保留 content-encoding 头，
            // 让下游诊断/客户端知道这仍是压缩字节
            Ok(None) => {}
            Err(e) => {
                log::warn!("[{tag}] 解压失败 ({encoding}): {e}，使用原始数据");
            }
        }
    }

    if decoded {
        strip_entity_headers_for_rebuilt_body(&mut headers);
    }

    Ok((headers, status, body_bytes))
}

// ============================================================================
// 公共接口
// ============================================================================

/// 检测响应是否为 SSE 流式响应
#[inline]
pub fn is_sse_response(response: &ProxyResponse) -> bool {
    response.is_sse()
}

#[inline]
fn is_streaming_response(response: &ProxyResponse) -> bool {
    is_sse_response(response)
        || response
            .content_type()
            .and_then(|content_type| content_type.split(';').next())
            .is_some_and(|media_type| {
                media_type
                    .trim()
                    .eq_ignore_ascii_case("application/vnd.amazon.eventstream")
            })
}

fn is_bedrock_eventstream(response: &ProxyResponse) -> bool {
    response
        .content_type()
        .and_then(|content_type| content_type.split(';').next())
        .is_some_and(|media_type| {
            media_type
                .trim()
                .eq_ignore_ascii_case("application/vnd.amazon.eventstream")
        })
}

#[derive(Default)]
struct AwsEventStreamUsageDecoder {
    buffer: Vec<u8>,
}

impl AwsEventStreamUsageDecoder {
    const MIN_FRAME_BYTES: usize = 16;
    const MAX_FRAME_BYTES: usize = 32 * 1024 * 1024;

    fn push(&mut self, bytes: &[u8]) -> Vec<Value> {
        self.buffer.extend_from_slice(bytes);
        let mut payloads = Vec::new();
        loop {
            if self.buffer.len() < 12 {
                break;
            }
            let total_len = u32::from_be_bytes(self.buffer[0..4].try_into().unwrap()) as usize;
            let headers_len = u32::from_be_bytes(self.buffer[4..8].try_into().unwrap()) as usize;
            if !(Self::MIN_FRAME_BYTES..=Self::MAX_FRAME_BYTES).contains(&total_len)
                || headers_len > total_len.saturating_sub(Self::MIN_FRAME_BYTES)
            {
                log::warn!("[Pi] Invalid AWS EventStream frame length; usage inspection stopped");
                self.buffer.clear();
                break;
            }
            if self.buffer.len() < total_len {
                break;
            }
            let payload_start = 12 + headers_len;
            let payload_end = total_len - 4;
            if let Ok(value) =
                serde_json::from_slice::<Value>(&self.buffer[payload_start..payload_end])
            {
                payloads.push(value);
            }
            self.buffer.drain(..total_len);
        }
        payloads
    }
}

/// 处理流式响应
pub async fn handle_streaming(
    response: ProxyResponse,
    ctx: &RequestContext,
    state: &ProxyState,
    parser_config: &UsageParserConfig,
    connection_guard: Option<ActiveConnectionGuard>,
) -> Response {
    let status = response.status();
    log::debug!(
        "[{}] 已接收上游流式响应: status={}, headers={}",
        ctx.tag,
        status.as_u16(),
        format_headers(response.headers())
    );
    // 检查流式响应是否被压缩（SSE 通常不压缩，如果压缩则 SSE 解析会失败）
    if let Some(encoding) = get_content_encoding(response.headers()) {
        log::warn!(
            "[{}] 流式响应含 content-encoding={encoding}，SSE 解析可能失败。\
             上游在 accept-encoding 透传后压缩了 SSE 流。",
            ctx.tag
        );
    }

    let mut response_headers = response.headers().clone();
    strip_hop_by_hop_response_headers(&mut response_headers);

    let mut builder = axum::response::Response::builder().status(status);

    // 复制响应头
    for (key, value) in &response_headers {
        builder = builder.header(key, value);
    }

    let inspect_sse_events = is_sse_response(&response);
    let inspect_bedrock_events = is_bedrock_eventstream(&response);

    // 创建字节流
    let stream = response.bytes_stream();

    // 创建使用量收集器；关闭 usage logging 时不要在流式热路径上解析每个 SSE event。
    let usage_collector = (inspect_sse_events || inspect_bedrock_events)
        .then(|| create_usage_collector(ctx, state, status.as_u16(), parser_config))
        .flatten();

    // 获取流式超时配置
    let timeout_config = ctx.streaming_timeout_config();

    // 创建带日志和超时的透传流
    let logged_stream = create_logged_passthrough_stream(
        stream,
        ctx.tag,
        usage_collector,
        timeout_config,
        connection_guard,
        inspect_sse_events,
        inspect_bedrock_events,
    );

    let body = axum::body::Body::from_stream(logged_stream);
    match builder.body(body) {
        Ok(resp) => resp,
        Err(e) => {
            log::error!("[{}] 构建流式响应失败: {e}", ctx.tag);
            ProxyError::Internal(format!("Failed to build streaming response: {e}")).into_response()
        }
    }
}

/// 处理非流式响应
pub async fn handle_non_streaming(
    response: ProxyResponse,
    ctx: &RequestContext,
    state: &ProxyState,
    parser_config: &UsageParserConfig,
    // guard 在函数 scope 内持有，整包响应读取完成后随函数返回一并 drop
    _connection_guard: Option<ActiveConnectionGuard>,
) -> Result<Response, ProxyError> {
    // 整包超时：仅在故障转移开启且配置值非零时生效
    let body_timeout =
        if ctx.app_config.auto_failover_enabled && ctx.app_config.non_streaming_timeout > 0 {
            Duration::from_secs(ctx.app_config.non_streaming_timeout as u64)
        } else {
            Duration::ZERO
        };
    let (mut response_headers, status, body_bytes) =
        read_decoded_body(response, ctx.tag, body_timeout).await?;
    strip_hop_by_hop_response_headers(&mut response_headers);

    log::debug!(
        "[{}] 上游响应体已接收: bytes={} (content omitted)",
        ctx.tag,
        body_bytes.len()
    );

    // 解析并记录使用量。关闭 usage logging 时直接跳过，避免非流式响应整包 JSON parse。
    if usage_logging_enabled(state) {
        if let Ok(json_value) = serde_json::from_slice::<Value>(&body_bytes) {
            // 解析使用量
            if let Some(usage) = (parser_config.response_parser)(&json_value) {
                // 归因优先级：usage 解析出的模型 → 响应 model 字段 → 映射后的出站
                // 模型（路由接管真值）→ 客户端请求模型。空字符串视为缺失。
                let model = usage
                    .model
                    .clone()
                    .filter(|m| !m.is_empty())
                    .or_else(|| {
                        json_value
                            .get("model")
                            .and_then(|m| m.as_str())
                            .filter(|m| !m.is_empty())
                            .map(str::to_string)
                    })
                    .or_else(|| ctx.outbound_model.clone())
                    .unwrap_or_else(|| ctx.request_model.clone());

                spawn_log_usage(
                    state,
                    ctx,
                    usage,
                    &model,
                    &ctx.request_model,
                    status.as_u16(),
                    false,
                );
            } else {
                let model = json_value
                    .get("model")
                    .and_then(|m| m.as_str())
                    .filter(|m| !m.is_empty())
                    .map(str::to_string)
                    .or_else(|| ctx.outbound_model.clone())
                    .unwrap_or_else(|| ctx.request_model.clone());
                spawn_log_usage(
                    state,
                    ctx,
                    TokenUsage::default(),
                    &model,
                    &ctx.request_model,
                    status.as_u16(),
                    false,
                );
                log::debug!(
                    "[{}] 未能解析 usage 信息，跳过记录",
                    parser_config.app_type_str
                );
            }
        } else {
            log::debug!(
                "[{}] <<< 响应 (非 JSON): {} bytes",
                ctx.tag,
                body_bytes.len()
            );
            spawn_log_usage(
                state,
                ctx,
                TokenUsage::default(),
                ctx.outbound_model.as_deref().unwrap_or(&ctx.request_model),
                &ctx.request_model,
                status.as_u16(),
                false,
            );
        }
    } else {
        log::debug!("[{}] usage logging 已关闭，跳过非流式 usage 解析", ctx.tag);
    }

    // 构建响应
    let mut builder = axum::response::Response::builder().status(status);
    for (key, value) in response_headers.iter() {
        builder = builder.header(key, value);
    }

    let body = axum::body::Body::from(body_bytes);
    builder.body(body).map_err(|e| {
        log::error!("[{}] 构建响应失败: {e}", ctx.tag);
        ProxyError::Internal(format!("Failed to build response: {e}"))
    })
}

/// 通用响应处理入口
///
/// 根据响应类型自动选择流式或非流式处理
pub async fn process_response(
    response: ProxyResponse,
    ctx: &RequestContext,
    state: &ProxyState,
    parser_config: &UsageParserConfig,
    connection_guard: Option<ActiveConnectionGuard>,
) -> Result<Response, ProxyError> {
    if is_streaming_response(&response) {
        Ok(handle_streaming(response, ctx, state, parser_config, connection_guard).await)
    } else {
        handle_non_streaming(response, ctx, state, parser_config, connection_guard).await
    }
}

// ============================================================================
// SSE 使用量收集器
// ============================================================================

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum StreamFinishStatus {
    Complete,
    UpstreamFailed,
}

impl StreamFinishStatus {
    pub(crate) fn usage_status_code(self, upstream_status_code: u16) -> u16 {
        match self {
            Self::Complete => upstream_status_code,
            Self::UpstreamFailed => 500,
        }
    }
}

type UsageCallbackWithTiming =
    Arc<dyn Fn(Vec<Value>, Option<u64>, StreamFinishStatus) + Send + Sync + 'static>;

/// SSE 使用量收集器
#[derive(Clone)]
pub struct SseUsageCollector {
    inner: Arc<SseUsageCollectorInner>,
}

struct SseUsageCollectorInner {
    events: Mutex<Vec<Value>>,
    first_event_time: Mutex<Option<std::time::Instant>>,
    first_event_set: AtomicBool,
    start_time: std::time::Instant,
    on_complete: UsageCallbackWithTiming,
    should_collect: Option<StreamUsageEventFilter>,
    finished: AtomicBool,
    upstream_failed: AtomicBool,
}

impl SseUsageCollector {
    /// 创建使用量收集器；`should_collect` 用来在 hot path 跳过与 usage 无关的事件。
    pub fn new(
        start_time: std::time::Instant,
        should_collect: Option<StreamUsageEventFilter>,
        callback: impl Fn(Vec<Value>, Option<u64>, StreamFinishStatus) + Send + Sync + 'static,
    ) -> Self {
        let on_complete: UsageCallbackWithTiming = Arc::new(callback);
        Self {
            inner: Arc::new(SseUsageCollectorInner {
                events: Mutex::new(Vec::new()),
                first_event_time: Mutex::new(None),
                first_event_set: AtomicBool::new(false),
                start_time,
                on_complete,
                should_collect,
                finished: AtomicBool::new(false),
                upstream_failed: AtomicBool::new(false),
            }),
        }
    }

    pub fn should_collect(&self, data: &str) -> bool {
        self.inner
            .should_collect
            .map(|filter| filter(data))
            .unwrap_or(true)
    }

    /// 标记首个被收集的 SSE 事件时间，沿用 `first_token_ms` 的既有近似语义。
    async fn mark_first_collected_event_time(&self) {
        if self.inner.first_event_set.load(Ordering::Acquire) {
            return;
        }
        let mut first_time = self.inner.first_event_time.lock().await;
        if first_time.is_none() {
            *first_time = Some(std::time::Instant::now());
            self.inner.first_event_set.store(true, Ordering::Release);
        }
    }

    /// 推送 SSE 事件
    pub async fn push(&self, event: Value) {
        self.mark_first_collected_event_time().await;
        let mut events = self.inner.events.lock().await;
        events.push(event);
    }

    fn mark_upstream_failed(&self) {
        self.inner.upstream_failed.store(true, Ordering::Release);
    }

    /// 完成收集并触发回调
    pub async fn finish(&self) {
        if self.inner.finished.swap(true, Ordering::SeqCst) {
            return;
        }

        let events = {
            let mut guard = self.inner.events.lock().await;
            std::mem::take(&mut *guard)
        };

        let first_token_ms = {
            let first_time = self.inner.first_event_time.lock().await;
            first_time.map(|t| (t - self.inner.start_time).as_millis() as u64)
        };

        let finish_status = if self.inner.upstream_failed.load(Ordering::Acquire) {
            StreamFinishStatus::UpstreamFailed
        } else {
            StreamFinishStatus::Complete
        };
        (self.inner.on_complete)(events, first_token_ms, finish_status);
    }
}

struct SseUsageFinishGuard {
    collector: Option<SseUsageCollector>,
}

impl SseUsageFinishGuard {
    fn new(collector: SseUsageCollector) -> Self {
        Self {
            collector: Some(collector),
        }
    }

    fn disarm(&mut self) {
        self.collector = None;
    }
}

impl Drop for SseUsageFinishGuard {
    fn drop(&mut self) {
        if let Some(collector) = self.collector.take() {
            if let Ok(handle) = tokio::runtime::Handle::try_current() {
                handle.spawn(async move {
                    collector.finish().await;
                });
            } else {
                log::warn!("SSE 用量收尾保护触发时 Tokio runtime 不可用，跳过异步 finish");
            }
        }
    }
}

// ============================================================================
// 内部辅助函数
// ============================================================================

/// 创建使用量收集器
pub(crate) fn create_usage_collector(
    ctx: &RequestContext,
    state: &ProxyState,
    status_code: u16,
    parser_config: &UsageParserConfig,
) -> Option<SseUsageCollector> {
    let logging_enabled = state
        .config
        .try_read()
        .map(|c| c.enable_logging)
        .unwrap_or(true);
    if !logging_enabled {
        return None;
    }

    let state = state.clone();
    let provider_id = ctx.provider.id.clone();
    let request_model = ctx.request_model.clone();
    // 流式事件缺失模型名时的归因兜底：映射后的出站模型（路由接管真值）优先，
    // 其次才是客户端请求别名
    let fallback_model = ctx
        .outbound_model
        .clone()
        .unwrap_or_else(|| ctx.request_model.clone());
    // 用 ctx 的 app_type 而不是 parser_config 的：Claude Desktop 流式透传复用
    // CLAUDE_PARSER_CONFIG（app_type_str="claude"），按 parser_config 记账会把
    // claude-desktop 的行错记到 claude 名下，导致供应商计价覆盖解析不到。
    let app_type_str = ctx.app_type_str;
    let api_type = ctx.api_type.clone();
    let input_token_semantics = ctx.input_token_semantics;
    let tag = ctx.tag;
    let start_time = ctx.start_time;
    let stream_parser = parser_config.stream_parser;
    let model_extractor = parser_config.model_extractor;
    let session_id = ctx.session_id.clone();
    let thinking_effort = ctx.thinking_effort.clone();
    let route_trace = serialize_route_trace(ctx);

    Some(SseUsageCollector::new(
        start_time,
        parser_config.stream_event_filter,
        move |events, first_token_ms, finish_status| {
            let status_code = finish_status.usage_status_code(status_code);
            if let Some(usage) = stream_parser(&events) {
                let model = model_extractor(&events, &fallback_model);
                let latency_ms = start_time.elapsed().as_millis() as u64;

                let state = state.clone();
                let provider_id = provider_id.clone();
                let session_id = session_id.clone();
                let request_model = request_model.clone();
                let outbound_model = fallback_model.clone();
                let api_type = api_type.clone();
                let route_trace = route_trace.clone();
                let thinking_effort = thinking_effort.clone();

                tokio::spawn(async move {
                    log_usage_internal(
                        &state,
                        &provider_id,
                        app_type_str,
                        &api_type,
                        input_token_semantics,
                        &model,
                        &request_model,
                        &outbound_model,
                        usage,
                        latency_ms,
                        first_token_ms,
                        true, // is_streaming
                        status_code,
                        Some(session_id),
                        thinking_effort,
                        route_trace,
                    )
                    .await;
                });
            } else {
                let model = model_extractor(&events, &fallback_model);
                let latency_ms = start_time.elapsed().as_millis() as u64;
                let state = state.clone();
                let provider_id = provider_id.clone();
                let session_id = session_id.clone();
                let request_model = request_model.clone();
                let outbound_model = fallback_model.clone();
                let api_type = api_type.clone();
                let route_trace = route_trace.clone();
                let thinking_effort = thinking_effort.clone();

                tokio::spawn(async move {
                    log_usage_internal(
                        &state,
                        &provider_id,
                        app_type_str,
                        &api_type,
                        input_token_semantics,
                        &model,
                        &request_model,
                        &outbound_model,
                        TokenUsage::default(),
                        latency_ms,
                        first_token_ms,
                        true, // is_streaming
                        status_code,
                        Some(session_id),
                        thinking_effort,
                        route_trace,
                    )
                    .await;
                });
                log::debug!("[{tag}] 流式响应缺少 usage 统计，跳过消费记录");
            }
        },
    ))
}

/// 异步记录使用量
fn spawn_log_usage(
    state: &ProxyState,
    ctx: &RequestContext,
    usage: TokenUsage,
    model: &str,
    request_model: &str,
    status_code: u16,
    is_streaming: bool,
) {
    // Check enable_logging before spawning the log task
    if let Ok(config) = state.config.try_read() {
        if !config.enable_logging {
            return;
        }
    }

    let state = state.clone();
    let provider_id = ctx.provider.id.clone();
    let app_type_str = ctx.app_type_str.to_string();
    let api_type = ctx.api_type.clone();
    let input_token_semantics = ctx.input_token_semantics;
    let model = model.to_string();
    let request_model = request_model.to_string();
    // 「按请求计价」模式的锚点：映射后的出站模型，无映射时等于 request_model
    let outbound_model = ctx
        .outbound_model
        .clone()
        .unwrap_or_else(|| ctx.request_model.clone());
    let latency_ms = ctx.latency_ms();
    let session_id = ctx.session_id.clone();
    let thinking_effort = ctx.thinking_effort.clone();
    let route_trace = serialize_route_trace(ctx);

    tokio::spawn(async move {
        log_usage_internal(
            &state,
            &provider_id,
            &app_type_str,
            &api_type,
            input_token_semantics,
            &model,
            &request_model,
            &outbound_model,
            usage,
            latency_ms,
            None,
            is_streaming,
            status_code,
            Some(session_id),
            thinking_effort,
            route_trace,
        )
        .await;
    });
}

pub(crate) fn usage_logging_enabled(state: &ProxyState) -> bool {
    state
        .config
        .try_read()
        .map(|config| config.enable_logging)
        .unwrap_or(true)
}

/// 内部使用量记录函数
///
/// `outbound_model` 是「按请求计价」模式的锚点：实际发往上游的模型
/// （路由接管映射后的真值，无映射时等于 request_model）。该模式的语义是
/// 「按代理发出的请求计价、不信任上游回显」，接管场景下发出的请求模型是
/// 映射后的 Y 而非客户端别名 X，按 X 计价会用错定价表行。
#[allow(clippy::too_many_arguments)]
async fn log_usage_internal(
    state: &ProxyState,
    provider_id: &str,
    app_type: &str,
    api_type: &str,
    input_token_semantics: i64,
    model: &str,
    request_model: &str,
    outbound_model: &str,
    usage: TokenUsage,
    latency_ms: u64,
    first_token_ms: Option<u64>,
    is_streaming: bool,
    status_code: u16,
    session_id: Option<String>,
    thinking_effort: Option<crate::proxy::thinking_effort::ThinkingEffort>,
    route_trace: Option<String>,
) {
    use super::usage::logger::UsageLogger;

    let logger = UsageLogger::new(&state.db);
    let (multiplier, pricing_model_source) =
        logger.resolve_pricing_config(provider_id, app_type).await;
    let pricing_model = if pricing_model_source == PRICING_SOURCE_REQUEST {
        outbound_model
    } else {
        model
    };

    let dedup_scope = (app_type != "claude").then_some((app_type, provider_id));
    let request_id = usage.dedup_request_id(dedup_scope);

    log::debug!(
        "[{app_type}] 记录请求日志: id={request_id}, provider={provider_id}, model={model}, streaming={is_streaming}, status={status_code}, latency_ms={latency_ms}, first_token_ms={first_token_ms:?}, session={}, input={}, output={}, cache_read={}, cache_creation={}",
        session_id.as_deref().unwrap_or("none"),
        usage.input_tokens,
        usage.output_tokens,
        usage.cache_read_tokens,
        usage.cache_creation_tokens
    );

    if let Err(e) = logger.log_with_calculation(
        request_id,
        provider_id.to_string(),
        app_type.to_string(),
        api_type.to_string(),
        input_token_semantics,
        model.to_string(),
        request_model.to_string(),
        pricing_model.to_string(),
        usage,
        multiplier,
        latency_ms,
        first_token_ms,
        status_code,
        session_id,
        None, // provider_type
        is_streaming,
        route_trace,
        thinking_effort.as_ref().map(|effort| effort.value.clone()),
        thinking_effort.map(|effort| effort.source),
    ) {
        log::warn!("[USG-001] 记录使用量失败: {e}");
    }
}

fn serialize_route_trace(ctx: &RequestContext) -> Option<String> {
    ctx.route_trace
        .lock()
        .ok()
        .and_then(|trace| serde_json::to_string(&*trace).ok())
}

/// 创建带日志记录和超时控制的透传流
pub fn create_logged_passthrough_stream(
    stream: impl Stream<Item = Result<Bytes, std::io::Error>> + Send + 'static,
    tag: &'static str,
    usage_collector: Option<SseUsageCollector>,
    timeout_config: StreamingTimeoutConfig,
    connection_guard: Option<ActiveConnectionGuard>,
    inspect_sse_events: bool,
    inspect_bedrock_events: bool,
) -> impl Stream<Item = Result<Bytes, std::io::Error>> + Send {
    async_stream::stream! {
        let _conn_guard = connection_guard;
        let mut buffer = String::new();
        let mut utf8_remainder: Vec<u8> = Vec::new();
        let mut collector = usage_collector;
        let mut finish_guard = collector.clone().map(SseUsageFinishGuard::new);
        let inspect_sse_events = inspect_sse_events
            && (collector.is_some() || log::log_enabled!(log::Level::Debug));
        let inspect_bedrock_events = inspect_bedrock_events && collector.is_some();
        let mut bedrock_decoder = inspect_bedrock_events.then(AwsEventStreamUsageDecoder::default);
        let mut is_first_chunk = true;

        // 超时配置
        let first_byte_timeout = if timeout_config.first_byte_timeout > 0 {
            Some(Duration::from_secs(timeout_config.first_byte_timeout))
        } else {
            None
        };
        let idle_timeout = if timeout_config.idle_timeout > 0 {
            Some(Duration::from_secs(timeout_config.idle_timeout))
        } else {
            None
        };

        tokio::pin!(stream);

        loop {
            // 选择超时时间：首字节超时或静默期超时
            let timeout_duration = if is_first_chunk {
                first_byte_timeout
            } else {
                idle_timeout
            };

            let chunk_result = match timeout_duration {
                Some(duration) => {
                    match tokio::time::timeout(duration, stream.next()).await {
                        Ok(Some(chunk)) => Some(chunk),
                        Ok(None) => None, // 流结束
                        Err(_) => {
                            // 超时
                            let timeout_type = if is_first_chunk { "首字节" } else { "静默期" };
                            log::error!("[{tag}] 流式响应{}超时 ({}秒)", timeout_type, duration.as_secs());
                            if let Some(collector) = &collector {
                                collector.mark_upstream_failed();
                            }
                            yield Err(std::io::Error::other(format!("流式响应{timeout_type}超时")));
                            break;
                        }
                    }
                }
                None => stream.next().await, // 无超时限制
            };

            match chunk_result {
                Some(Ok(bytes)) => {
                    if is_first_chunk {
                        log::debug!(
                            "[{tag}] 已接收上游流式首包: bytes={}",
                            bytes.len()
                        );
                    }
                    is_first_chunk = false;
                    if inspect_sse_events {
                        crate::proxy::sse::append_utf8_safe(&mut buffer, &mut utf8_remainder, &bytes);

                        // 尝试解析并记录完整的 SSE 事件
                        while let Some(event_text) = take_sse_block(&mut buffer) {
                            if !event_text.trim().is_empty() {
                                // 提取 data 部分；只有 usage collector 存在时才解析 JSON。
                                for line in event_text.lines() {
                                    if let Some(data) = strip_sse_field(line, "data") {
                                        if data.trim() != "[DONE]" {
                                            let collected = match &collector {
                                                Some(c) if c.should_collect(data) => {
                                                    match serde_json::from_str::<Value>(data) {
                                                        Ok(json_value) => {
                                                            c.push(json_value).await;
                                                            true
                                                        }
                                                        Err(_) => false,
                                                    }
                                                }
                                                _ => false,
                                            };
                                            log::trace!(
                                                "[{tag}] <<< SSE data: bytes={}, usage_collected={collected} (content omitted)",
                                                data.len()
                                            );
                                        } else {
                                            log::debug!("[{tag}] <<< SSE: [DONE]");
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if let (Some(decoder), Some(collector)) = (&mut bedrock_decoder, &collector) {
                        for event in decoder.push(&bytes) {
                            collector.push(event).await;
                        }
                    }

                    yield Ok(bytes);
                }
                Some(Err(e)) => {
                    log::error!("[{tag}] 流错误: {e}");
                    if let Some(collector) = &collector {
                        collector.mark_upstream_failed();
                    }
                    yield Err(std::io::Error::other(e.to_string()));
                    break;
                }
                None => {
                    // 流正常结束
                    break;
                }
            }
        }

        if let Some(c) = collector.take() {
            c.finish().await;
        }
        if let Some(guard) = &mut finish_guard {
            guard.disarm();
        }
    }
}

fn is_safe_diagnostic_header(name: &str) -> bool {
    matches!(
        name,
        "content-type"
            | "content-encoding"
            | "content-length"
            | "retry-after"
            | "cf-ray"
            | "x-request-id"
            | "request-id"
            | "x-correlation-id"
    ) || name.starts_with("x-ratelimit-")
        || name.starts_with("ratelimit-")
}

fn bounded_header_value(value: &axum::http::HeaderValue) -> Option<String> {
    let value = value.to_str().ok()?;
    let mut bounded = value.chars().take(160).collect::<String>();
    if value.chars().count() > 160 {
        bounded.push('…');
    }
    Some(bounded)
}

fn format_headers(headers: &HeaderMap) -> String {
    let mut entries = headers
        .keys()
        .map(|key| {
            let name = key.as_str();
            if !is_safe_diagnostic_header(name) {
                return name.to_string();
            }

            let values = headers
                .get_all(key)
                .iter()
                .filter_map(bounded_header_value)
                .collect::<Vec<_>>();
            if values.is_empty() {
                name.to_string()
            } else {
                format!("{name}={}", values.join("|"))
            }
        })
        .collect::<Vec<_>>();
    entries.sort();
    format!("[{}]", entries.join(", "))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;
    use crate::error::AppError;
    use crate::provider::ProviderMeta;
    use crate::proxy::failover_switch::FailoverSwitchManager;
    use crate::proxy::provider_router::ProviderRouter;
    use crate::proxy::providers::{
        codex_chat_history::CodexChatHistoryStore, gemini_shadow::GeminiShadowStore,
    };
    use crate::proxy::runtime_route::RuntimeRouteTracker;
    use crate::proxy::types::{ProxyConfig, ProxyStatus};
    use rust_decimal::Decimal;
    use std::str::FromStr;
    use std::sync::{Arc, Mutex as StdMutex};
    use tokio::sync::RwLock;

    #[test]
    fn format_headers_keeps_only_allowlisted_diagnostic_values() {
        let mut headers = HeaderMap::new();
        headers.insert("authorization", "Bearer super-secret".parse().unwrap());
        headers.insert("set-cookie", "session=cookie-secret".parse().unwrap());
        headers.insert("retry-after", "30".parse().unwrap());
        headers.insert("x-ratelimit-remaining", "2".parse().unwrap());
        headers.insert("cf-ray", "abc123-SJC".parse().unwrap());

        let formatted = format_headers(&headers);
        assert!(formatted.contains("authorization"), "{formatted}");
        assert!(formatted.contains("set-cookie"), "{formatted}");
        assert!(formatted.contains("retry-after=30"), "{formatted}");
        assert!(formatted.contains("x-ratelimit-remaining=2"), "{formatted}");
        assert!(formatted.contains("cf-ray=abc123-SJC"), "{formatted}");
        assert!(!formatted.contains("super-secret"), "{formatted}");
        assert!(!formatted.contains("cookie-secret"), "{formatted}");
    }

    #[test]
    fn test_strip_sse_field_accepts_optional_space() {
        assert_eq!(
            super::strip_sse_field("data: {\"ok\":true}", "data"),
            Some("{\"ok\":true}")
        );
        assert_eq!(
            super::strip_sse_field("data:{\"ok\":true}", "data"),
            Some("{\"ok\":true}")
        );
        assert_eq!(
            super::strip_sse_field("event: message_start", "event"),
            Some("message_start")
        );
        assert_eq!(
            super::strip_sse_field("event:message_start", "event"),
            Some("message_start")
        );
        assert_eq!(super::strip_sse_field("id:1", "data"), None);
    }

    #[test]
    fn bedrock_eventstream_usage_decoder_handles_split_frames() {
        let payload = br#"{"metadata":{"usage":{"inputTokens":12,"outputTokens":3}}}"#;
        let total_len = (12 + payload.len() + 4) as u32;
        let mut frame = Vec::new();
        frame.extend_from_slice(&total_len.to_be_bytes());
        frame.extend_from_slice(&0u32.to_be_bytes());
        frame.extend_from_slice(&0u32.to_be_bytes());
        frame.extend_from_slice(payload);
        frame.extend_from_slice(&0u32.to_be_bytes());

        let split = frame.len() / 2;
        let mut decoder = AwsEventStreamUsageDecoder::default();
        assert!(decoder.push(&frame[..split]).is_empty());
        let events = decoder.push(&frame[split..]);
        assert_eq!(events.len(), 1);
        let usage = TokenUsage::from_bedrock_stream_events(&events).unwrap();
        assert_eq!(usage.input_tokens, 12);
        assert_eq!(usage.output_tokens, 3);
    }

    #[tokio::test]
    async fn interrupted_stream_marks_collected_usage_as_failed() {
        let observed = Arc::new(StdMutex::new(None));
        let callback_observed = observed.clone();
        let collector = SseUsageCollector::new(
            std::time::Instant::now(),
            None,
            move |events, _, finish_status| {
                *callback_observed.lock().unwrap() = Some((events.len(), finish_status));
            },
        );
        let upstream = futures::stream::iter(vec![
            Ok(Bytes::from_static(
                b"data: {\"type\":\"usage\",\"usage\":{\"input_tokens\":3}}\n\n",
            )),
            Err(std::io::Error::other("upstream reset")),
        ]);

        let output = create_logged_passthrough_stream(
            upstream,
            "test",
            Some(collector),
            StreamingTimeoutConfig {
                first_byte_timeout: 0,
                idle_timeout: 0,
            },
            None,
            true,
            false,
        )
        .collect::<Vec<_>>()
        .await;

        assert_eq!(output.len(), 2);
        assert!(output[0].is_ok());
        assert!(output[1].is_err());
        assert_eq!(
            *observed.lock().unwrap(),
            Some((1, StreamFinishStatus::UpstreamFailed))
        );
        assert_eq!(
            StreamFinishStatus::UpstreamFailed.usage_status_code(200),
            500
        );
    }

    #[test]
    fn test_strip_hop_by_hop_response_headers_removes_standard_headers() {
        let mut headers = HeaderMap::new();
        headers.insert(
            axum::http::header::CONNECTION,
            axum::http::HeaderValue::from_static("keep-alive"),
        );
        headers.insert(
            axum::http::header::HeaderName::from_static("keep-alive"),
            axum::http::HeaderValue::from_static("timeout=5"),
        );
        headers.insert(
            axum::http::header::TRANSFER_ENCODING,
            axum::http::HeaderValue::from_static("chunked"),
        );
        headers.insert(
            axum::http::header::HeaderName::from_static("proxy-connection"),
            axum::http::HeaderValue::from_static("keep-alive"),
        );
        headers.insert(
            axum::http::header::CONTENT_TYPE,
            axum::http::HeaderValue::from_static("application/json"),
        );
        headers.insert(
            axum::http::header::CONTENT_LENGTH,
            axum::http::HeaderValue::from_static("12"),
        );

        strip_hop_by_hop_response_headers(&mut headers);

        assert!(!headers.contains_key(axum::http::header::CONNECTION));
        assert!(!headers.contains_key("keep-alive"));
        assert!(!headers.contains_key(axum::http::header::TRANSFER_ENCODING));
        assert!(!headers.contains_key("proxy-connection"));
        assert_eq!(
            headers.get(axum::http::header::CONTENT_TYPE),
            Some(&axum::http::HeaderValue::from_static("application/json"))
        );
        assert_eq!(
            headers.get(axum::http::header::CONTENT_LENGTH),
            Some(&axum::http::HeaderValue::from_static("12"))
        );
    }

    #[test]
    fn test_strip_hop_by_hop_response_headers_removes_connection_listed_extensions() {
        let mut headers = HeaderMap::new();
        headers.append(
            axum::http::header::CONNECTION,
            axum::http::HeaderValue::from_static("x-trace-hop, x-debug-hop"),
        );
        headers.append(
            axum::http::header::CONNECTION,
            axum::http::HeaderValue::from_static("upgrade"),
        );
        headers.insert(
            axum::http::header::HeaderName::from_static("x-trace-hop"),
            axum::http::HeaderValue::from_static("trace"),
        );
        headers.insert(
            axum::http::header::HeaderName::from_static("x-debug-hop"),
            axum::http::HeaderValue::from_static("debug"),
        );
        headers.insert(
            axum::http::header::UPGRADE,
            axum::http::HeaderValue::from_static("websocket"),
        );
        headers.insert(
            axum::http::header::CONTENT_TYPE,
            axum::http::HeaderValue::from_static("text/event-stream"),
        );

        strip_hop_by_hop_response_headers(&mut headers);

        assert!(!headers.contains_key(axum::http::header::CONNECTION));
        assert!(!headers.contains_key("x-trace-hop"));
        assert!(!headers.contains_key("x-debug-hop"));
        assert!(!headers.contains_key(axum::http::header::UPGRADE));
        assert_eq!(
            headers.get(axum::http::header::CONTENT_TYPE),
            Some(&axum::http::HeaderValue::from_static("text/event-stream"))
        );
    }

    fn build_state(db: Arc<Database>) -> ProxyState {
        let status = Arc::new(RwLock::new(ProxyStatus::default()));
        ProxyState {
            db: db.clone(),
            config: Arc::new(RwLock::new(ProxyConfig::default())),
            status: status.clone(),
            start_time: Arc::new(RwLock::new(None)),
            runtime_routes: Arc::new(RuntimeRouteTracker::new(db.clone(), status, None)),
            provider_router: Arc::new(ProviderRouter::new(db.clone())),
            gemini_shadow: Arc::new(GeminiShadowStore::default()),
            codex_chat_history: Arc::new(CodexChatHistoryStore::default()),
            app_handle: None,
            failover_manager: Arc::new(FailoverSwitchManager::new(db)),
        }
    }

    fn seed_pricing(db: &Database) -> Result<(), AppError> {
        let conn = crate::database::lock_conn!(db.conn);
        conn.execute(
            "INSERT OR REPLACE INTO model_pricing (model_id, display_name, input_cost_per_million, output_cost_per_million)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["resp-model", "Resp Model", "1.0", "0"],
        )
        .map_err(|e| AppError::Database(e.to_string()))?;
        conn.execute(
            "INSERT OR REPLACE INTO model_pricing (model_id, display_name, input_cost_per_million, output_cost_per_million)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["req-model", "Req Model", "2.0", "0"],
        )
        .map_err(|e| AppError::Database(e.to_string()))?;
        Ok(())
    }

    fn insert_provider(
        db: &Database,
        id: &str,
        app_type: &str,
        meta: ProviderMeta,
    ) -> Result<(), AppError> {
        let meta_json =
            serde_json::to_string(&meta).map_err(|e| AppError::Database(e.to_string()))?;
        let conn = crate::database::lock_conn!(db.conn);
        conn.execute(
            "INSERT INTO providers (id, app_type, name, settings_config, meta)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![id, app_type, "Test Provider", "{}", meta_json],
        )
        .map_err(|e| AppError::Database(e.to_string()))?;
        Ok(())
    }

    #[tokio::test]
    async fn test_log_usage_uses_provider_override_config() -> Result<(), AppError> {
        let db = Arc::new(Database::memory()?);
        let app_type = "claude";

        db.set_default_cost_multiplier(app_type, "1.5").await?;
        db.set_pricing_model_source(app_type, "response").await?;
        seed_pricing(&db)?;

        let meta = ProviderMeta {
            cost_multiplier: Some("2".to_string()),
            pricing_model_source: Some("request".to_string()),
            ..ProviderMeta::default()
        };
        insert_provider(&db, "provider-1", app_type, meta)?;

        let state = build_state(db.clone());
        let usage = TokenUsage {
            input_tokens: 1_000_000,
            output_tokens: 0,
            cache_read_tokens: 0,
            cache_creation_tokens: 0,
            reasoning_tokens: 0,
            cache_creation_1h_tokens: 0,
            model: None,
            message_id: None,
        };

        log_usage_internal(
            &state,
            "provider-1",
            app_type,
            app_type,
            crate::services::sql_helpers::default_input_token_semantics(app_type),
            "resp-model",
            "req-model",
            "req-model",
            usage,
            10,
            None,
            false,
            200,
            None,
            None,
            None,
        )
        .await;

        let conn = crate::database::lock_conn!(db.conn);
        let (model, request_model, total_cost, cost_multiplier): (String, String, String, String) =
            conn.query_row(
                "SELECT model, request_model, total_cost_usd, cost_multiplier
                 FROM proxy_request_logs WHERE provider_id = ?1",
                ["provider-1"],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .map_err(|e| AppError::Database(e.to_string()))?;

        assert_eq!(model, "resp-model");
        assert_eq!(request_model, "req-model");
        assert_eq!(
            Decimal::from_str(&cost_multiplier).unwrap(),
            Decimal::from_str("2").unwrap()
        );
        assert_eq!(
            Decimal::from_str(&total_cost).unwrap(),
            Decimal::from_str("4").unwrap()
        );
        Ok(())
    }

    #[tokio::test]
    async fn test_request_pricing_mode_anchors_to_outbound_model() -> Result<(), AppError> {
        let db = Arc::new(Database::memory()?);
        let app_type = "claude";

        db.set_pricing_model_source(app_type, "request").await?;
        seed_pricing(&db)?;
        {
            let conn = crate::database::lock_conn!(db.conn);
            conn.execute(
                "INSERT OR REPLACE INTO model_pricing (model_id, display_name, input_cost_per_million, output_cost_per_million)
                 VALUES ('outbound-model', 'Outbound Model', '4.0', '0')",
                [],
            )
            .map_err(|e| AppError::Database(e.to_string()))?;
        }

        insert_provider(&db, "provider-3", app_type, ProviderMeta::default())?;

        let state = build_state(db.clone());
        let usage = TokenUsage {
            input_tokens: 1_000_000,
            output_tokens: 0,
            cache_read_tokens: 0,
            cache_creation_tokens: 0,
            reasoning_tokens: 0,
            cache_creation_1h_tokens: 0,
            model: None,
            message_id: None,
        };

        // 路由接管场景：客户端请求 req-model（$2/M），代理实际发出 outbound-model
        // （$4/M），上游回显 resp-model。「按请求计价」必须锚定实际发出的模型。
        log_usage_internal(
            &state,
            "provider-3",
            app_type,
            app_type,
            crate::services::sql_helpers::default_input_token_semantics(app_type),
            "resp-model",
            "req-model",
            "outbound-model",
            usage,
            10,
            None,
            false,
            200,
            None,
            None,
            None,
        )
        .await;

        let conn = crate::database::lock_conn!(db.conn);
        let (model, request_model, total_cost): (String, String, String) = conn
            .query_row(
                "SELECT model, request_model, total_cost_usd
                 FROM proxy_request_logs WHERE provider_id = ?1",
                ["provider-3"],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|e| AppError::Database(e.to_string()))?;

        // model / request_model 列不受计价锚点影响
        assert_eq!(model, "resp-model");
        assert_eq!(request_model, "req-model");
        // 按 outbound-model（$4/M）计价，而不是 req-model（$2/M）或 resp-model（$1/M）
        assert_eq!(
            Decimal::from_str(&total_cost).unwrap(),
            Decimal::from_str("4").unwrap()
        );
        Ok(())
    }

    #[tokio::test]
    async fn test_claude_desktop_inherits_claude_global_defaults() -> Result<(), AppError> {
        use crate::proxy::usage::logger::UsageLogger;

        let db = Arc::new(Database::memory()?);

        // 全局计费配置只有 claude/codex/gemini 三行；claude-desktop 的
        // 全局默认必须继承 claude，而不是静默落回工厂默认（1 / response）
        db.set_default_cost_multiplier("claude", "1.5").await?;
        db.set_pricing_model_source("claude", "request").await?;

        let logger = UsageLogger::new(&db);
        let (multiplier, source) = logger
            .resolve_pricing_config("nonexistent-provider", "claude-desktop")
            .await;

        assert_eq!(multiplier, Decimal::from_str("1.5").unwrap());
        assert_eq!(source, "request");
        Ok(())
    }

    #[tokio::test]
    async fn test_log_usage_falls_back_to_global_defaults() -> Result<(), AppError> {
        let db = Arc::new(Database::memory()?);
        let app_type = "claude";

        db.set_default_cost_multiplier(app_type, "1.5").await?;
        db.set_pricing_model_source(app_type, "response").await?;
        seed_pricing(&db)?;

        let meta = ProviderMeta::default();
        insert_provider(&db, "provider-2", app_type, meta)?;

        let state = build_state(db.clone());
        let usage = TokenUsage {
            input_tokens: 1_000_000,
            output_tokens: 0,
            cache_read_tokens: 0,
            cache_creation_tokens: 0,
            reasoning_tokens: 0,
            cache_creation_1h_tokens: 0,
            model: None,
            message_id: None,
        };

        log_usage_internal(
            &state,
            "provider-2",
            app_type,
            app_type,
            crate::services::sql_helpers::default_input_token_semantics(app_type),
            "resp-model",
            "req-model",
            "req-model",
            usage,
            10,
            None,
            false,
            200,
            None,
            None,
            None,
        )
        .await;

        let conn = crate::database::lock_conn!(db.conn);
        let (total_cost, cost_multiplier): (String, String) = conn
            .query_row(
                "SELECT total_cost_usd, cost_multiplier
                 FROM proxy_request_logs WHERE provider_id = ?1",
                ["provider-2"],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| AppError::Database(e.to_string()))?;

        assert_eq!(
            Decimal::from_str(&cost_multiplier).unwrap(),
            Decimal::from_str("1.5").unwrap()
        );
        assert_eq!(
            Decimal::from_str(&total_cost).unwrap(),
            Decimal::from_str("1.5").unwrap()
        );
        Ok(())
    }
}
