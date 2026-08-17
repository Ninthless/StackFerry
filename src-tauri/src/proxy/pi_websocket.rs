use super::forwarder::ActiveConnectionGuard;
use super::providers::{
    pi_target_headers, pi_target_headers_with_api_key, resolve_pi_provider, PiAdapter,
    ProviderAdapter,
};
use super::server::ProxyState;
use super::session::{extract_instance_id, extract_session_id};
use super::usage::{logger::UsageLogger, parser::TokenUsage};
use super::ProxyError;
use crate::database::PRICING_SOURCE_REQUEST;
use axum::extract::ws::{CloseFrame, Message, WebSocket};
use futures::{SinkExt, StreamExt};
use http::{HeaderMap, HeaderName};
use serde_json::Value;
use std::borrow::Cow;
use std::collections::HashSet;
use std::time::Duration;
use tokio_tungstenite::tungstenite::{
    client::IntoClientRequest, protocol::frame::coding::CloseCode,
    protocol::CloseFrame as UpstreamCloseFrame, Error as WebSocketError,
    Message as UpstreamMessage,
};

enum FirstUpstreamError {
    Retryable(String),
    ClientClosed,
}

enum RelayOutcome {
    Complete,
    ClientClosed,
    UpstreamFailed(String),
}

struct PiWebSocketTerminalUsage {
    usage: TokenUsage,
    status_code: u16,
    error_message: Option<String>,
}

struct PiWebSocketUsageObserver {
    api_type: String,
    input_token_semantics: i64,
    request_model: String,
    thinking_effort: Option<super::thinking_effort::ThinkingEffort>,
    started_at: std::time::Instant,
    first_event_ms: Option<u64>,
    events: Vec<Value>,
    terminal_logged: bool,
}

impl PiWebSocketUsageObserver {
    fn new(api: super::providers::PiApi, request_model: Option<String>) -> Self {
        Self {
            api_type: api.as_str().to_string(),
            input_token_semantics: api.input_token_semantics(),
            request_model: request_model.unwrap_or_else(|| "unknown".to_string()),
            thinking_effort: None,
            started_at: std::time::Instant::now(),
            first_event_ms: None,
            events: Vec::new(),
            terminal_logged: false,
        }
    }

    fn begin_request(&mut self, message: &Message) {
        let Ok(value) = message_json(message) else {
            return;
        };
        if value.get("type").and_then(Value::as_str) != Some("response.create") {
            return;
        }
        if let Some(model) = value.get("model").and_then(Value::as_str) {
            self.request_model = model.to_string();
        }
        self.thinking_effort = super::thinking_effort::extract_thinking_effort(&value);
        self.started_at = std::time::Instant::now();
        self.first_event_ms = None;
        self.events.clear();
        self.terminal_logged = false;
    }

    async fn observe_upstream(
        &mut self,
        state: &ProxyState,
        provider: &crate::provider::Provider,
        message: &UpstreamMessage,
    ) {
        let Some(terminal) = self.capture_upstream(message) else {
            return;
        };
        self.write_usage(
            state,
            provider,
            terminal.usage,
            terminal.status_code,
            terminal.error_message,
        )
        .await;
    }

    fn capture_upstream(&mut self, message: &UpstreamMessage) -> Option<PiWebSocketTerminalUsage> {
        if self.terminal_logged {
            return None;
        }
        let value = upstream_message_json(message)?;
        self.first_event_ms
            .get_or_insert_with(|| self.started_at.elapsed().as_millis() as u64);
        let event_type = value.get("type").and_then(Value::as_str);
        if value.get("usage").is_some()
            || value.pointer("/response/usage").is_some()
            || matches!(
                event_type,
                Some(
                    "response.completed"
                        | "response.done"
                        | "response.incomplete"
                        | "response.failed"
                        | "error"
                )
            )
        {
            self.events.push(value.clone());
        }
        if !matches!(
            event_type,
            Some(
                "response.completed"
                    | "response.done"
                    | "response.incomplete"
                    | "response.failed"
                    | "error"
            )
        ) {
            return None;
        }

        let response = value.get("response").unwrap_or(&value);
        let usage = TokenUsage::from_codex_response_auto(response).unwrap_or_else(|| TokenUsage {
            model: response
                .get("model")
                .and_then(Value::as_str)
                .map(str::to_owned),
            message_id: response
                .get("id")
                .and_then(Value::as_str)
                .map(str::to_owned),
            ..TokenUsage::default()
        });
        let failed = matches!(event_type, Some("response.failed" | "error"));
        let terminal = PiWebSocketTerminalUsage {
            usage,
            status_code: if failed { 500 } else { 200 },
            error_message: failed.then(|| "Pi WebSocket response failed".to_string()),
        };
        self.terminal_logged = true;
        self.events.clear();
        Some(terminal)
    }

