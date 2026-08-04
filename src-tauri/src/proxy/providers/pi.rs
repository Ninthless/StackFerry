use super::{adapter::auth_header_value, AuthInfo, AuthStrategy, ProviderAdapter};
use crate::provider::Provider;
use crate::proxy::{handler_config::UsageParserConfig, ProxyError};
use bytes::Bytes;
use hmac::{Hmac, Mac};
use http::{HeaderMap, HeaderName, HeaderValue};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::io::{Cursor, Read};
use std::time::Duration;
use tokio::process::Command;

const RESOLVED_ENV_FIELD: &str = "__stackferryResolvedEnv";
const RESOLVED_CREDENTIAL_TYPE_FIELD: &str = "__stackferryCredentialType";
const MAX_DECOMPRESSED_REQUEST_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PiApi {
    OpenAiCompletions,
    OpenAiResponses,
    OpenAiCodexResponses,
    AzureOpenAiResponses,
    AnthropicMessages,
    GoogleGenerativeAi,
    GoogleVertex,
    BedrockConverseStream,
    MistralConversations,
    PiMessages,
    OpenRouterImages,
}

impl PiApi {
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::OpenAiCompletions => "openai-completions",
            Self::OpenAiResponses => "openai-responses",
            Self::OpenAiCodexResponses => "openai-codex-responses",
            Self::AzureOpenAiResponses => "azure-openai-responses",
            Self::AnthropicMessages => "anthropic-messages",
            Self::GoogleGenerativeAi => "google-generative-ai",
            Self::GoogleVertex => "google-vertex",
            Self::BedrockConverseStream => "bedrock-converse-stream",
            Self::MistralConversations => "mistral-conversations",
            Self::PiMessages => "pi-messages",
            Self::OpenRouterImages => "openrouter-images",
        }
    }

    fn auth_strategy(self) -> Option<AuthStrategy> {
        match self {
            Self::AnthropicMessages => Some(AuthStrategy::Anthropic),
            Self::GoogleGenerativeAi | Self::GoogleVertex => Some(AuthStrategy::Google),
            Self::AzureOpenAiResponses => None,
            Self::OpenAiCompletions
            | Self::OpenAiResponses
            | Self::OpenAiCodexResponses
            | Self::BedrockConverseStream
            | Self::MistralConversations
            | Self::PiMessages
            | Self::OpenRouterImages => Some(AuthStrategy::Bearer),
        }
    }

    pub(crate) const fn is_codex_websocket(self) -> bool {
        matches!(self, Self::OpenAiCodexResponses)
    }

    pub(crate) const fn is_bedrock(self) -> bool {
        matches!(self, Self::BedrockConverseStream)
    }

    pub(crate) const fn input_token_semantics(self) -> i64 {
        use crate::services::sql_helpers::{
            INPUT_TOKEN_SEMANTICS_FRESH, INPUT_TOKEN_SEMANTICS_TOTAL,
        };

        match self {
            Self::AnthropicMessages
            | Self::BedrockConverseStream
            | Self::MistralConversations
            | Self::PiMessages => INPUT_TOKEN_SEMANTICS_FRESH,
            Self::OpenAiCompletions
            | Self::OpenAiResponses
            | Self::OpenAiCodexResponses
            | Self::AzureOpenAiResponses
            | Self::GoogleGenerativeAi
            | Self::GoogleVertex
            | Self::OpenRouterImages => INPUT_TOKEN_SEMANTICS_TOTAL,
        }
    }
}

impl std::str::FromStr for PiApi {
    type Err = ProxyError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.trim() {
            "openai-completions" => Ok(Self::OpenAiCompletions),
            "openai-responses" => Ok(Self::OpenAiResponses),
            "openai-codex-responses" => Ok(Self::OpenAiCodexResponses),
            "azure-openai-responses" => Ok(Self::AzureOpenAiResponses),
            "anthropic-messages" => Ok(Self::AnthropicMessages),
            "google-generative-ai" => Ok(Self::GoogleGenerativeAi),
            "google-vertex" => Ok(Self::GoogleVertex),
            "bedrock-converse-stream" => Ok(Self::BedrockConverseStream),
            "mistral-conversations" => Ok(Self::MistralConversations),
            "pi-messages" => Ok(Self::PiMessages),
            "openrouter-images" => Ok(Self::OpenRouterImages),
            unsupported => Err(ProxyError::ConfigError(format!(
                "Pi provider uses unsupported API '{unsupported}'"
            ))),
        }
    }
}

#[derive(Clone)]
pub(crate) struct PiRequestMetadata {
    pub(crate) raw_body: Bytes,
    source_provider_id: String,
    source_header_names: HashSet<HeaderName>,
}

pub(crate) struct PiProviderSelection {
    pub(crate) api: PiApi,
    pub(crate) request_model: Option<String>,
    pub(crate) providers: Vec<Provider>,
    pub(crate) source_header_names: HashSet<HeaderName>,
}

impl PiRequestMetadata {
    pub(crate) fn new(
        raw_body: Bytes,
        source_provider_id: String,
        source_header_names: HashSet<HeaderName>,
    ) -> Self {
        Self {
            raw_body,
            source_provider_id,
            source_header_names,
        }
    }

    pub(crate) fn is_source_configured_header(&self, name: &HeaderName) -> bool {
        self.source_header_names.contains(name)
    }

    pub(crate) fn is_source_provider(&self, provider_id: &str) -> bool {
        self.source_provider_id == provider_id
    }
}

pub(crate) struct PiProviderPlan {
    provider: Provider,
    pub(crate) api: PiApi,
    base_url: String,
    api_key: Option<String>,
    auth_header: bool,
    headers: Map<String, Value>,
    env: Map<String, Value>,
}

