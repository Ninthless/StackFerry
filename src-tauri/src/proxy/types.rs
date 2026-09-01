pub(crate) use crate::infrastructure::persistence::{
    AppProxyConfig, CopilotOptimizerConfig, GlobalProxyConfig, LiveBackup, LogConfig,
    OptimizerConfig, ProviderHealth, ProxyConfig, RectifierConfig,
};
use serde::{Deserialize, Serialize};

/// 代理服务器状态
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProxyStatus {
    /// 是否运行中
    pub running: bool,
    /// 监听地址
    pub address: String,
    /// 监听端口
    pub port: u16,
    /// 活跃连接数
    pub active_connections: usize,
    /// 总请求数
    pub total_requests: u64,
    /// 成功请求数
    pub success_requests: u64,
    /// 失败请求数
    pub failed_requests: u64,
    /// 成功率 (0-100)
    pub success_rate: f32,
    /// 运行时间（秒）
    pub uptime_seconds: u64,
    /// 当前使用的Provider名称
    pub current_provider: Option<String>,
    /// 当前Provider的ID
    pub current_provider_id: Option<String>,
    /// 最后一次请求时间
    pub last_request_at: Option<String>,
    /// 最后一次错误信息
    pub last_error: Option<String>,
    /// Provider故障转移次数
    pub failover_count: u64,
    /// 当前活跃的代理目标列表
    #[serde(default)]
    pub active_targets: Vec<ActiveTarget>,
}

/// 活跃的代理目标信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveTarget {
    pub app_type: String, // "Claude" | "Codex" | "Gemini"
    pub provider_name: String,
    pub provider_id: String,
}

/// 代理服务器信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyServerInfo {
    pub address: String,
    pub port: u16,
    pub started_at: String,
}

/// 各应用的接管状态（是否改写该应用的 Live 配置指向本地代理）
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProxyTakeoverStatus {
    pub claude: bool,
    pub codex: bool,
    pub gemini: bool,
    pub grokbuild: bool,
    pub pi: bool,
    pub opencode: bool,
    pub openclaw: bool,
}

/// API 格式类型（预留，当前不需要格式转换）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum ApiFormat {
    Claude,
    OpenAI,
    Gemini,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rectifier_config_default_enabled() {
        // 验证 RectifierConfig::default() 返回全开启状态
        let config = RectifierConfig::default();
        assert!(config.enabled, "整流器总开关默认应为 true");
        assert!(
            config.request_thinking_signature,
            "thinking 签名整流器默认应为 true"
        );
        assert!(
            config.request_thinking_budget,
            "thinking budget 整流器默认应为 true"
        );
        assert!(
            config.request_media_fallback,
            "media 降级总开关默认应为 true"
        );
        assert!(
            config.request_media_heuristic,
            "启发式 text-only 模型识别默认应为 true"
        );
    }

    #[test]
    fn test_rectifier_config_serde_default() {
        // 验证反序列化缺字段时使用默认值 true
        let json = "{}";
        let config: RectifierConfig = serde_json::from_str(json).unwrap();
        assert!(config.enabled);
        assert!(config.request_thinking_signature);
        assert!(config.request_thinking_budget);
        assert!(
            config.request_media_fallback,
            "缺 requestMediaFallback 时应回退默认值 true"
        );
        assert!(
            config.request_media_heuristic,
            "缺 requestMediaHeuristic 时应回退默认值 true"
        );
    }

    #[test]
    fn test_rectifier_config_serde_explicit_true() {
        // 验证显式设置 true 时正确反序列化
        let json =
            r#"{"enabled": true, "requestThinkingSignature": true, "requestThinkingBudget": true}"#;
        let config: RectifierConfig = serde_json::from_str(json).unwrap();
        assert!(config.enabled);
        assert!(config.request_thinking_signature);
        assert!(config.request_thinking_budget);
    }

    #[test]
    fn test_rectifier_config_serde_partial_fields() {
        // 验证只设置部分字段时，缺失字段使用默认值 true
        let json = r#"{"enabled": true, "requestThinkingSignature": false}"#;
        let config: RectifierConfig = serde_json::from_str(json).unwrap();
        assert!(config.enabled);
        assert!(!config.request_thinking_signature);
        assert!(config.request_thinking_budget);
    }

    #[test]
    fn test_rectifier_config_serde_media_explicit_false() {
        // 验证 media 两字段显式 false 时被如实反序列化（用户主动关闭须生效，不能被默认值覆盖）
        let json = r#"{"requestMediaFallback": false, "requestMediaHeuristic": false}"#;
        let config: RectifierConfig = serde_json::from_str(json).unwrap();
        assert!(!config.request_media_fallback);
        assert!(!config.request_media_heuristic);
        // 其余字段仍走默认 true
        assert!(config.enabled);
        assert!(config.request_thinking_signature);
        assert!(config.request_thinking_budget);
    }

    #[test]
    fn test_log_config_default() {
        let config = LogConfig::default();
        assert!(config.enabled);
        assert_eq!(config.level, "info");
    }

    #[test]
    fn test_log_config_serde_default() {
        let json = "{}";
        let config: LogConfig = serde_json::from_str(json).unwrap();
        assert!(config.enabled);
        assert_eq!(config.level, "info");
    }

    #[test]
    fn test_log_config_to_level_filter() {
        let config = LogConfig {
            level: "error".to_string(),
            ..Default::default()
        };
        assert_eq!(config.to_level_filter(), log::LevelFilter::Error);

        let config = LogConfig {
            level: "warn".to_string(),
            ..Default::default()
        };
        assert_eq!(config.to_level_filter(), log::LevelFilter::Warn);

        let config = LogConfig {
            level: "info".to_string(),
            ..Default::default()
        };
        assert_eq!(config.to_level_filter(), log::LevelFilter::Info);

        let config = LogConfig {
            level: "debug".to_string(),
            ..Default::default()
        };
        assert_eq!(config.to_level_filter(), log::LevelFilter::Debug);

        let config = LogConfig {
            level: "trace".to_string(),
            ..Default::default()
        };
        assert_eq!(config.to_level_filter(), log::LevelFilter::Trace);

        // 无效级别回退到 info
        let config = LogConfig {
            level: "invalid".to_string(),
            ..Default::default()
        };
        assert_eq!(config.to_level_filter(), log::LevelFilter::Info);

        // 禁用时返回 Off
        let config = LogConfig {
            enabled: false,
            level: "debug".to_string(),
        };
        assert_eq!(config.to_level_filter(), log::LevelFilter::Off);
    }

    #[test]
    fn test_log_config_serde_roundtrip() {
        let config = LogConfig {
            enabled: true,
            level: "debug".to_string(),
        };
        let json = serde_json::to_string(&config).unwrap();
        let parsed: LogConfig = serde_json::from_str(&json).unwrap();
        assert!(parsed.enabled);
        assert_eq!(parsed.level, "debug");
    }
}
