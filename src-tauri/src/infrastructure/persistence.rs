use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentInstance {
    pub id: String,
    pub provider_id: String,
    pub app_type: String,
    pub name: String,
    pub credential_ref: String,
    pub codex_home: Option<String>,
    pub runtime_home: Option<String>,
    pub recent_project_dir: Option<String>,
    pub last_launched_at: Option<i64>,
    pub runtime_config: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionCredentialBinding {
    pub app_type: String,
    pub session_id: String,
    pub provider_id: String,
    pub instance_id: String,
    pub created_at: i64,
    pub last_used_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FailoverQueueItem {
    pub provider_id: String,
    pub provider_name: String,
    pub queue_order: usize,
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_notes: Option<String>,
}

#[derive(Debug, Clone)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub payload: String,
    pub sort_order: Option<i64>,
    pub created_at: Option<i64>,
    pub updated_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    pub filename: String,
    pub size_bytes: u64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillRepo {
    pub owner: String,
    pub name: String,
    pub branch: String,
    pub enabled: bool,
}

pub fn default_skill_repos() -> Vec<SkillRepo> {
    [
        ("anthropics", "skills", "main"),
        ("ComposioHQ", "awesome-claude-skills", "master"),
        ("cexll", "myclaude", "master"),
        ("JimLiu", "baoyu-skills", "main"),
    ]
    .into_iter()
    .map(|(owner, name, branch)| SkillRepo {
        owner: owner.to_string(),
        name: name.to_string(),
        branch: branch.to_string(),
        enabled: true,
    })
    .collect()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum HealthStatus {
    Operational,
    Degraded,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamCheckConfig {
    pub timeout_secs: u64,
    pub max_retries: u32,
    pub degraded_threshold_ms: u64,
}

impl Default for StreamCheckConfig {
    fn default() -> Self {
        Self {
            timeout_secs: 8,
            max_retries: 1,
            degraded_threshold_ms: 6000,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamCheckResult {
    pub status: HealthStatus,
    pub success: bool,
    pub message: String,
    pub response_time_ms: Option<u64>,
    pub http_status: Option<u16>,
    pub model_used: String,
    pub tested_at: i64,
    pub retry_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_category: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyConfig {
    pub listen_address: String,
    pub listen_port: u16,
    pub max_retries: u8,
    pub request_timeout: u64,
    pub enable_logging: bool,
    #[serde(default)]
    pub live_takeover_active: bool,
    #[serde(default = "default_streaming_first_byte_timeout")]
    pub streaming_first_byte_timeout: u64,
    #[serde(default = "default_streaming_idle_timeout")]
    pub streaming_idle_timeout: u64,
    #[serde(default = "default_non_streaming_timeout")]
    pub non_streaming_timeout: u64,
}

impl Default for ProxyConfig {
    fn default() -> Self {
        Self {
            listen_address: "127.0.0.1".to_string(),
            listen_port: 15721,
            max_retries: 3,
            request_timeout: 600,
            enable_logging: true,
            live_takeover_active: false,
            streaming_first_byte_timeout: default_streaming_first_byte_timeout(),
            streaming_idle_timeout: default_streaming_idle_timeout(),
            non_streaming_timeout: default_non_streaming_timeout(),
        }
    }
}

fn default_streaming_first_byte_timeout() -> u64 {
    60
}

fn default_streaming_idle_timeout() -> u64 {
    120
}

fn default_non_streaming_timeout() -> u64 {
    600
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderHealth {
    pub provider_id: String,
    pub app_type: String,
    pub is_healthy: bool,
    pub consecutive_failures: u32,
    pub last_success_at: Option<String>,
    pub last_failure_at: Option<String>,
    pub last_error: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveBackup {
    pub app_type: String,
    pub original_config: String,
    pub backed_up_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalProxyConfig {
    pub proxy_enabled: bool,
    pub listen_address: String,
    pub listen_port: u16,
    pub enable_logging: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppProxyConfig {
    pub app_type: String,
    pub enabled: bool,
    pub auto_failover_enabled: bool,
    pub circuit_auto_recovery_enabled: bool,
    pub max_retries: u32,
    pub streaming_first_byte_timeout: u32,
    pub streaming_idle_timeout: u32,
    pub non_streaming_timeout: u32,
    pub circuit_failure_threshold: u32,
    pub circuit_success_threshold: u32,
    pub circuit_timeout_seconds: u32,
    pub circuit_error_rate_threshold: f64,
    pub circuit_min_requests: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RectifierConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_true")]
    pub request_thinking_signature: bool,
    #[serde(default = "default_true")]
    pub request_thinking_budget: bool,
    #[serde(default = "default_true")]
    pub request_media_fallback: bool,
    #[serde(default = "default_true")]
    pub request_media_heuristic: bool,
}

impl Default for RectifierConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            request_thinking_signature: true,
            request_thinking_budget: true,
            request_media_fallback: true,
            request_media_heuristic: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimizerConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_true")]
    pub thinking_optimizer: bool,
    #[serde(default = "default_true")]
    pub cache_injection: bool,
}

impl Default for OptimizerConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            thinking_optimizer: true,
            cache_injection: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CopilotOptimizerConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_true")]
    pub request_classification: bool,
    #[serde(default = "default_true")]
    pub tool_result_merging: bool,
    #[serde(default = "default_true")]
    pub compact_detection: bool,
    #[serde(default = "default_true")]
    pub deterministic_request_id: bool,
    #[serde(default = "default_true")]
    pub subagent_detection: bool,
    #[serde(default = "default_true")]
    pub warmup_downgrade: bool,
    #[serde(default = "default_warmup_model")]
    pub warmup_model: String,
    #[serde(default = "default_true")]
    pub strip_thinking: bool,
}

impl Default for CopilotOptimizerConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            request_classification: true,
            tool_result_merging: true,
            compact_detection: true,
            deterministic_request_id: true,
            subagent_detection: true,
            warmup_downgrade: true,
            warmup_model: default_warmup_model(),
            strip_thinking: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_log_level")]
    pub level: String,
}

impl Default for LogConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            level: default_log_level(),
        }
    }
}

impl LogConfig {
    pub fn to_level_filter(&self) -> log::LevelFilter {
        if !self.enabled {
            return log::LevelFilter::Off;
        }
        match self.level.to_lowercase().as_str() {
            "error" => log::LevelFilter::Error,
            "warn" => log::LevelFilter::Warn,
            "info" => log::LevelFilter::Info,
            "debug" => log::LevelFilter::Debug,
            "trace" => log::LevelFilter::Trace,
            _ => log::LevelFilter::Info,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CircuitBreakerConfig {
    pub failure_threshold: u32,
    pub success_threshold: u32,
    pub timeout_seconds: u64,
    pub auto_recovery_enabled: bool,
    pub error_rate_threshold: f64,
    pub min_requests: u32,
}

impl From<&AppProxyConfig> for CircuitBreakerConfig {
    fn from(config: &AppProxyConfig) -> Self {
        Self {
            failure_threshold: config.circuit_failure_threshold,
            success_threshold: config.circuit_success_threshold,
            timeout_seconds: config.circuit_timeout_seconds as u64,
            auto_recovery_enabled: config.circuit_auto_recovery_enabled,
            error_rate_threshold: config.circuit_error_rate_threshold,
            min_requests: config.circuit_min_requests,
        }
    }
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 4,
            success_threshold: 2,
            timeout_seconds: 60,
            auto_recovery_enabled: true,
            error_rate_threshold: 0.6,
            min_requests: 10,
        }
    }
}

fn default_true() -> bool {
    true
}

fn default_warmup_model() -> String {
    "gpt-5-mini".to_string()
}

fn default_log_level() -> String {
    "info".to_string()
}
