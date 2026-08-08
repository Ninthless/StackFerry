//! Usage Logger - 记录 API 请求使用情况

use super::calculator::{CostBreakdown, CostCalculator, ModelPricing};
use super::parser::TokenUsage;
use crate::database::{Database, PRICING_SOURCE_REQUEST, PRICING_SOURCE_RESPONSE};
use crate::error::AppError;
#[cfg(test)]
use crate::services::sql_helpers::{INPUT_TOKEN_SEMANTICS_FRESH, INPUT_TOKEN_SEMANTICS_TOTAL};
use crate::services::usage_stats::{find_model_pricing_row, is_placeholder_pricing_model};
use rusqlite::OptionalExtension;
use rust_decimal::Decimal;
use sha2::{Digest, Sha256};
use std::str::FromStr;

#[derive(Debug, PartialEq, Eq)]
struct UsageSemantic {
    app_type: String,
    api_type: String,
    provider_id: String,
    model: String,
    input_token_semantics: i64,
    input_tokens: u32,
    output_tokens: u32,
    cache_read_tokens: u32,
    cache_creation_tokens: u32,
    reasoning_tokens: u32,
    cache_creation_1h_tokens: u32,
    status_code: u16,
}

impl UsageSemantic {
    fn from_log(log: &RequestLog) -> Self {
        Self {
            app_type: log.app_type.clone(),
            api_type: log.api_type.clone(),
            provider_id: log.provider_id.clone(),
            model: log.model.clone(),
            input_token_semantics: log.input_token_semantics,
            input_tokens: log.usage.input_tokens,
            output_tokens: log.usage.output_tokens,
            cache_read_tokens: log.usage.cache_read_tokens,
            cache_creation_tokens: log.usage.cache_creation_tokens,
            reasoning_tokens: log.usage.reasoning_tokens,
            cache_creation_1h_tokens: log.usage.cache_creation_1h_tokens,
            status_code: log.status_code,
        }
    }

    fn sha256(&self) -> String {
        let encoded = serde_json::to_vec(&(
            &self.app_type,
            &self.api_type,
            &self.provider_id,
            &self.model,
            self.input_token_semantics,
            self.input_tokens,
            self.output_tokens,
            self.cache_read_tokens,
            self.cache_creation_tokens,
            self.reasoning_tokens,
            self.cache_creation_1h_tokens,
            self.status_code,
        ))
        .expect("usage semantic tuple is serializable");
        Sha256::digest(encoded)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect()
    }
}

/// 请求日志
#[derive(Debug, Clone)]
pub struct RequestLog {
    pub request_id: String,
    pub provider_id: String,
    pub app_type: String,
    pub api_type: String,
    pub model: String,
    pub request_model: String,
    /// 写入时实际用于计价的模型名（pricing_model_source 解析后的结果）。
    /// 落库供回填使用：缺价行补价后必须按写入时的基准重算，而不是
    /// 用 model/request_model 猜——路由接管下三者可能各不相同。
    /// 错误行（未计价）为空字符串。
    pub pricing_model: String,
    pub input_token_semantics: i64,
    pub usage: TokenUsage,
    pub cost: Option<CostBreakdown>,
    pub latency_ms: u64,
    pub first_token_ms: Option<u64>,
    pub status_code: u16,
    pub error_message: Option<String>,
    pub failure_kind: Option<String>,
    pub route_trace: Option<String>,
    pub session_id: Option<String>,
    /// 供应商类型 (claude, claude_auth, codex, gemini, gemini_cli, openrouter)
    pub provider_type: Option<String>,
    /// 是否为流式请求
    pub is_streaming: bool,
    /// 成本倍数
    pub cost_multiplier: String,
}

/// 使用量记录器
pub struct UsageLogger<'a> {
    db: &'a Database,
}