    async fn finish_upstream_failure(
        &mut self,
        state: &ProxyState,
        provider: &crate::provider::Provider,
    ) {
        if self.terminal_logged {
            return;
        }
        let usage = self.partial_usage();
        if let Some(usage) = usage.filter(TokenUsage::has_billable_tokens) {
            self.write_usage(
                state,
                provider,
                usage,
                500,
                Some("Pi WebSocket upstream failed after partial usage".to_string()),
            )
            .await;
        } else {
            log_websocket_error(
                state,
                provider,
                &self.api_type,
                self.input_token_semantics,
                &self.request_model,
                self.started_at.elapsed().as_millis() as u64,
                self.thinking_effort.as_ref(),
            );
        }
        self.terminal_logged = true;
    }

    fn partial_usage(&self) -> Option<TokenUsage> {
        self.events.iter().rev().find_map(|event| {
            event
                .get("response")
                .and_then(TokenUsage::from_codex_response_auto)
                .or_else(|| TokenUsage::from_codex_response_auto(event))
        })
    }

    async fn write_usage(
        &self,
        state: &ProxyState,
        provider: &crate::provider::Provider,
        usage: TokenUsage,
        status_code: u16,
        error_message: Option<String>,
    ) {
        if !super::response_processor::usage_logging_enabled(state) {
            return;
        }
        let logger = UsageLogger::new(&state.db);
        let (multiplier, pricing_source) = logger.resolve_pricing_config(&provider.id, "pi").await;
        let model = usage
            .model
            .clone()
            .filter(|model| !model.is_empty())
            .unwrap_or_else(|| self.request_model.clone());
        let pricing_model = if pricing_source == PRICING_SOURCE_REQUEST {
            self.request_model.clone()
        } else {
            model.clone()
        };
        let request_id = usage.dedup_request_id(Some(("pi", &provider.id)));
        if let Err(error) = logger.log_with_calculation_and_error(
            request_id,
            provider.id.clone(),
            "pi".to_string(),
            self.api_type.clone(),
            self.input_token_semantics,
            model,
            self.request_model.clone(),
            pricing_model,
            usage,
            multiplier,
            self.started_at.elapsed().as_millis() as u64,
            self.first_event_ms,
            status_code,
            None,
            Some("pi".to_string()),
            true,
            error_message,
            None,
            self.thinking_effort
                .as_ref()
                .map(|effort| effort.value.clone()),
            self.thinking_effort
                .as_ref()
                .map(|effort| effort.source.clone()),
        ) {
            log::warn!("[USG-001] Failed to record Pi WebSocket usage: {error}");
        }
    }
}