impl PiProviderPlan {
    pub(crate) fn source_header_names(&self) -> Result<HashSet<HeaderName>, ProxyError> {
        let mut names = HashSet::new();
        for name in self.headers.keys() {
            names.insert(parse_header_name(name)?);
        }
        for name in [
            "authorization",
            "api-key",
            "x-api-key",
            "x-goog-api-key",
            "x-amz-content-sha256",
            "x-amz-date",
            "x-amz-security-token",
        ] {
            names.insert(HeaderName::from_static(name));
        }
        Ok(names)
    }

    pub(crate) fn into_provider(self) -> Provider {
        let mut settings = Map::new();
        settings.insert("baseUrl".to_string(), Value::String(self.base_url));
        settings.insert(
            "api".to_string(),
            Value::String(self.api.as_str().to_string()),
        );
        settings.insert("authHeader".to_string(), Value::Bool(self.auth_header));
        settings.insert("headers".to_string(), Value::Object(self.headers));
        if !self.env.is_empty() {
            settings.insert(RESOLVED_ENV_FIELD.to_string(), Value::Object(self.env));
        }
        if let Some(api_key) = self.api_key {
            settings.insert("apiKey".to_string(), Value::String(api_key));
        }

        let mut provider = self.provider;
        provider.settings_config = Value::Object(settings);
        provider
    }
}

pub(crate) async fn resolve_provider(provider: &Provider) -> Result<Provider, ProxyError> {
    let mut provider = provider.clone();
    let provider_id = provider.id.clone();
    let credential = crate::pi_config::get_proxy_credential(&provider_id)
        .map_err(|error| ProxyError::ConfigError(error.to_string()))?;
    let settings = provider.settings_config.as_object_mut().ok_or_else(|| {
        ProxyError::ConfigError(format!(
            "Pi provider '{}' resolved configuration must be an object",
            provider_id
        ))
    })?;
    let configured_api_key = settings
        .get("apiKey")
        .and_then(Value::as_str)
        .map(|value| (value.to_string(), None));
    let credential_api_key = credential_api_key(credential.as_ref());
    let raw_api_key = configured_api_key.or(credential_api_key);
    if let Some((api_key, credential_type)) = raw_api_key.as_ref() {
        let api_key = api_key.trim();
        if !api_key.is_empty() {
            settings.insert(
                "apiKey".to_string(),
                Value::String(resolve_config_value(api_key, "API key").await?),
            );
            if let Some(credential_type) = credential_type {
                settings.insert(
                    RESOLVED_CREDENTIAL_TYPE_FIELD.to_string(),
                    Value::String((*credential_type).to_string()),
                );
            }
        }
    }

    let raw_headers = settings
        .get("headers")
        .and_then(Value::as_object)
        .cloned()
        .ok_or_else(|| {
            ProxyError::ConfigError(format!(
                "Pi provider '{}' resolved headers must be an object",
                provider_id
            ))
        })?;
    let mut headers = Map::new();
    for (name, value) in raw_headers {
        parse_header_name(&name)?;
        let raw_value = value.as_str().ok_or_else(|| {
            ProxyError::ConfigError(format!(
                "Pi provider '{}' header '{name}' must be a string",
                provider_id
            ))
        })?;
        let resolved = resolve_config_value(raw_value, &format!("header '{name}'")).await?;
        HeaderValue::from_str(&resolved).map_err(|error| {
            ProxyError::ConfigError(format!(
                "Pi provider '{}' header '{name}' is invalid: {error}",
                provider_id
            ))
        })?;
        headers.insert(name, Value::String(resolved));
    }
    settings.insert("headers".to_string(), Value::Object(headers));

    let mut resolved_env = settings
        .get(RESOLVED_ENV_FIELD)
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    if let Some(credential_env) = credential
        .as_ref()
        .and_then(|value| value.get("env"))
        .and_then(Value::as_object)
    {
        resolved_env.extend(credential_env.clone());
    }
    for (name, value) in &mut resolved_env {
        let raw = value.as_str().ok_or_else(|| {
            ProxyError::ConfigError(format!(
                "Pi provider '{provider_id}' credential environment value '{name}' must be a string"
            ))
        })?;
        *value = Value::String(resolve_config_value(raw, &format!("environment '{name}'")).await?);
    }
    if !resolved_env.is_empty() {
        settings.insert(RESOLVED_ENV_FIELD.to_string(), Value::Object(resolved_env));
    }
    Ok(provider)
}

pub(crate) async fn resolve_usage_credentials(
    provider: &Provider,
    api_key_override: Option<&str>,
    base_url_override: Option<&str>,
) -> Result<(String, String), ProxyError> {
    let settings = provider.settings_config.as_object().ok_or_else(|| {
        ProxyError::ConfigError(format!(
            "Pi provider '{}' configuration must be an object",
            provider.id
        ))
    })?;

    let api_key_override = api_key_override
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let configured_api_key = settings
        .get("apiKey")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let credential = if api_key_override.is_none() && configured_api_key.is_none() {
        crate::pi_config::get_proxy_credential(&provider.id)
            .map_err(|error| ProxyError::ConfigError(error.to_string()))?
    } else {
        None
    };
    let credential_api_key = credential_api_key(credential.as_ref()).map(|(value, _)| value);
    let raw_api_key = api_key_override
        .map(str::to_string)
        .or_else(|| configured_api_key.map(str::to_string))
        .or(credential_api_key);
    let api_key = match raw_api_key {
        Some(value) => resolve_config_value(&value, "usage API key").await?,
        None => String::new(),
    };

    let base_url = base_url_override
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or_else(|| {
            settings
                .get("baseUrl")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
        })
        .unwrap_or_default()
        .trim_end_matches('/')
        .to_string();

    Ok((base_url, api_key))
}