impl<'a> UsageLogger<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    /// 记录成功的请求
    pub fn log_request(&self, log: &RequestLog) -> Result<(), AppError> {
        let conn = crate::database::lock_conn!(self.db.conn);

        let (input_cost, output_cost, cache_read_cost, cache_creation_cost, total_cost) =
            if let Some(cost) = &log.cost {
                (
                    cost.input_cost.to_string(),
                    cost.output_cost.to_string(),
                    cost.cache_read_cost.to_string(),
                    cost.cache_creation_cost.to_string(),
                    cost.total_cost.to_string(),
                )
            } else {
                (
                    "0".to_string(),
                    "0".to_string(),
                    "0".to_string(),
                    "0".to_string(),
                    "0".to_string(),
                )
            };

        let created_at = chrono::Utc::now().timestamp();
        let semantic = UsageSemantic::from_log(log);
        let existing = Self::load_existing_semantic(&conn, &log.request_id)?;

        let (request_id, replace_session_log, collision) = match existing {
            None => (log.request_id.clone(), false, false),
            Some((data_source, _existing_semantic))
                if data_source.as_deref() == Some("session_log") =>
            {
                (log.request_id.clone(), true, false)
            }
            Some((data_source, existing_semantic))
                if data_source.as_deref().unwrap_or("proxy") == "proxy"
                    && existing_semantic == semantic =>
            {
                return Ok(());
            }
            Some(_) => {
                let fallback = format!("{}:collision:{}", log.request_id, semantic.sha256());
                if let Some((data_source, existing_semantic)) =
                    Self::load_existing_semantic(&conn, &fallback)?
                {
                    if data_source.as_deref().unwrap_or("proxy") == "proxy"
                        && existing_semantic == semantic
                    {
                        return Ok(());
                    }
                    return Err(AppError::Database(format!(
                        "usage collision fallback 主键发生 SHA-256 冲突: {fallback}"
                    )));
                }
                (fallback, false, true)
            }
        };

        let insert_verb = if replace_session_log {
            "INSERT OR REPLACE"
        } else {
            "INSERT OR IGNORE"
        };
        let sql = format!(
            "{insert_verb} INTO proxy_request_logs (
                request_id, provider_id, app_type, model, request_model, pricing_model, api_type,
                upstream_response_id,
                input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
                reasoning_tokens, cache_creation_1h_tokens, input_token_semantics,
                input_cost_usd, output_cost_usd, cache_read_cost_usd, cache_creation_cost_usd, total_cost_usd,
                latency_ms, first_token_ms, status_code, error_message, session_id,
                provider_type, is_streaming, cost_multiplier, created_at, failure_kind, route_trace
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31)"
        );
        let affected_rows = conn
            .execute(
                &sql,
                rusqlite::params![
                    request_id,
                    log.provider_id,
                    log.app_type,
                    log.model,
                    log.request_model,
                    log.pricing_model,
                    log.api_type,
                    log.usage.message_id.as_deref(),
                    log.usage.input_tokens,
                    log.usage.output_tokens,
                    log.usage.cache_read_tokens,
                    log.usage.cache_creation_tokens,
                    log.usage.reasoning_tokens,
                    log.usage.cache_creation_1h_tokens,
                    log.input_token_semantics,
                    input_cost,
                    output_cost,
                    cache_read_cost,
                    cache_creation_cost,
                    total_cost,
                    log.latency_ms as i64,
                    log.first_token_ms.map(|v| v as i64),
                    log.status_code as i64,
                    log.error_message,
                    log.session_id,
                    log.provider_type,
                    log.is_streaming as i64,
                    log.cost_multiplier,
                    created_at,
                    log.failure_kind,
                    log.route_trace,
                ],
            )
            .map_err(|e| AppError::Database(format!("记录请求日志失败: {e}")))?;

        if affected_rows > 0 {
            if collision {
                log::warn!(
                    "usage request_id collision: primary={}, fallback={request_id}",
                    log.request_id
                );
            }
            crate::usage_events::notify_log_recorded();
        }

        Ok(())
    }

    fn load_existing_semantic(
        conn: &rusqlite::Connection,
        request_id: &str,
    ) -> Result<Option<(Option<String>, UsageSemantic)>, AppError> {
        conn.query_row(
            "SELECT data_source, app_type, api_type, provider_id, model, input_token_semantics,
                    input_tokens, output_tokens, cache_read_tokens,
                    cache_creation_tokens, reasoning_tokens,
                    cache_creation_1h_tokens, status_code
             FROM proxy_request_logs WHERE request_id = ?1",
            [request_id],
            |row| {
                Ok((
                    row.get(0)?,
                    UsageSemantic {
                        app_type: row.get(1)?,
                        api_type: row.get(2)?,
                        provider_id: row.get(3)?,
                        model: row.get(4)?,
                        input_token_semantics: row.get(5)?,
                        input_tokens: row.get::<_, i64>(6)? as u32,
                        output_tokens: row.get::<_, i64>(7)? as u32,
                        cache_read_tokens: row.get::<_, i64>(8)? as u32,
                        cache_creation_tokens: row.get::<_, i64>(9)? as u32,
                        reasoning_tokens: row.get::<_, i64>(10)? as u32,
                        cache_creation_1h_tokens: row.get::<_, i64>(11)? as u32,
                        status_code: row.get::<_, i64>(12)? as u16,
                    },
                ))
            },
        )
        .optional()
        .map_err(|error| AppError::Database(format!("查询 usage request_id 失败: {error}")))
    }

    /// 记录失败的请求
    ///
    /// 用于记录无法从上游获取 usage 信息的失败请求
    #[allow(dead_code, clippy::too_many_arguments)]
    pub fn log_error(
        &self,
        request_id: String,
        provider_id: String,
        app_type: String,
        model: String,
        status_code: u16,
        error_message: String,
        latency_ms: u64,
    ) -> Result<(), AppError> {
        let request_model = model.clone();
        let api_type = app_type.clone();
        let input_token_semantics =
            crate::services::sql_helpers::default_input_token_semantics(&app_type);
        let log = RequestLog {
            request_id,
            provider_id,
            app_type,
            api_type,
            model,
            request_model,
            // 错误行未经过计价，留空（回填的 has_usage 闸门也不会碰全 0 行）
            pricing_model: String::new(),
            input_token_semantics,
            usage: TokenUsage::default(),
            cost: None,
            latency_ms,
            first_token_ms: None,
            status_code,
            error_message: Some(error_message),
            failure_kind: None,
            route_trace: None,
            session_id: None,
            provider_type: None,
            is_streaming: false,
            cost_multiplier: "1.0".to_string(),
        };

        self.log_request(&log)
    }

    /// 记录失败的请求（带更多上下文信息）
    ///
    /// 相比 log_error，这个方法接受更多参数以提供完整的请求上下文
    #[allow(clippy::too_many_arguments)]
    pub fn log_error_with_context(
        &self,
        request_id: String,
        provider_id: String,
        app_type: String,
        api_type: String,
        input_token_semantics: i64,
        model: String,
        status_code: u16,
        error_message: String,
        latency_ms: u64,
        is_streaming: bool,
        session_id: Option<String>,
        provider_type: Option<String>,
        failure_kind: Option<String>,
        route_trace: Option<String>,
    ) -> Result<(), AppError> {
        let request_model = model.clone();
        let log = RequestLog {
            request_id,
            provider_id,
            app_type,
            api_type,
            model,
            request_model,
            // 错误行未经过计价，留空（回填的 has_usage 闸门也不会碰全 0 行）
            pricing_model: String::new(),
            input_token_semantics,
            usage: TokenUsage::default(),
            cost: None,
            latency_ms,
            first_token_ms: None,
            status_code,
            error_message: Some(error_message),
            failure_kind,
            route_trace,
            session_id,
            provider_type,
            is_streaming,
            cost_multiplier: "1.0".to_string(),
        };

        self.log_request(&log)
    }

    /// 获取模型定价
    pub fn get_model_pricing(&self, model_id: &str) -> Result<Option<ModelPricing>, AppError> {
        let conn = crate::database::lock_conn!(self.db.conn);
        let row = find_model_pricing_row(&conn, model_id)?;
        match row {
            Some((input, output, cache_read, cache_creation)) => {
                ModelPricing::from_strings(&input, &output, &cache_read, &cache_creation)
                    .map(Some)
                    .map_err(|e| AppError::Database(format!("解析定价数据失败: {e}")))
            }
            None => Ok(None),
        }
    }

    /// 获取有效的倍率与计费模式来源（供应商优先，未配置则回退全局默认）
    pub async fn resolve_pricing_config(
        &self,
        provider_id: &str,
        app_type: &str,
    ) -> (Decimal, String) {
        // Claude Desktop 网关没有独立的全局计费配置（proxy_config 的 CHECK 仅
        // 允许 claude/codex/gemini，前端也只暴露三项），全局默认继承 claude；
        // 供应商级 meta 覆盖仍按 claude-desktop 查找（providers 表按该 app_type 存）。
        let default_app_type = if app_type == "claude-desktop" {
            "claude"
        } else {
            app_type
        };
        let default_multiplier_raw =
            match self.db.get_default_cost_multiplier(default_app_type).await {
                Ok(value) => value,
                Err(e) => {
                    log::warn!("[USG-003] 获取默认倍率失败 (app_type={app_type}): {e}");
                    "1".to_string()
                }
            };
        let default_multiplier = match Decimal::from_str(&default_multiplier_raw) {
            Ok(value) => value,
            Err(e) => {
                log::warn!(
                    "[USG-003] 默认倍率解析失败 (app_type={app_type}): {default_multiplier_raw} - {e}"
                );
                Decimal::from(1)
            }
        };

        let default_pricing_source_raw =
            match self.db.get_pricing_model_source(default_app_type).await {
                Ok(value) => value,
                Err(e) => {
                    log::warn!("[USG-003] 获取默认计费模式失败 (app_type={app_type}): {e}");
                    PRICING_SOURCE_RESPONSE.to_string()
                }
            };
        let default_pricing_source = if default_pricing_source_raw == PRICING_SOURCE_RESPONSE
            || default_pricing_source_raw == PRICING_SOURCE_REQUEST
        {
            default_pricing_source_raw
        } else {
            log::warn!(
                "[USG-003] 默认计费模式无效 (app_type={app_type}): {default_pricing_source_raw}"
            );
            PRICING_SOURCE_RESPONSE.to_string()
        };

        let provider = self
            .db
            .get_provider_by_id(provider_id, app_type)
            .ok()
            .flatten();

        let (provider_multiplier, provider_pricing_source) = provider
            .as_ref()
            .and_then(|p| p.meta.as_ref())
            .map(|meta| {
                (
                    meta.cost_multiplier.as_deref(),
                    meta.pricing_model_source.as_deref(),
                )
            })
            .unwrap_or((None, None));

        let cost_multiplier = match provider_multiplier {
            Some(value) => match Decimal::from_str(value) {
                Ok(parsed) => parsed,
                Err(e) => {
                    log::warn!(
                        "[USG-003] 供应商倍率解析失败 (provider_id={provider_id}): {value} - {e}"
                    );
                    default_multiplier
                }
            },
            None => default_multiplier,
        };

        let pricing_model_source = match provider_pricing_source {
            Some(value) if value == PRICING_SOURCE_RESPONSE || value == PRICING_SOURCE_REQUEST => {
                value.to_string()
            }
            Some(value) => {
                log::warn!("[USG-003] 供应商计费模式无效 (provider_id={provider_id}): {value}");
                default_pricing_source.clone()
            }
            None => default_pricing_source.clone(),
        };

        (cost_multiplier, pricing_model_source)
    }

    /// 计算并记录请求
    #[allow(clippy::too_many_arguments)]
    pub fn log_with_calculation(
        &self,
        request_id: String,
        provider_id: String,
        app_type: String,
        api_type: String,
        input_token_semantics: i64,
        model: String,
        request_model: String,
        pricing_model: String,
        usage: TokenUsage,
        cost_multiplier: Decimal,
        latency_ms: u64,
        first_token_ms: Option<u64>,
        status_code: u16,
        session_id: Option<String>,
        provider_type: Option<String>,
        is_streaming: bool,
        route_trace: Option<String>,
    ) -> Result<(), AppError> {
        self.log_with_calculation_and_error(
            request_id,
            provider_id,
            app_type,
            api_type,
            input_token_semantics,
            model,
            request_model,
            pricing_model,
            usage,
            cost_multiplier,
            latency_ms,
            first_token_ms,
            status_code,
            session_id,
            provider_type,
            is_streaming,
            None,
            route_trace,
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn log_with_calculation_and_error(
        &self,
        request_id: String,
        provider_id: String,
        app_type: String,
        api_type: String,
        input_token_semantics: i64,
        model: String,
        request_model: String,
        pricing_model: String,
        usage: TokenUsage,
        cost_multiplier: Decimal,
        latency_ms: u64,
        first_token_ms: Option<u64>,
        status_code: u16,
        session_id: Option<String>,
        provider_type: Option<String>,
        is_streaming: bool,
        error_message: Option<String>,
        route_trace: Option<String>,
    ) -> Result<(), AppError> {
        let pricing = self.get_model_pricing(&pricing_model)?;

        let has_usage = usage.input_tokens > 0
            || usage.output_tokens > 0
            || usage.cache_read_tokens > 0
            || usage.cache_creation_tokens > 0;

        if pricing.is_none() && has_usage && !is_placeholder_pricing_model(&pricing_model) {
            log::warn!("[USG-002] 模型定价未找到，成本将记录为 0: {pricing_model}");
        }

        let cost = CostCalculator::try_calculate_with_input_semantics(
            input_token_semantics,
            &usage,
            pricing.as_ref(),
            cost_multiplier,
        );

        let log = RequestLog {
            request_id,
            provider_id,
            app_type,
            api_type,
            model,
            request_model,
            pricing_model,
            input_token_semantics,
            usage,
            cost,
            latency_ms,
            first_token_ms,
            status_code,
            error_message,
            failure_kind: None,
            route_trace,
            session_id,
            provider_type,
            is_streaming,
            cost_multiplier: cost_multiplier.to_string(),
        };

        self.log_request(&log)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request_log(request_id: &str, input_tokens: u32) -> RequestLog {
        RequestLog {
            request_id: request_id.to_string(),
            provider_id: "provider-1".to_string(),
            app_type: "codex".to_string(),
            api_type: "codex".to_string(),
            model: "gpt-5.6".to_string(),
            request_model: "gpt-5.6".to_string(),
            pricing_model: "gpt-5.6".to_string(),
            input_token_semantics: INPUT_TOKEN_SEMANTICS_TOTAL,
            usage: TokenUsage {
                input_tokens,
                output_tokens: 5,
                cache_read_tokens: 2,
                cache_creation_tokens: 0,
                reasoning_tokens: 0,
                cache_creation_1h_tokens: 0,
                model: None,
                message_id: Some("resp-1".to_string()),
            },
            cost: None,
            latency_ms: 10,
            first_token_ms: Some(2),
            status_code: 200,
            error_message: None,
            failure_kind: None,
            route_trace: None,
            session_id: None,
            provider_type: Some("codex".to_string()),
            is_streaming: true,
            cost_multiplier: "1".to_string(),
        }
    }

    #[test]
    fn test_log_request() -> Result<(), AppError> {
        let db = Database::memory()?;

        // 插入测试定价
        {
            let conn = crate::database::lock_conn!(db.conn);
            conn.execute(
                "INSERT INTO model_pricing (model_id, display_name, input_cost_per_million, output_cost_per_million)
                 VALUES ('test-model', 'Test Model', '3.0', '15.0')",
                [],
            )
            .unwrap();
        }

        let logger = UsageLogger::new(&db);

        let usage = TokenUsage {
            input_tokens: 1000,
            output_tokens: 500,
            cache_read_tokens: 0,
            cache_creation_tokens: 0,
            reasoning_tokens: 0,
            cache_creation_1h_tokens: 0,
            model: None,
            message_id: None,
        };

        logger.log_with_calculation(
            "req-123".to_string(),
            "provider-1".to_string(),
            "claude".to_string(),
            "claude".to_string(),
            INPUT_TOKEN_SEMANTICS_FRESH,
            "test-model".to_string(),
            "req-model".to_string(),
            "test-model".to_string(),
            usage,
            Decimal::from(1),
            100,
            None,
            200,
            None,
            Some("claude".to_string()),
            false,
            None,
        )?;

        // 验证记录已插入
        let conn = crate::database::lock_conn!(db.conn);
        let (count, request_model): (i64, String) = conn
            .query_row(
                "SELECT COUNT(*), request_model FROM proxy_request_logs WHERE request_id = 'req-123'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(count, 1);
        assert_eq!(request_model, "req-model");
        Ok(())
    }

    #[test]
    fn identical_replay_writes_and_notifies_once() -> Result<(), AppError> {
        let db = Database::memory()?;
        let logger = UsageLogger::new(&db);
        crate::usage_events::take_test_notify_count();
        let log = request_log("stable-id", 10);

        logger.log_request(&log)?;
        logger.log_request(&log)?;

        let conn = crate::database::lock_conn!(db.conn);
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM proxy_request_logs WHERE request_id = 'stable-id'",
            [],
            |row| row.get(0),
        )?;
        assert_eq!(count, 1);
        assert_eq!(crate::usage_events::take_test_notify_count(), 1);
        Ok(())
    }

    #[test]
    fn semantic_collision_uses_deterministic_idempotent_fallback() -> Result<(), AppError> {
        let db = Database::memory()?;
        let logger = UsageLogger::new(&db);
        crate::usage_events::take_test_notify_count();
        let first = request_log("shared-id", 10);
        let second = request_log("shared-id", 20);

        logger.log_request(&first)?;
        logger.log_request(&second)?;
        logger.log_request(&second)?;

        let conn = crate::database::lock_conn!(db.conn);
        let rows: Vec<(String, i64)> = conn
            .prepare(
                "SELECT request_id, input_tokens FROM proxy_request_logs ORDER BY input_tokens",
            )?
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<_, _>>()?;
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0], ("shared-id".to_string(), 10));
        assert!(rows[1].0.starts_with("shared-id:collision:"));
        assert_eq!(rows[1].1, 20);
        assert_eq!(crate::usage_events::take_test_notify_count(), 2);
        Ok(())
    }

    #[test]
    fn only_session_log_primary_rows_may_be_replaced() -> Result<(), AppError> {
        let db = Database::memory()?;
        {
            let conn = crate::database::lock_conn!(db.conn);
            for (request_id, data_source) in [
                ("session-primary", "session_log"),
                ("codex-primary", "codex_session"),
            ] {
                conn.execute(
                    "INSERT INTO proxy_request_logs (
                        request_id, provider_id, app_type, model, input_tokens,
                        output_tokens, cache_read_tokens, cache_creation_tokens,
                        latency_ms, status_code, created_at, data_source
                     ) VALUES (?1, '_session', 'claude', 'old', 1, 1, 0, 0, 0, 200, 1, ?2)",
                    rusqlite::params![request_id, data_source],
                )?;
            }
        }
        let logger = UsageLogger::new(&db);

        let mut session_replacement = request_log("session-primary", 10);
        session_replacement.app_type = "claude".to_string();
        logger.log_request(&session_replacement)?;
        logger.log_request(&request_log("codex-primary", 20))?;

        let conn = crate::database::lock_conn!(db.conn);
        let session_source: String = conn.query_row(
            "SELECT data_source FROM proxy_request_logs WHERE request_id = 'session-primary'",
            [],
            |row| row.get(0),
        )?;
        let codex_input: i64 = conn.query_row(
            "SELECT input_tokens FROM proxy_request_logs WHERE request_id = 'codex-primary'",
            [],
            |row| row.get(0),
        )?;
        let fallback_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM proxy_request_logs
             WHERE request_id LIKE 'codex-primary:collision:%'",
            [],
            |row| row.get(0),
        )?;
        assert_eq!(session_source, "proxy");
        assert_eq!(codex_input, 1);
        assert_eq!(fallback_count, 1);
        Ok(())
    }

    #[test]
    fn test_log_error() -> Result<(), AppError> {
        let db = Database::memory()?;
        let logger = UsageLogger::new(&db);

        logger.log_error(
            "req-error".to_string(),
            "provider-1".to_string(),
            "claude".to_string(),
            "unknown-model".to_string(),
            500,
            "Internal Server Error".to_string(),
            50,
        )?;

        // 验证错误记录已插入
        let conn = crate::database::lock_conn!(db.conn);
        let (status, error): (i64, Option<String>) = conn
            .query_row(
                "SELECT status_code, error_message FROM proxy_request_logs WHERE request_id = 'req-error'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(status, 500);
        assert_eq!(error, Some("Internal Server Error".to_string()));
        Ok(())
    }

    #[test]
    fn grokbuild_logs_total_input_token_semantics() -> Result<(), AppError> {
        let db = Database::memory()?;
        let logger = UsageLogger::new(&db);
        let log = RequestLog {
            request_id: "grok-semantics".to_string(),
            provider_id: "grok-provider".to_string(),
            app_type: "grokbuild".to_string(),
            api_type: "grokbuild".to_string(),
            model: "grok-4.5".to_string(),
            request_model: "grok-4.5".to_string(),
            pricing_model: String::new(),
            input_token_semantics: INPUT_TOKEN_SEMANTICS_TOTAL,
            usage: TokenUsage::default(),
            cost: None,
            latency_ms: 1,
            first_token_ms: None,
            status_code: 200,
            error_message: None,
            failure_kind: None,
            route_trace: None,
            session_id: None,
            provider_type: Some("grokbuild".to_string()),
            is_streaming: false,
            cost_multiplier: "1".to_string(),
        };

        logger.log_request(&log)?;

        let conn = crate::database::lock_conn!(db.conn);
        let semantics: i64 = conn.query_row(
            "SELECT input_token_semantics FROM proxy_request_logs WHERE request_id = 'grok-semantics'",
            [],
            |row| row.get(0),
        )?;
        assert_eq!(semantics, INPUT_TOKEN_SEMANTICS_TOTAL);
        Ok(())
    }

    #[test]
    fn pi_log_uses_explicit_protocol_semantics_and_preserves_subsets() -> Result<(), AppError> {
        let db = Database::memory()?;
        {
            let conn = crate::database::lock_conn!(db.conn);
            conn.execute(
                "INSERT INTO model_pricing (
                    model_id, display_name, input_cost_per_million,
                    output_cost_per_million, cache_read_cost_per_million,
                    cache_creation_cost_per_million
                 ) VALUES ('pi-model', 'Pi Model', '10', '20', '1', '2')",
                [],
            )?;
        }
        let logger = UsageLogger::new(&db);
        logger.log_with_calculation(
            "pi-total".to_string(),
            "pi-provider".to_string(),
            "pi".to_string(),
            "openai-responses".to_string(),
            INPUT_TOKEN_SEMANTICS_TOTAL,
            "pi-model".to_string(),
            "pi-model".to_string(),
            "pi-model".to_string(),
            TokenUsage {
                input_tokens: 1_000,
                output_tokens: 100,
                cache_read_tokens: 300,
                cache_creation_tokens: 200,
                reasoning_tokens: 60,
                cache_creation_1h_tokens: 150,
                model: None,
                message_id: None,
            },
            Decimal::from(2),
            25,
            Some(5),
            200,
            None,
            Some("pi".to_string()),
            true,
            None,
        )?;

        let conn = crate::database::lock_conn!(db.conn);
        let row: (String, i64, i64, i64, String) = conn.query_row(
            "SELECT api_type, input_token_semantics, reasoning_tokens,
                    cache_creation_1h_tokens, total_cost_usd
             FROM proxy_request_logs WHERE request_id = 'pi-total'",
            [],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )?;
        assert_eq!(row.0, "openai-responses");
        assert_eq!(
            (row.1, row.2, row.3),
            (INPUT_TOKEN_SEMANTICS_TOTAL, 60, 150)
        );
        assert_eq!(
            Decimal::from_str(&row.4).unwrap(),
            Decimal::from_str("0.0154").unwrap()
        );
        Ok(())
    }
}