pub(crate) async fn proxy(
    mut client: WebSocket,
    state: ProxyState,
    source_provider_id: String,
    endpoint: String,
    client_headers: HeaderMap,
) {
    let _connection_guard = ActiveConnectionGuard::acquire(state.status.clone()).await;
    {
        let mut status = state.status.write().await;
        status.total_requests = status.total_requests.saturating_add(1);
    }

    let app_config = match state.db.get_proxy_config_for_app("pi").await {
        Ok(config) => config,
        Err(error) => {
            close_with_error(
                &mut client,
                &format!("Pi proxy configuration failed: {error}"),
            )
            .await;
            record_terminal_failure(&state, "Pi proxy configuration failed").await;
            return;
        }
    };
    let first_timeout =
        Duration::from_secs(u64::from(app_config.streaming_first_byte_timeout.max(1)));
    let first_client_message = match receive_initial_request(&mut client, first_timeout).await {
        Ok(message) => message,
        Err(error) => {
            close_with_error(&mut client, &error.to_string()).await;
            record_terminal_failure(&state, &error.to_string()).await;
            return;
        }
    };
    let body = match message_json(&first_client_message) {
        Ok(body) => body,
        Err(error) => {
            close_with_error(&mut client, &error.to_string()).await;
            record_terminal_failure(&state, &error.to_string()).await;
            return;
        }
    };
    let selection = match state
        .provider_router
        .select_pi_providers(&source_provider_id, &body, &endpoint)
        .await
    {
        Ok(selection) if selection.api.is_codex_websocket() => selection,
        Ok(selection) => {
            let error = format!(
                "Pi API '{}' does not support the Codex WebSocket transport",
                selection.api.as_str()
            );
            close_with_error(&mut client, &error).await;
            record_terminal_failure(&state, &error).await;
            return;
        }
        Err(error) => {
            close_with_error(&mut client, &error.to_string()).await;
            record_terminal_failure(&state, &error.to_string()).await;
            return;
        }
    };
    let session = extract_session_id(&client_headers, &body, "pi");
    let requested_instance_id = match extract_instance_id(&client_headers) {
        Ok(instance_id) => instance_id,
        Err(error) => {
            close_with_error(&mut client, &error).await;
            record_terminal_failure(&state, &error).await;
            return;
        }
    };
    let binding = match state.db.get_session_credential_binding(
        "pi",
        &session.session_id,
        requested_instance_id.as_deref(),
    ) {
        Ok(binding) => binding,
        Err(error) => {
            close_with_error(&mut client, &error.to_string()).await;
            record_terminal_failure(&state, &error.to_string()).await;
            return;
        }
    };
    let binding = match (binding, requested_instance_id) {
        (Some(binding), Some(instance_id)) if binding.instance_id != instance_id => {
            let error = format!(
                "会话 {} 已绑定到实例 {}，禁止切换到 {instance_id}",
                session.session_id, binding.instance_id
            );
            close_with_error(&mut client, &error).await;
            record_terminal_failure(&state, &error).await;
            return;
        }
        (Some(binding), _) => Some(binding),
        (None, Some(instance_id)) => {
            let instance = match state.db.get_agent_instance(&instance_id) {
                Ok(Some(instance)) => instance,
                Ok(None) => {
                    let error = format!("实例 {instance_id} 不存在，禁止回退到 Provider 凭据");
                    close_with_error(&mut client, &error).await;
                    record_terminal_failure(&state, &error).await;
                    return;
                }
                Err(error) => {
                    close_with_error(&mut client, &error.to_string()).await;
                    record_terminal_failure(&state, &error.to_string()).await;
                    return;
                }
            };
            match crate::services::credential_isolation::CredentialIsolationService::bind_session(
                &state.db,
                "pi",
                &session.session_id,
                &instance.provider_id,
                &instance_id,
            ) {
                Ok(binding) => Some(binding),
                Err(error) => {
                    close_with_error(&mut client, &error.to_string()).await;
                    record_terminal_failure(&state, &error.to_string()).await;
                    return;
                }
            }
        }
        (None, None) => None,
    };
    let mut providers = selection.providers;
    if let Some(binding) = binding.as_ref() {
        providers.retain(|provider| provider.id == binding.provider_id);
    }
    if providers.is_empty() {
        let error = "绑定实例所属 Pi Provider 当前不可用";
        close_with_error(&mut client, error).await;
        record_terminal_failure(&state, error).await;
        return;
    }
    let isolated_api_key = if let Some(binding) = binding.as_ref() {
        match crate::services::credential_isolation::CredentialIsolationService::resolve_api_key(
            &state.db,
            &binding.instance_id,
        ) {
            Ok(api_key) => Some(api_key),
            Err(error) => {
                close_with_error(&mut client, &error.to_string()).await;
                record_terminal_failure(&state, &error.to_string()).await;
                return;
            }
        }
    } else {
        None
    };
    let mut usage_observer =
        PiWebSocketUsageObserver::new(selection.api, selection.request_model.clone());
    usage_observer.begin_request(&first_client_message);

    let max_attempts = usize::try_from(app_config.max_retries)
        .unwrap_or(usize::MAX)
        .saturating_add(1);
    let bypass_circuit_breaker = providers.len() == 1 && binding.is_none();
    let mut last_error = "No Pi WebSocket provider was available".to_string();
    let mut last_provider = None;

    for provider in providers.iter().take(max_attempts) {
        last_provider = Some(provider.clone());
        let permit = if bypass_circuit_breaker {
            None
        } else {
            let permit = state
                .provider_router
                .allow_provider_request(&provider.id, "pi")
                .await;
            if !permit.allowed {
                continue;
            }
            Some(permit.used_half_open_permit)
        };

        let resolved = match resolve_pi_provider(provider).await {
            Ok(provider) => provider,
            Err(error) => {
                last_error = error.to_string();
                record_attempt_failure(&state, &provider.id, permit, &last_error).await;
                continue;
            }
        };
        let request = match upstream_request(
            &resolved,
            &endpoint,
            &client_headers,
            &selection.source_header_names,
            &source_provider_id,
            isolated_api_key.as_deref(),
        ) {
            Ok(request) => request,
            Err(error) => {
                last_error = error.to_string();
                record_attempt_failure(&state, &provider.id, permit, &last_error).await;
                continue;
            }
        };
        let connect =
            tokio::time::timeout(first_timeout, tokio_tungstenite::connect_async(request)).await;
        let (mut upstream, _) = match connect {
            Ok(Ok(connection)) => connection,
            Ok(Err(error)) => {
                last_error = websocket_error_summary(&error);
                if is_non_retryable_handshake(&error) {
                    release_attempt_neutral(&state, &provider.id, permit).await;
                    close_with_error(&mut client, &last_error).await;
                    log_websocket_error(
                        &state,
                        provider,
                        &usage_observer.api_type,
                        usage_observer.input_token_semantics,
                        &usage_observer.request_model,
                        usage_observer.started_at.elapsed().as_millis() as u64,
                        usage_observer.thinking_effort.as_ref(),
                    );
                    record_terminal_failure(&state, &last_error).await;
                    return;
                }
                record_attempt_failure(&state, &provider.id, permit, &last_error).await;
                continue;
            }
            Err(_) => {
                last_error = "Pi WebSocket upstream handshake timed out".to_string();
                record_attempt_failure(&state, &provider.id, permit, &last_error).await;
                continue;
            }
        };
        if let Err(error) = upstream
            .send(to_upstream(first_client_message.clone()))
            .await
        {
            last_error = websocket_error_summary(&error);
            record_attempt_failure(&state, &provider.id, permit, &last_error).await;
            continue;
        }
        let first_upstream =
            match receive_first_upstream_message(&mut client, &mut upstream, first_timeout).await {
                Ok(message) => message,
                Err(FirstUpstreamError::Retryable(error)) => {
                    last_error = error;
                    record_attempt_failure(&state, &provider.id, permit, &last_error).await;
                    continue;
                }
                Err(FirstUpstreamError::ClientClosed) => {
                    release_attempt_neutral(&state, &provider.id, permit).await;
                    return;
                }
            };
        usage_observer
            .observe_upstream(&state, provider, &first_upstream)
            .await;

        if binding.is_none() {
            state.current_providers.write().await.insert(
                "pi".to_string(),
                (provider.id.clone(), provider.name.clone()),
            );
            let mut status = state.status.write().await;
            status.last_error = None;
            status.current_provider = Some(provider.name.clone());
            status.current_provider_id = Some(provider.id.clone());
        }
        if binding.is_none() && provider.id != source_provider_id {
            let manager = state.failover_manager.clone();
            let app_handle = state.app_handle.clone();
            let provider_id = provider.id.clone();
            let provider_name = provider.name.clone();
            tokio::spawn(async move {
                let _ = manager
                    .try_switch(app_handle.as_ref(), "pi", &provider_id, &provider_name)
                    .await;
            });
        }

        if client.send(to_client(first_upstream)).await.is_err() {
            release_attempt_neutral(&state, &provider.id, permit).await;
            let _ = upstream.close(None).await;
            return;
        }
        match relay(
            &mut client,
            &mut upstream,
            &state,
            provider,
            &mut usage_observer,
        )
        .await
        {
            RelayOutcome::Complete => {
                let _ = state
                    .provider_router
                    .record_result(&provider.id, "pi", permit.unwrap_or(false), true, None)
                    .await;
                let mut status = state.status.write().await;
                status.success_requests = status.success_requests.saturating_add(1);
                status.last_error = None;
            }
            RelayOutcome::ClientClosed => {
                release_attempt_neutral(&state, &provider.id, permit).await;
            }
            RelayOutcome::UpstreamFailed(error) => {
                usage_observer
                    .finish_upstream_failure(&state, provider)
                    .await;
                record_attempt_failure(&state, &provider.id, permit, &error).await;
                record_terminal_failure(&state, &error).await;
            }
        }
        return;
    }

    close_with_error(&mut client, &last_error).await;
    if let Some(provider) = last_provider.as_ref() {
        log_websocket_error(
            &state,
            provider,
            &usage_observer.api_type,
            usage_observer.input_token_semantics,
            &usage_observer.request_model,
            usage_observer.started_at.elapsed().as_millis() as u64,
            usage_observer.thinking_effort.as_ref(),
        );
    }
    record_terminal_failure(&state, &last_error).await;
}