fn credential_api_key(credential: Option<&Value>) -> Option<(String, Option<&'static str>)> {
    let credential = credential?.as_object()?;
    match credential.get("type").and_then(Value::as_str) {
        Some("api_key") => credential
            .get("key")
            .and_then(Value::as_str)
            .map(|value| (value.to_string(), Some("api_key"))),
        Some("oauth") => {
            let expires = credential.get("expires").and_then(Value::as_i64)?;
            (expires > chrono::Utc::now().timestamp_millis())
                .then(|| credential.get("access").and_then(Value::as_str))
                .flatten()
                .map(|value| (value.to_string(), Some("oauth")))
        }
        _ => None,
    }
}

pub(crate) fn plan_provider(
    provider: &Provider,
    request_model: Option<&str>,
) -> Result<Option<PiProviderPlan>, ProxyError> {
    let settings = provider.settings_config.as_object().ok_or_else(|| {
        ProxyError::ConfigError(format!(
            "Pi provider '{}' configuration must be an object",
            provider.id
        ))
    })?;
    let model = match request_model {
        Some(model_id) => settings
            .get("models")
            .and_then(Value::as_array)
            .and_then(|models| {
                models.iter().find(|model| {
                    model.get("id").and_then(Value::as_str).map(str::trim) == Some(model_id)
                })
            })
            .and_then(Value::as_object),
        None => None,
    };
    if request_model.is_some() && model.is_none() {
        return Ok(None);
    }

    let api_value = model
        .and_then(|model| model.get("api"))
        .or_else(|| settings.get("api"))
        .and_then(Value::as_str)
        .ok_or_else(|| {
            ProxyError::ConfigError(format!(
                "Pi provider '{}' has no API for model '{}'",
                provider.id,
                request_model.unwrap_or("<unspecified>")
            ))
        })?;
    let api = api_value.parse::<PiApi>().map_err(|_| {
        ProxyError::ConfigError(format!(
            "Pi provider '{}' model '{}' uses unsupported API '{}'",
            provider.id,
            request_model.unwrap_or("<unspecified>"),
            api_value.trim()
        ))
    })?;

    let base_url = model
        .and_then(|model| model.get("baseUrl"))
        .or_else(|| settings.get("baseUrl"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            ProxyError::ConfigError(format!(
                "Pi provider '{}' has no baseUrl for model '{}'",
                provider.id,
                request_model.unwrap_or("<unspecified>")
            ))
        })?;
    validate_base_url(base_url, &provider.id)?;

    let mut headers = object_field(settings, "headers", &provider.id)?.unwrap_or_default();
    let env = object_field(settings, "env", &provider.id)?.unwrap_or_default();
    if let Some(overrides) = settings
        .get("modelOverrides")
        .and_then(Value::as_object)
        .and_then(|overrides| request_model.and_then(|model| overrides.get(model)))
        .and_then(Value::as_object)
    {
        if let Some(override_headers) = object_field(overrides, "headers", &provider.id)? {
            headers.extend(override_headers);
        }
    }
    if let Some(model) = model {
        if let Some(model_headers) = object_field(model, "headers", &provider.id)? {
            headers.extend(model_headers);
        }
    }

    Ok(Some(PiProviderPlan {
        provider: provider.clone(),
        api,
        base_url: base_url.trim_end_matches('/').to_string(),
        api_key: settings
            .get("apiKey")
            .and_then(Value::as_str)
            .map(str::to_string),
        auth_header: settings
            .get("authHeader")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        headers,
        env,
    }))
}

fn object_field(
    object: &Map<String, Value>,
    field: &str,
    provider_id: &str,
) -> Result<Option<Map<String, Value>>, ProxyError> {
    object
        .get(field)
        .map(|value| {
            value.as_object().cloned().ok_or_else(|| {
                ProxyError::ConfigError(format!(
                    "Pi provider '{provider_id}' field '{field}' must be an object"
                ))
            })
        })
        .transpose()
}

fn validate_base_url(value: &str, provider_id: &str) -> Result<(), ProxyError> {
    let url = url::Url::parse(value).map_err(|error| {
        ProxyError::ConfigError(format!(
            "Pi provider '{provider_id}' baseUrl is invalid: {error}"
        ))
    })?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err(ProxyError::ConfigError(format!(
            "Pi provider '{provider_id}' baseUrl must be an absolute HTTP(S) URL"
        )));
    }
    if url.fragment().is_some() {
        return Err(ProxyError::ConfigError(format!(
            "Pi provider '{provider_id}' baseUrl cannot contain a fragment"
        )));
    }
    Ok(())
}

fn parse_header_name(value: &str) -> Result<HeaderName, ProxyError> {
    HeaderName::from_bytes(value.as_bytes()).map_err(|error| {
        ProxyError::ConfigError(format!(
            "Invalid Pi provider header name '{value}': {error}"
        ))
    })
}

async fn resolve_config_value(value: &str, description: &str) -> Result<String, ProxyError> {
    if let Some(command) = value.strip_prefix('!') {
        return execute_config_command(command, description).await;
    }

    let chars = value.as_bytes();
    let mut resolved = String::with_capacity(value.len());
    let mut index = 0;
    while index < chars.len() {
        if chars[index] != b'$' {
            let character = value[index..]
                .chars()
                .next()
                .expect("index is on a character boundary");
            resolved.push(character);
            index += character.len_utf8();
            continue;
        }

        match chars.get(index + 1).copied() {
            Some(b'$') => {
                resolved.push('$');
                index += 2;
            }
            Some(b'!') => {
                resolved.push('!');
                index += 2;
            }
            Some(b'{') => {
                let Some(relative_end) = value[index + 2..].find('}') else {
                    resolved.push('$');
                    index += 1;
                    continue;
                };
                let end = index + 2 + relative_end;
                let name = &value[index + 2..end];
                if is_env_name(name) {
                    resolved.push_str(&read_env(name, description)?);
                } else {
                    resolved.push_str(&value[index..=end]);
                }
                index = end + 1;
            }
            Some(next) if is_env_start(next) => {
                let start = index + 1;
                let mut end = start + 1;
                while end < chars.len() && is_env_continue(chars[end]) {
                    end += 1;
                }
                resolved.push_str(&read_env(&value[start..end], description)?);
                index = end;
            }
            _ => {
                resolved.push('$');
                index += 1;
            }
        }
    }
    Ok(resolved)
}