async fn receive_initial_request(
    client: &mut WebSocket,
    timeout: Duration,
) -> Result<Message, ProxyError> {
    loop {
        let message = tokio::time::timeout(timeout, client.recv())
            .await
            .map_err(|_| {
                ProxyError::Timeout("Pi WebSocket client sent no request frame".to_string())
            })?
            .ok_or_else(|| {
                ProxyError::InvalidRequest("Pi WebSocket closed before response.create".to_string())
            })?
            .map_err(|error| {
                ProxyError::InvalidRequest(format!("Pi WebSocket receive failed: {error}"))
            })?;
        match message {
            Message::Text(_) | Message::Binary(_) => return Ok(message),
            Message::Ping(payload) => {
                client
                    .send(Message::Pong(payload))
                    .await
                    .map_err(|error| ProxyError::ForwardFailed(error.to_string()))?;
            }
            Message::Pong(_) => {}
            Message::Close(_) => {
                return Err(ProxyError::InvalidRequest(
                    "Pi WebSocket closed before response.create".to_string(),
                ));
            }
        }
    }
}

fn message_json(message: &Message) -> Result<Value, ProxyError> {
    let bytes = match message {
        Message::Text(text) => text.as_bytes(),
        Message::Binary(bytes) => bytes.as_slice(),
        _ => {
            return Err(ProxyError::InvalidRequest(
                "Pi WebSocket initial frame must be JSON".to_string(),
            ))
        }
    };
    let body: Value = serde_json::from_slice(bytes).map_err(|error| {
        ProxyError::InvalidRequest(format!("Invalid Pi WebSocket JSON: {error}"))
    })?;
    if body.get("type").and_then(Value::as_str) != Some("response.create") {
        return Err(ProxyError::InvalidRequest(
            "Pi WebSocket initial frame must be response.create".to_string(),
        ));
    }
    Ok(body)
}