fn is_env_name(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.first().copied().is_some_and(is_env_start)
        && bytes.iter().skip(1).copied().all(is_env_continue)
}

fn is_env_start(value: u8) -> bool {
    value == b'_' || value.is_ascii_alphabetic()
}

fn is_env_continue(value: u8) -> bool {
    is_env_start(value) || value.is_ascii_digit()
}

fn read_env(name: &str, description: &str) -> Result<String, ProxyError> {
    std::env::var(name)
        .ok()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            ProxyError::ConfigError(format!(
                "Failed to resolve Pi {description} from environment variable '{name}'"
            ))
        })
}

async fn execute_config_command(command: &str, description: &str) -> Result<String, ProxyError> {
    if command.trim().is_empty() {
        return Err(ProxyError::ConfigError(format!(
            "Failed to resolve Pi {description}: shell command is empty"
        )));
    }
    #[cfg(target_os = "windows")]
    let mut process = {
        let mut process = Command::new("cmd");
        process.args(["/C", command]);
        process
    };
    #[cfg(not(target_os = "windows"))]
    let mut process = {
        let mut process = Command::new("sh");
        process.args(["-c", command]);
        process
    };
    process.kill_on_drop(true);
    let output = tokio::time::timeout(Duration::from_secs(10), process.output())
        .await
        .map_err(|_| {
            ProxyError::ConfigError(format!(
                "Failed to resolve Pi {description}: shell command timed out"
            ))
        })?
        .map_err(|error| {
            ProxyError::ConfigError(format!(
                "Failed to resolve Pi {description} from shell command: {error}"
            ))
        })?;
    if !output.status.success() {
        return Err(ProxyError::ConfigError(format!(
            "Failed to resolve Pi {description}: shell command exited unsuccessfully"
        )));
    }
    let value = String::from_utf8(output.stdout)
        .map_err(|_| {
            ProxyError::ConfigError(format!(
                "Failed to resolve Pi {description}: shell command output is not UTF-8"
            ))
        })?
        .trim()
        .to_string();
    if value.is_empty() {
        return Err(ProxyError::ConfigError(format!(
            "Failed to resolve Pi {description}: shell command returned no value"
        )));
    }
    Ok(value)
}

pub(crate) fn extract_request_model(body: &Value, endpoint: &str) -> Option<String> {
    body.get("model")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|model| !model.is_empty())
        .map(str::to_string)
        .or_else(|| extract_google_model(endpoint))
        .or_else(|| extract_bedrock_model(endpoint))
}

fn extract_google_model(endpoint: &str) -> Option<String> {
    let path = endpoint.split_once('?').map_or(endpoint, |(path, _)| path);
    let model = path.split("/models/").nth(1)?.split(':').next()?.trim();
    (!model.is_empty()).then(|| model.to_string())
}

fn extract_bedrock_model(endpoint: &str) -> Option<String> {
    let path = endpoint.split_once('?').map_or(endpoint, |(path, _)| path);
    let encoded = path.split("/model/").nth(1)?.split('/').next()?.trim();
    if encoded.is_empty() {
        return None;
    }
    url::form_urlencoded::parse(encoded.as_bytes())
        .next()
        .map(|(model, _)| model.into_owned())
}

pub(crate) fn parse_request_body(
    raw_body: &[u8],
    headers: &HeaderMap,
) -> Result<Value, ProxyError> {
    if raw_body.is_empty() {
        return Ok(Value::Null);
    }
    let content_encoding = headers
        .get(http::header::CONTENT_ENCODING)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let decoded = match content_encoding {
        None | Some("identity") => raw_body.to_vec(),
        Some(encoding) if encoding.eq_ignore_ascii_case("zstd") => {
            let decoder =
                zstd::stream::read::Decoder::new(Cursor::new(raw_body)).map_err(|error| {
                    ProxyError::InvalidRequest(format!("Invalid Pi zstd request body: {error}"))
                })?;
            let mut decoded = Vec::new();
            decoder
                .take(MAX_DECOMPRESSED_REQUEST_BYTES + 1)
                .read_to_end(&mut decoded)
                .map_err(|error| {
                    ProxyError::InvalidRequest(format!(
                        "Failed to decode Pi zstd request body: {error}"
                    ))
                })?;
            if decoded.len() as u64 > MAX_DECOMPRESSED_REQUEST_BYTES {
                return Err(ProxyError::InvalidRequest(format!(
                    "Pi request body exceeds {MAX_DECOMPRESSED_REQUEST_BYTES} bytes after zstd decoding"
                )));
            }
            decoded
        }
        Some(_) => return Ok(Value::Null),
    };
    Ok(serde_json::from_slice(&decoded).unwrap_or(Value::Null))
}

pub(crate) fn resolved_headers(provider: &Provider) -> Result<HeaderMap, ProxyError> {
    let mut headers = HeaderMap::new();
    let configured = provider
        .settings_config
        .get("headers")
        .and_then(Value::as_object)
        .ok_or_else(|| {
            ProxyError::ConfigError(format!(
                "Resolved Pi provider '{}' headers are invalid",
                provider.id
            ))
        })?;
    for (name, value) in configured {
        let name = parse_header_name(name)?;
        let value = value.as_str().ok_or_else(|| {
            ProxyError::ConfigError(format!(
                "Resolved Pi provider '{}' header '{}' is invalid",
                provider.id, name
            ))
        })?;
        let value = HeaderValue::from_str(value).map_err(|error| {
            ProxyError::ConfigError(format!(
                "Resolved Pi provider '{}' header '{}' is invalid: {error}",
                provider.id, name
            ))
        })?;
        headers.insert(name, value);
    }
    if provider
        .settings_config
        .get("authHeader")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        let api_key = provider
            .settings_config
            .get("apiKey")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                ProxyError::ConfigError(format!(
                    "Pi provider '{}' enables authHeader without an API key",
                    provider.id
                ))
            })?;
        headers.insert(
            http::header::AUTHORIZATION,
            auth_header_value(&format!("Bearer {api_key}"))?,
        );
    }
    let api = provider
        .settings_config
        .get("api")
        .and_then(Value::as_str)
        .and_then(|value| value.parse::<PiApi>().ok());
    if matches!(api, Some(PiApi::AzureOpenAiResponses)) {
        let uses_oauth = provider
            .settings_config
            .get(RESOLVED_CREDENTIAL_TYPE_FIELD)
            .and_then(Value::as_str)
            == Some("oauth");
        if let Some(api_key) = provider
            .settings_config
            .get("apiKey")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .filter(|_| !uses_oauth)
        {
            headers.insert(
                HeaderName::from_static("api-key"),
                auth_header_value(api_key)?,
            );
        }
    }
    Ok(headers)
}

pub(crate) fn target_headers(provider: &Provider) -> Result<HeaderMap, ProxyError> {
    let mut headers = resolved_headers(provider)?;
    let adapter = PiAdapter::new();
    if let Some(auth) = adapter.extract_auth(provider) {
        for (name, value) in adapter.get_auth_headers(&auth)? {
            headers.insert(name, value);
        }
    }
    Ok(headers)
}

pub(crate) fn prepare_bedrock_headers(
    provider: &Provider,
    target_url: &str,
    method: &http::Method,
    body: &[u8],
    headers: &mut HeaderMap,
) -> Result<(), ProxyError> {
    let api = provider
        .settings_config
        .get("api")
        .and_then(Value::as_str)
        .and_then(|value| value.parse::<PiApi>().ok());
    if !api.is_some_and(PiApi::is_bedrock) {
        return Ok(());
    }

    for name in [
        "authorization",
        "x-amz-content-sha256",
        "x-amz-date",
        "x-amz-security-token",
    ] {
        if name != "authorization"
            || !headers
                .get(name)
                .and_then(|value| value.to_str().ok())
                .is_some_and(|value| value.starts_with("Bearer "))
        {
            headers.remove(name);
        }
    }
    if headers
        .get(http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.starts_with("Bearer "))
    {
        return Ok(());
    }

    let env = resolved_env(provider);
    if env_value(&env, "AWS_BEDROCK_SKIP_AUTH").as_deref() == Some("1") {
        return Ok(());
    }
    let access_key = env_value(&env, "AWS_ACCESS_KEY_ID").ok_or_else(|| {
        ProxyError::ConfigError(format!(
            "Pi Bedrock provider '{}' requires AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY or a Bedrock bearer token for proxy signing",
            provider.id
        ))
    })?;
    let secret_key = env_value(&env, "AWS_SECRET_ACCESS_KEY").ok_or_else(|| {
        ProxyError::ConfigError(format!(
            "Pi Bedrock provider '{}' requires AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY or a Bedrock bearer token for proxy signing",
            provider.id
        ))
    })?;
    let session_token = env_value(&env, "AWS_SESSION_TOKEN");
    let target = url::Url::parse(target_url).map_err(|error| {
        ProxyError::ConfigError(format!("Pi Bedrock target URL is invalid: {error}"))
    })?;
    let region = env_value(&env, "AWS_REGION")
        .or_else(|| env_value(&env, "AWS_DEFAULT_REGION"))
        .or_else(|| bedrock_region_from_host(target.host_str().unwrap_or_default()))
        .ok_or_else(|| {
            ProxyError::ConfigError(format!(
                "Pi Bedrock provider '{}' requires AWS_REGION for proxy signing",
                provider.id
            ))
        })?;
    let host = target
        .host_str()
        .map(|host| match target.port() {
            Some(port) => format!("{host}:{port}"),
            None => host.to_string(),
        })
        .ok_or_else(|| ProxyError::ConfigError("Pi Bedrock target has no host".to_string()))?;
    let timestamp = chrono::Utc::now();
    let amz_date = timestamp.format("%Y%m%dT%H%M%SZ").to_string();
    let date = timestamp.format("%Y%m%d").to_string();
    let payload_hash = hex_sha256(body);

    headers.insert(
        http::header::HOST,
        HeaderValue::from_str(&host)
            .map_err(|error| ProxyError::ConfigError(format!("Invalid Bedrock host: {error}")))?,
    );
    headers.insert(
        HeaderName::from_static("x-amz-date"),
        HeaderValue::from_str(&amz_date)
            .map_err(|error| ProxyError::ConfigError(format!("Invalid AWS date: {error}")))?,
    );
    headers.insert(
        HeaderName::from_static("x-amz-content-sha256"),
        HeaderValue::from_str(&payload_hash).map_err(|error| {
            ProxyError::ConfigError(format!("Invalid AWS payload hash: {error}"))
        })?,
    );
    if let Some(token) = &session_token {
        headers.insert(
            HeaderName::from_static("x-amz-security-token"),
            auth_header_value(token)?,
        );
    }

    let mut signed_names = vec!["host", "x-amz-content-sha256", "x-amz-date"];
    if headers.contains_key(http::header::CONTENT_TYPE) {
        signed_names.push("content-type");
    }
    if session_token.is_some() {
        signed_names.push("x-amz-security-token");
    }
    signed_names.sort_unstable();
    let canonical_headers = signed_names
        .iter()
        .map(|name| {
            let value = headers
                .get(*name)
                .and_then(|value| value.to_str().ok())
                .unwrap_or_default();
            format!("{name}:{}\n", normalize_header_value(value))
        })
        .collect::<String>();
    let signed_headers = signed_names.join(";");
    let canonical_request = format!(
        "{}\n{}\n{}\n{}\n{}\n{}",
        method.as_str(),
        canonical_aws_path(target.path()),
        canonical_aws_query(&target),
        canonical_headers,
        signed_headers,
        payload_hash
    );
    let scope = format!("{date}/{region}/bedrock/aws4_request");
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{amz_date}\n{scope}\n{}",
        hex_sha256(canonical_request.as_bytes())
    );
    let date_key = hmac_sha256(format!("AWS4{secret_key}").as_bytes(), date.as_bytes())?;
    let region_key = hmac_sha256(&date_key, region.as_bytes())?;
    let service_key = hmac_sha256(&region_key, b"bedrock")?;
    let signing_key = hmac_sha256(&service_key, b"aws4_request")?;
    let signature = hex_bytes(&hmac_sha256(&signing_key, string_to_sign.as_bytes())?);
    let authorization = format!(
        "AWS4-HMAC-SHA256 Credential={access_key}/{scope}, SignedHeaders={signed_headers}, Signature={signature}"
    );
    headers.insert(
        http::header::AUTHORIZATION,
        auth_header_value(&authorization)?,
    );
    Ok(())
}