fn upstream_message_json(message: &UpstreamMessage) -> Option<Value> {
    let bytes = match message {
        UpstreamMessage::Text(text) => text.as_bytes(),
        UpstreamMessage::Binary(bytes) => bytes.as_slice(),
        _ => return None,
    };
    serde_json::from_slice(bytes).ok()
}

fn upstream_request(
    provider: &crate::provider::Provider,
    endpoint: &str,
    client_headers: &HeaderMap,
    source_header_names: &HashSet<HeaderName>,
    source_provider_id: &str,
    isolated_api_key: Option<&str>,
) -> Result<http::Request<()>, ProxyError> {
    let adapter = PiAdapter::new();
    let base_url = adapter.extract_base_url(provider)?;
    let target = adapter.build_url(&base_url, endpoint);
    let mut target_url = url::Url::parse(&target).map_err(|error| {
        ProxyError::ConfigError(format!("Invalid Pi WebSocket target: {error}"))
    })?;
    match target_url.scheme() {
        "http" => target_url.set_scheme("ws").ok(),
        "https" => target_url.set_scheme("wss").ok(),
        _ => None,
    }
    .ok_or_else(|| ProxyError::ConfigError("Pi WebSocket target must use HTTP(S)".to_string()))?;
    let mut request = target_url.as_str().into_client_request().map_err(|error| {
        ProxyError::ConfigError(format!("Invalid Pi WebSocket request: {error}"))
    })?;
    let target_headers = match isolated_api_key {
        Some(api_key) => pi_target_headers_with_api_key(provider, api_key)?,
        None => pi_target_headers(provider)?,
    };
    for (name, value) in client_headers {
        if is_websocket_handshake_header(name) {
            continue;
        }
        if is_stackferry_private_header(name) {
            continue;
        }
        if source_header_names.contains(name) {
            let preserve_source_auth = provider.id == source_provider_id
                && is_auth_header(name)
                && !target_headers.contains_key(name);
            if !preserve_source_auth {
                continue;
            }
        }
        request.headers_mut().insert(name.clone(), value.clone());
    }
    for (name, value) in target_headers {
        if let Some(name) = name {
            request.headers_mut().insert(name, value);
        }
    }
    Ok(request)
}