fn resolved_env(provider: &Provider) -> Map<String, Value> {
    provider
        .settings_config
        .get(RESOLVED_ENV_FIELD)
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default()
}

fn env_value(env: &Map<String, Value>, name: &str) -> Option<String> {
    env.get(name)
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| std::env::var(name).ok().filter(|value| !value.is_empty()))
}

fn bedrock_region_from_host(host: &str) -> Option<String> {
    let mut parts = host.split('.');
    let service = parts.next()?;
    let region = parts.next()?;
    service
        .starts_with("bedrock-runtime")
        .then(|| region.to_string())
}

fn normalize_header_value(value: &str) -> String {
    value.split_ascii_whitespace().collect::<Vec<_>>().join(" ")
}

fn canonical_aws_path(path: &str) -> String {
    if path.is_empty() {
        return "/".to_string();
    }
    let bytes = path.as_bytes();
    let mut output = String::with_capacity(path.len());
    let mut index = 0;
    while index < bytes.len() {
        let byte = bytes[index];
        if byte == b'/' || byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~')
        {
            output.push(byte as char);
            index += 1;
        } else if byte == b'%'
            && bytes.get(index + 1).is_some_and(u8::is_ascii_hexdigit)
            && bytes.get(index + 2).is_some_and(u8::is_ascii_hexdigit)
        {
            output.push('%');
            output.push((bytes[index + 1] as char).to_ascii_uppercase());
            output.push((bytes[index + 2] as char).to_ascii_uppercase());
            index += 3;
        } else {
            output.push_str(&format!("%{byte:02X}"));
            index += 1;
        }
    }
    output
}

fn canonical_aws_query(url: &url::Url) -> String {
    let mut pairs = url
        .query_pairs()
        .map(|(name, value)| (aws_percent_encode(&name), aws_percent_encode(&value)))
        .collect::<Vec<_>>();
    pairs.sort_unstable();
    pairs
        .into_iter()
        .map(|(name, value)| format!("{name}={value}"))
        .collect::<Vec<_>>()
        .join("&")
}

fn aws_percent_encode(value: &str) -> String {
    value
        .as_bytes()
        .iter()
        .map(|byte| {
            if byte.is_ascii_alphanumeric() || matches!(*byte, b'-' | b'_' | b'.' | b'~') {
                (*byte as char).to_string()
            } else {
                format!("%{byte:02X}")
            }
        })
        .collect()
}

fn hex_sha256(value: &[u8]) -> String {
    hex_bytes(&Sha256::digest(value))
}

fn hex_bytes(value: &[u8]) -> String {
    value.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn hmac_sha256(key: &[u8], value: &[u8]) -> Result<Vec<u8>, ProxyError> {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).map_err(|error| {
        ProxyError::Internal(format!("Failed to initialize AWS signer: {error}"))
    })?;
    mac.update(value);
    Ok(mac.finalize().into_bytes().to_vec())
}

pub struct PiAdapter;

impl PiAdapter {
    pub fn new() -> Self {
        Self
    }
}

impl ProviderAdapter for PiAdapter {
    fn name(&self) -> &'static str {
        "Pi"
    }

    fn extract_base_url(&self, provider: &Provider) -> Result<String, ProxyError> {
        provider
            .settings_config
            .get("baseUrl")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|url| !url.is_empty())
            .map(|url| url.trim_end_matches('/').to_string())
            .ok_or_else(|| {
                ProxyError::ConfigError(format!(
                    "Resolved Pi provider '{}' is missing baseUrl",
                    provider.id
                ))
            })
    }

    fn extract_auth(&self, provider: &Provider) -> Option<AuthInfo> {
        let api = provider
            .settings_config
            .get("api")
            .and_then(Value::as_str)?
            .parse::<PiApi>()
            .ok()?;
        let strategy = if provider
            .settings_config
            .get(RESOLVED_CREDENTIAL_TYPE_FIELD)
            .and_then(Value::as_str)
            == Some("oauth")
        {
            AuthStrategy::Bearer
        } else {
            api.auth_strategy()?
        };
        provider
            .settings_config
            .get("apiKey")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|key| !key.is_empty())
            .map(|key| AuthInfo::new(key.to_string(), strategy))
    }

    fn build_url(&self, base_url: &str, endpoint: &str) -> String {
        let (path, query) = endpoint
            .split_once('?')
            .map_or((endpoint, None), |(path, query)| (path, Some(query)));
        let mut url = format!(
            "{}/{}",
            base_url.trim_end_matches('/'),
            path.trim_start_matches('/')
        );
        if let Some(query) = query.filter(|query| !query.is_empty()) {
            url.push('?');
            url.push_str(query);
        }
        url
    }

    fn get_auth_headers(
        &self,
        auth: &AuthInfo,
    ) -> Result<Vec<(HeaderName, HeaderValue)>, ProxyError> {
        match auth.strategy {
            AuthStrategy::Anthropic => Ok(vec![(
                HeaderName::from_static("x-api-key"),
                auth_header_value(&auth.api_key)?,
            )]),
            AuthStrategy::Google => Ok(vec![(
                HeaderName::from_static("x-goog-api-key"),
                auth_header_value(&auth.api_key)?,
            )]),
            _ => Ok(vec![(
                HeaderName::from_static("authorization"),
                auth_header_value(&format!("Bearer {}", auth.api_key))?,
            )]),
        }
    }
}