async fn receive_first_upstream_message<S>(
    client: &mut WebSocket,
    upstream: &mut tokio_tungstenite::WebSocketStream<S>,
    timeout: Duration,
) -> Result<UpstreamMessage, FirstUpstreamError>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    tokio::time::timeout(timeout, async {
        loop {
            tokio::select! {
                client_message = client.recv() => match client_message {
                    Some(Ok(message)) => {
                        let closes = matches!(message, Message::Close(_));
                        upstream
                            .send(to_upstream(message))
                            .await
                            .map_err(|error| {
                                FirstUpstreamError::Retryable(websocket_error_summary(&error))
                            })?;
                        if closes {
                            return Err(FirstUpstreamError::ClientClosed);
                        }
                    }
                    _ => {
                        let _ = upstream.close(None).await;
                        return Err(FirstUpstreamError::ClientClosed);
                    }
                },
                upstream_message = upstream.next() => {
                    let next = upstream_message
                        .ok_or_else(|| {
                            FirstUpstreamError::Retryable(
                                "Pi WebSocket upstream closed before its first event".to_string(),
                            )
                        })?
                        .map_err(|error| {
                            FirstUpstreamError::Retryable(websocket_error_summary(&error))
                        })?;
                    match next {
                        UpstreamMessage::Text(_) | UpstreamMessage::Binary(_) => return Ok(next),
                        UpstreamMessage::Ping(payload) => upstream
                            .send(UpstreamMessage::Pong(payload))
                            .await
                            .map_err(|error| {
                                FirstUpstreamError::Retryable(websocket_error_summary(&error))
                            })?,
                        UpstreamMessage::Pong(_) | UpstreamMessage::Frame(_) => {}
                        UpstreamMessage::Close(_) => {
                            return Err(FirstUpstreamError::Retryable(
                                "Pi WebSocket upstream closed before its first event".to_string(),
                            ));
                        }
                    }
                }
            }
        }
    })
    .await
    .map_err(|_| {
        FirstUpstreamError::Retryable("Pi WebSocket upstream produced no first event".to_string())
    })?
}

async fn relay<S>(
    client: &mut WebSocket,
    upstream: &mut tokio_tungstenite::WebSocketStream<S>,
    state: &ProxyState,
    provider: &crate::provider::Provider,
    usage_observer: &mut PiWebSocketUsageObserver,
) -> RelayOutcome
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    loop {
        tokio::select! {
            client_message = client.recv() => match client_message {
                Some(Ok(message)) => {
                    let closes = matches!(message, Message::Close(_));
                    usage_observer.begin_request(&message);
                    if let Err(error) = upstream.send(to_upstream(message)).await {
                        let error = websocket_error_summary(&error);
                        close_with_error(client, &error).await;
                        return RelayOutcome::UpstreamFailed(error);
                    }
                    if closes {
                        return RelayOutcome::ClientClosed;
                    }
                }
                _ => {
                    let _ = upstream.close(None).await;
                    return RelayOutcome::ClientClosed;
                }
            },
            upstream_message = upstream.next() => match upstream_message {
                Some(Ok(message)) => {
                    usage_observer
                        .observe_upstream(state, provider, &message)
                        .await;
                    match message {
                        UpstreamMessage::Close(frame) => {
                            if is_normal_close(frame.as_ref()) {
                                let _ = client.send(to_client(UpstreamMessage::Close(frame))).await;
                                return RelayOutcome::Complete;
                            }
                            let error = "Pi WebSocket upstream closed before completing the response".to_string();
                            close_with_error(client, &error).await;
                            return RelayOutcome::UpstreamFailed(error);
                        }
                        UpstreamMessage::Frame(_) => {}
                        message => {
                            if client.send(to_client(message)).await.is_err() {
                                let _ = upstream.close(None).await;
                                return RelayOutcome::ClientClosed;
                            }
                        }
                    }
                }
                Some(Err(error)) => {
                    let error = websocket_error_summary(&error);
                    close_with_error(client, &error).await;
                    return RelayOutcome::UpstreamFailed(error);
                }
                None => {
                    let error = "Pi WebSocket upstream disconnected before completing the response".to_string();
                    close_with_error(client, &error).await;
                    return RelayOutcome::UpstreamFailed(error);
                }
            }
        }
    }
}

fn is_normal_close(frame: Option<&UpstreamCloseFrame<'_>>) -> bool {
    frame.is_some_and(|frame| matches!(frame.code, CloseCode::Normal | CloseCode::Away))
}

fn to_upstream(message: Message) -> UpstreamMessage {
    match message {
        Message::Text(text) => UpstreamMessage::Text(text),
        Message::Binary(bytes) => UpstreamMessage::Binary(bytes),
        Message::Ping(bytes) => UpstreamMessage::Ping(bytes),
        Message::Pong(bytes) => UpstreamMessage::Pong(bytes),
        Message::Close(frame) => UpstreamMessage::Close(frame.map(|frame| UpstreamCloseFrame {
            code: CloseCode::from(frame.code),
            reason: frame.reason,
        })),
    }
}

fn to_client(message: UpstreamMessage) -> Message {
    match message {
        UpstreamMessage::Text(text) => Message::Text(text),
        UpstreamMessage::Binary(bytes) => Message::Binary(bytes),
        UpstreamMessage::Ping(bytes) => Message::Ping(bytes),
        UpstreamMessage::Pong(bytes) => Message::Pong(bytes),
        UpstreamMessage::Close(frame) => Message::Close(frame.map(|frame| CloseFrame {
            code: u16::from(frame.code),
            reason: frame.reason,
        })),
        UpstreamMessage::Frame(_) => Message::Pong(Vec::new()),
    }
}

fn is_websocket_handshake_header(name: &HeaderName) -> bool {
    matches!(
        name.as_str(),
        "connection"
            | "host"
            | "sec-websocket-accept"
            | "sec-websocket-extensions"
            | "sec-websocket-key"
            | "sec-websocket-protocol"
            | "sec-websocket-version"
            | "upgrade"
    )
}

fn is_auth_header(name: &HeaderName) -> bool {
    matches!(
        name.as_str(),
        "authorization" | "api-key" | "x-api-key" | "x-goog-api-key"
    )
}

fn is_stackferry_private_header(name: &HeaderName) -> bool {
    name.as_str()
        .to_ascii_lowercase()
        .starts_with("x-stackferry-")
}

fn is_non_retryable_handshake(error: &WebSocketError) -> bool {
    matches!(
        error,
        WebSocketError::Http(response)
            if response.status().is_client_error()
                && !matches!(response.status().as_u16(), 408 | 409 | 425 | 429)
    )
}

fn websocket_error_summary(error: &WebSocketError) -> String {
    match error {
        WebSocketError::Http(response) => {
            format!(
                "Pi WebSocket upstream rejected the handshake ({})",
                response.status()
            )
        }
        _ => "Pi WebSocket upstream transport failed".to_string(),
    }
}

fn log_websocket_error(
    state: &ProxyState,
    provider: &crate::provider::Provider,
    api_type: &str,
    input_token_semantics: i64,
    request_model: &str,
    latency_ms: u64,
    thinking_effort: Option<&super::thinking_effort::ThinkingEffort>,
) {
    if !super::response_processor::usage_logging_enabled(state) {
        return;
    }
    let logger = UsageLogger::new(&state.db);
    if let Err(error) = logger.log_error_with_context(
        uuid::Uuid::new_v4().to_string(),
        provider.id.clone(),
        "pi".to_string(),
        api_type.to_string(),
        input_token_semantics,
        request_model.to_string(),
        500,
        "Pi WebSocket upstream failed".to_string(),
        latency_ms,
        true,
        None,
        Some("pi".to_string()),
        Some("connection_failure".to_string()),
        None,
        thinking_effort.map(|effort| effort.value.clone()),
        thinking_effort.map(|effort| effort.source.clone()),
    ) {
        log::warn!("[USG-001] Failed to record Pi WebSocket error: {error}");
    }
}

async fn record_attempt_failure(
    state: &ProxyState,
    provider_id: &str,
    permit: Option<bool>,
    message: &str,
) {
    let _ = state
        .provider_router
        .record_result(
            provider_id,
            "pi",
            permit.unwrap_or(false),
            false,
            Some(message.to_string()),
        )
        .await;
}

async fn release_attempt_neutral(state: &ProxyState, provider_id: &str, permit: Option<bool>) {
    state
        .provider_router
        .release_permit_neutral(provider_id, "pi", permit.unwrap_or(false))
        .await;
}

async fn record_terminal_failure(state: &ProxyState, message: &str) {
    let mut status = state.status.write().await;
    status.failed_requests = status.failed_requests.saturating_add(1);
    status.last_error = Some(message.to_string());
}