pub(crate) fn parser_config(api: PiApi) -> &'static UsageParserConfig {
    use crate::proxy::handler_config::{
        PI_ANTHROPIC_PARSER_CONFIG, PI_BEDROCK_PARSER_CONFIG, PI_GEMINI_PARSER_CONFIG,
        PI_MESSAGES_PARSER_CONFIG, PI_MISTRAL_PARSER_CONFIG, PI_OPENAI_PARSER_CONFIG,
        PI_OPENROUTER_IMAGES_PARSER_CONFIG, PI_RESPONSES_PARSER_CONFIG,
    };
    match api {
        PiApi::AnthropicMessages => &PI_ANTHROPIC_PARSER_CONFIG,
        PiApi::GoogleGenerativeAi | PiApi::GoogleVertex => &PI_GEMINI_PARSER_CONFIG,
        PiApi::OpenAiResponses | PiApi::OpenAiCodexResponses | PiApi::AzureOpenAiResponses => {
            &PI_RESPONSES_PARSER_CONFIG
        }
        PiApi::OpenAiCompletions => &PI_OPENAI_PARSER_CONFIG,
        PiApi::MistralConversations => &PI_MISTRAL_PARSER_CONFIG,
        PiApi::PiMessages => &PI_MESSAGES_PARSER_CONFIG,
        PiApi::OpenRouterImages => &PI_OPENROUTER_IMAGES_PARSER_CONFIG,
        PiApi::BedrockConverseStream => &PI_BEDROCK_PARSER_CONFIG,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn provider(settings: Value) -> Provider {
        Provider::with_id(
            "pi-provider".to_string(),
            "Pi Provider".to_string(),
            settings,
            None,
        )
    }

    #[tokio::test]
    async fn resolves_model_overrides_and_config_templates() {
        std::env::set_var("STACKFERRY_PI_TEST_KEY", "resolved-key");
        let provider = provider(json!({
            "baseUrl": "https://provider.example/v1",
            "api": "openai-completions",
            "apiKey": "$STACKFERRY_PI_TEST_KEY",
            "headers": {"X-Provider": "provider", "X-Literal": "$$HOME/$!cmd"},
            "models": [{
                "id": "model-a",
                "api": "anthropic-messages",
                "baseUrl": "https://model.example/anthropic",
                "headers": {"X-Provider": "model", "X-Model": "${STACKFERRY_PI_TEST_KEY}"}
            }]
        }));

        let unresolved = plan_provider(&provider, Some("model-a"))
            .unwrap()
            .unwrap()
            .into_provider();
        let resolved = resolve_provider(&unresolved).await.unwrap();
        std::env::remove_var("STACKFERRY_PI_TEST_KEY");

        assert_eq!(resolved.settings_config["api"], json!("anthropic-messages"));
        assert_eq!(
            resolved.settings_config["baseUrl"],
            json!("https://model.example/anthropic")
        );
        assert_eq!(resolved.settings_config["apiKey"], json!("resolved-key"));
        assert_eq!(
            resolved.settings_config["headers"]["X-Provider"],
            json!("model")
        );
        assert_eq!(
            resolved.settings_config["headers"]["X-Model"],
            json!("resolved-key")
        );
        assert_eq!(
            resolved.settings_config["headers"]["X-Literal"],
            json!("$HOME/!cmd")
        );
    }

    #[tokio::test]
    async fn resolves_usage_credentials_from_literal_provider_config() {
        let provider = provider(json!({
            "baseUrl": "https://provider.example/v1/",
            "apiKey": "literal-key"
        }));

        let credentials = resolve_usage_credentials(&provider, None, None)
            .await
            .unwrap();

        assert_eq!(credentials.0, "https://provider.example/v1");
        assert_eq!(credentials.1, "literal-key");
    }

    #[tokio::test]
    async fn resolves_usage_credentials_from_environment_reference() {
        std::env::set_var("STACKFERRY_PI_USAGE_TEST_KEY", "environment-key");
        let provider = provider(json!({
            "baseUrl": "https://provider.example/v1",
            "apiKey": "${STACKFERRY_PI_USAGE_TEST_KEY}"
        }));

        let credentials = resolve_usage_credentials(&provider, None, None)
            .await
            .unwrap();
        std::env::remove_var("STACKFERRY_PI_USAGE_TEST_KEY");

        assert_eq!(credentials.1, "environment-key");
    }

    #[tokio::test]
    async fn usage_credential_error_does_not_include_secret_values() {
        let provider = provider(json!({
            "baseUrl": "https://provider.example/v1",
            "apiKey": "$STACKFERRY_PI_USAGE_MISSING_SECRET"
        }));

        let error = resolve_usage_credentials(&provider, None, None)
            .await
            .unwrap_err()
            .to_string();

        assert!(error.contains("STACKFERRY_PI_USAGE_MISSING_SECRET"));
        assert!(!error.contains("environment-key"));
        assert!(!error.contains("Authorization"));
    }

    #[test]
    fn rejects_unsupported_api_with_its_value() {
        let provider = provider(json!({
            "baseUrl": "https://provider.example/v1",
            "api": "unknown-wire-api",
            "models": [{"id": "model-a"}]
        }));
        let error = plan_provider(&provider, Some("model-a"))
            .err()
            .expect("unsupported API must fail");
        assert!(error.to_string().contains("unknown-wire-api"));
    }

    #[test]
    fn extracts_body_and_google_path_models() {
        assert_eq!(
            extract_request_model(&json!({"model": "chat-model"}), "/chat/completions"),
            Some("chat-model".to_string())
        );
        assert_eq!(
            extract_request_model(
                &Value::Null,
                "/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse"
            ),
            Some("gemini-2.5-pro".to_string())
        );
        assert_eq!(
            extract_request_model(
                &Value::Null,
                "/model/us.anthropic.claude-sonnet-4-20250514-v1%3A0/converse-stream"
            ),
            Some("us.anthropic.claude-sonnet-4-20250514-v1:0".to_string())
        );
    }

    #[test]
    fn parses_zstd_body_for_routing_without_changing_raw_bytes() {
        let raw = serde_json::to_vec(&json!({
            "type": "response.create",
            "model": "gpt-5.4",
            "input": [{"role": "user", "content": "hello"}]
        }))
        .unwrap();
        let compressed = zstd::stream::encode_all(Cursor::new(&raw), 3).unwrap();
        let mut headers = HeaderMap::new();
        headers.insert(
            http::header::CONTENT_ENCODING,
            HeaderValue::from_static("zstd"),
        );

        let parsed = parse_request_body(&compressed, &headers).unwrap();
        assert_eq!(parsed["model"], json!("gpt-5.4"));
        assert_ne!(compressed, raw);
    }

    #[test]
    fn azure_uses_api_key_header() {
        let provider = provider(json!({
            "baseUrl": "https://resource.openai.azure.com/openai/v1",
            "api": "azure-openai-responses",
            "apiKey": "azure-secret",
            "authHeader": false,
            "headers": {}
        }));

        let headers = target_headers(&provider).unwrap();
        assert_eq!(
            headers.get("api-key").and_then(|value| value.to_str().ok()),
            Some("azure-secret")
        );
        assert!(!headers.contains_key(http::header::AUTHORIZATION));
    }

    #[test]
    fn oauth_credentials_use_bearer_for_vertex_and_azure() {
        for api in ["google-vertex", "azure-openai-responses"] {
            let provider = provider(json!({
                "baseUrl": "https://cloud.example/v1",
                "api": api,
                "apiKey": "oauth-access-token",
                "authHeader": false,
                "headers": {},
                RESOLVED_CREDENTIAL_TYPE_FIELD: "oauth"
            }));

            let headers = target_headers(&provider).unwrap();
            assert_eq!(
                headers
                    .get(http::header::AUTHORIZATION)
                    .and_then(|value| value.to_str().ok()),
                Some("Bearer oauth-access-token")
            );
            assert!(!headers.contains_key("api-key"));
            assert!(!headers.contains_key("x-goog-api-key"));
        }
    }

    #[test]
    fn bedrock_replaces_local_signature_with_target_signature() {
        let provider = provider(json!({
            "baseUrl": "https://bedrock-runtime.us-west-2.amazonaws.com",
            "api": "bedrock-converse-stream",
            "authHeader": false,
            "headers": {},
            "__stackferryResolvedEnv": {
                "AWS_ACCESS_KEY_ID": "AKIDEXAMPLE",
                "AWS_SECRET_ACCESS_KEY": "secret-example",
                "AWS_SESSION_TOKEN": "session-example",
                "AWS_REGION": "us-west-2"
            }
        }));
        let mut headers = HeaderMap::new();
        headers.insert(
            http::header::AUTHORIZATION,
            HeaderValue::from_static("AWS4-HMAC-SHA256 Credential=LOCAL/invalid"),
        );
        headers.insert(
            http::header::CONTENT_TYPE,
            HeaderValue::from_static("application/json"),
        );
        let body = br#"{"messages":[]}"#;

        prepare_bedrock_headers(
            &provider,
            "https://bedrock-runtime.us-west-2.amazonaws.com/model/us.anthropic.test%3A0/converse-stream",
            &http::Method::POST,
            body,
            &mut headers,
        )
        .unwrap();

        let authorization = headers
            .get(http::header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .unwrap();
        assert!(authorization.starts_with("AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/"));
        assert!(authorization.contains("/us-west-2/bedrock/aws4_request"));
        assert!(authorization.contains(
            "SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date;x-amz-security-token"
        ));
        assert_eq!(
            headers
                .get(http::header::HOST)
                .and_then(|value| value.to_str().ok()),
            Some("bedrock-runtime.us-west-2.amazonaws.com")
        );
        assert_eq!(
            headers
                .get("x-amz-security-token")
                .and_then(|value| value.to_str().ok()),
            Some("session-example")
        );
        assert_eq!(
            headers
                .get("x-amz-content-sha256")
                .and_then(|value| value.to_str().ok()),
            Some(hex_sha256(body).as_str())
        );
    }
}