async fn close_with_error(client: &mut WebSocket, message: &str) {
    let reason = message.chars().take(120).collect::<String>();
    let _ = client
        .send(Message::Close(Some(CloseFrame {
            code: 1011,
            reason: Cow::Owned(reason),
        })))
        .await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn observer() -> PiWebSocketUsageObserver {
        PiWebSocketUsageObserver::new(
            super::super::providers::PiApi::OpenAiCodexResponses,
            Some("requested-model".to_string()),
        )
    }

    fn upstream(value: Value) -> UpstreamMessage {
        UpstreamMessage::Text(value.to_string())
    }

    fn response_with_usage(event_type: &str, id: &str) -> Value {
        json!({
            "type": event_type,
            "response": {
                "id": id,
                "model": "resolved-model",
                "usage": {
                    "input_tokens": 21,
                    "output_tokens": 8,
                    "input_tokens_details": {
                        "cached_tokens": 5,
                        "cache_write_tokens": 3
                    },
                    "output_tokens_details": {
                        "reasoning_tokens": 2
                    }
                }
            }
        })
    }

    #[test]
    fn first_terminal_event_captures_complete_usage_once() {
        let mut observer = observer();
        let message = upstream(response_with_usage("response.completed", "resp-1"));

        let terminal = observer.capture_upstream(&message).unwrap();

        assert_eq!(terminal.status_code, 200);
        assert_eq!(terminal.error_message, None);
        assert_eq!(terminal.usage.input_tokens, 21);
        assert_eq!(terminal.usage.output_tokens, 8);
        assert_eq!(terminal.usage.cache_read_tokens, 5);
        assert_eq!(terminal.usage.cache_creation_tokens, 3);
        assert_eq!(terminal.usage.reasoning_tokens, 2);
        assert_eq!(terminal.usage.message_id.as_deref(), Some("resp-1"));
        assert!(observer.terminal_logged);
        assert!(observer.capture_upstream(&message).is_none());
    }

    #[test]
    fn codex_websocket_terminal_variants_use_expected_status() {
        for event_type in ["response.done", "response.incomplete"] {
            let mut observer = observer();
            let terminal = observer
                .capture_upstream(&upstream(response_with_usage(event_type, event_type)))
                .unwrap();
            assert_eq!(terminal.status_code, 200, "{event_type}");
            assert_eq!(terminal.error_message, None, "{event_type}");
        }

        for event_type in ["response.failed", "error"] {
            let mut observer = observer();
            let value = if event_type == "response.failed" {
                json!({
                    "type": event_type,
                    "response": {
                        "id": "failed-response",
                        "status": "failed",
                        "error": { "code": "server_error", "message": "secret upstream detail" }
                    }
                })
            } else {
                json!({
                    "type": event_type,
                    "error": { "code": "server_error", "message": "secret upstream detail" }
                })
            };
            let terminal = observer.capture_upstream(&upstream(value)).unwrap();
            assert_eq!(terminal.status_code, 500, "{event_type}");
            assert_eq!(
                terminal.error_message.as_deref(),
                Some("Pi WebSocket response failed"),
                "{event_type}"
            );
        }
    }

    #[test]
    fn response_create_resets_usage_window_and_request_model() {
        let mut observer = observer();
        let partial = upstream(response_with_usage("response.in_progress", "partial-1"));
        assert!(observer.capture_upstream(&partial).is_none());
        assert_eq!(observer.partial_usage().unwrap().input_tokens, 21);

        let completed = upstream(response_with_usage("response.completed", "resp-1"));
        assert!(observer.capture_upstream(&completed).is_some());
        assert!(observer.terminal_logged);

        observer.begin_request(&Message::Text(
            json!({ "type": "response.create", "model": "next-model" }).to_string(),
        ));

        assert_eq!(observer.request_model, "next-model");
        assert!(!observer.terminal_logged);
        assert!(observer.events.is_empty());
        assert!(observer.first_event_ms.is_none());
        assert!(observer.partial_usage().is_none());
    }

    #[test]
    fn binary_terminal_event_is_supported() {
        let mut observer = observer();
        let bytes = response_with_usage("response.done", "binary-response")
            .to_string()
            .into_bytes();

        let terminal = observer
            .capture_upstream(&UpstreamMessage::Binary(bytes))
            .unwrap();

        assert_eq!(
            terminal.usage.message_id.as_deref(),
            Some("binary-response")
        );
    }

    #[test]
    fn strips_all_stackferry_private_headers() {
        assert!(is_stackferry_private_header(&HeaderName::from_static(
            "x-stackferry-instance-id"
        )));
        assert!(is_stackferry_private_header(&HeaderName::from_static(
            "x-stackferry-future"
        )));
        assert!(!is_stackferry_private_header(&HeaderName::from_static(
            "x-request-id"
        )));
    }
}
