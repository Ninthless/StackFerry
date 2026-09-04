//! 供应商路由器模块
//!
//! 负责选择和管理代理目标供应商，实现智能故障转移

use crate::app_config::AppType;
use crate::database::Database;
use crate::error::AppError;
use crate::provider::Provider;
use crate::proxy::circuit_breaker::{
    AllowResult, CircuitBreaker, CircuitBreakerConfig, CircuitState,
};
use crate::proxy::providers::{extract_pi_request_model, plan_pi_provider, PiProviderSelection};
use crate::proxy::types::ProviderHealth;
use crate::proxy::ProxyError;
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

/// 供应商路由器
pub struct ProviderRouter {
    /// 数据库连接
    db: Arc<Database>,
    /// 熔断器管理器 - key 格式: "app_type:provider_id"
    circuit_breakers: Arc<RwLock<HashMap<String, Arc<CircuitBreaker>>>>,
}

impl ProviderRouter {
    /// 创建新的供应商路由器
    pub fn new(db: Arc<Database>) -> Self {
        Self {
            db,
            circuit_breakers: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// 选择可用的供应商（支持故障转移）
    ///
    /// 返回按优先级排序的可用供应商列表：
    /// - 故障转移关闭时：仅返回当前供应商
    /// - 故障转移开启时：仅使用故障转移队列，按队列顺序依次尝试（P1 → P2 → ...）
    pub async fn select_providers(&self, app_type: &str) -> Result<Vec<Provider>, AppError> {
        // 检查该应用的自动故障转移开关是否开启（从 proxy_config 表读取）
        let auto_failover_enabled = match self.db.get_proxy_config_for_app(app_type).await {
            Ok(config) => config.auto_failover_enabled,
            Err(e) => {
                log::error!("[{app_type}] 读取 proxy_config 失败: {e}，默认禁用故障转移");
                false
            }
        };

        if auto_failover_enabled {
            return self.select_failover_queue_providers(app_type).await;
        }

        let current_id = AppType::from_str(app_type)
            .ok()
            .and_then(|app_enum| {
                crate::settings::get_effective_current_provider(&self.db, &app_enum)
                    .ok()
                    .flatten()
            })
            .or_else(|| self.db.get_current_provider(app_type).ok().flatten());

        if let Some(current_id) = current_id {
            if let Some(current) = self.db.get_provider_by_id(&current_id, app_type)? {
                return Ok(vec![current]);
            }
        }

        log::warn!("[{app_type}] [FO-005] 未配置供应商");
        Err(AppError::NoProvidersConfigured)
    }

    pub async fn select_pi_providers(
        &self,
        source_provider_id: &str,
        body: &serde_json::Value,
        endpoint: &str,
    ) -> Result<PiProviderSelection, ProxyError> {
        let request_model = extract_pi_request_model(body, endpoint);
        let source_provider = self
            .db
            .get_provider_by_id(source_provider_id, "pi")
            .map_err(|error| ProxyError::DatabaseError(error.to_string()))?
            .ok_or_else(|| {
                ProxyError::ConfigError(format!(
                    "Pi source provider '{source_provider_id}' is not configured"
                ))
            })?;
        let source_plan = plan_pi_provider(&source_provider, request_model.as_deref())?
            .ok_or_else(|| {
                ProxyError::InvalidRequest(format!(
                    "Pi provider '{source_provider_id}' does not define requested model '{}'",
                    request_model.as_deref().unwrap_or("<unspecified>")
                ))
            })?;
        let api = source_plan.api;
        let source_header_names = source_plan.source_header_names()?;
        let auto_failover_enabled = self
            .db
            .get_proxy_config_for_app("pi")
            .await
            .map_err(|error| ProxyError::DatabaseError(error.to_string()))?
            .auto_failover_enabled;

        if !auto_failover_enabled {
            return Ok(PiProviderSelection {
                api,
                request_model,
                providers: vec![source_plan.into_provider()],
                source_header_names,
            });
        }

        let all_providers = self
            .db
            .get_all_providers("pi")
            .map_err(|error| ProxyError::DatabaseError(error.to_string()))?;
        let queue = self
            .db
            .get_failover_queue("pi")
            .map_err(|error| ProxyError::DatabaseError(error.to_string()))?;
        if queue.is_empty() {
            return Err(ProxyError::NoProvidersConfigured);
        }

        let mut providers = Vec::new();
        let mut compatible_count = 0usize;
        let mut unavailable_count = 0usize;
        for item in queue {
            if !item.enabled {
                continue;
            }
            let Some(provider) = all_providers.get(&item.provider_id) else {
                continue;
            };
            let Some(plan) = plan_pi_provider(provider, request_model.as_deref())? else {
                continue;
            };
            if plan.api != api {
                continue;
            }
            compatible_count += 1;

            let health = self
                .db
                .get_provider_health(&provider.id, "pi")
                .await
                .map_err(|error| ProxyError::DatabaseError(error.to_string()))?;
            let circuit_key = format!("pi:{}", provider.id);
            let breaker = self
                .get_or_create_circuit_breaker_from_health(&circuit_key, &health)
                .await;
            if !breaker.is_available().await {
                unavailable_count += 1;
                continue;
            }

            providers.push(plan.into_provider());
        }

        if !providers.is_empty() {
            return Ok(PiProviderSelection {
                api,
                request_model,
                providers,
                source_header_names,
            });
        }
        if compatible_count > 0 && unavailable_count == compatible_count {
            return Err(ProxyError::AllProvidersCircuitOpen);
        }
        Err(ProxyError::InvalidRequest(format!(
            "No Pi failover provider supports model '{}' with API '{}'",
            request_model.as_deref().unwrap_or("<unspecified>"),
            api.as_str()
        )))
    }

    pub async fn select_failover_activation_provider(
        &self,
        app_type: &str,
    ) -> Result<Provider, AppError> {
        self.select_failover_queue_providers(app_type)
            .await?
            .into_iter()
            .next()
            .ok_or(AppError::NoProvidersConfigured)
    }

    pub async fn select_paid_image_providers(
        &self,
        app_type: &str,
    ) -> Result<Vec<Provider>, AppError> {
        let auto_failover_enabled = match self.db.get_proxy_config_for_app(app_type).await {
            Ok(config) => config.auto_failover_enabled,
            Err(error) => {
                log::error!("[{app_type}] 读取 proxy_config 失败: {error}，默认禁用故障转移");
                false
            }
        };

        let candidates = if auto_failover_enabled {
            let all_providers = self.db.get_all_providers(app_type)?;
            self.db
                .get_failover_queue(app_type)?
                .into_iter()
                .filter(|item| item.enabled)
                .filter_map(|item| all_providers.get(&item.provider_id).cloned())
                .collect::<Vec<_>>()
        } else {
            let current_id = AppType::from_str(app_type)
                .ok()
                .and_then(|app_enum| {
                    crate::settings::get_effective_current_provider(&self.db, &app_enum)
                        .ok()
                        .flatten()
                })
                .or_else(|| self.db.get_current_provider(app_type).ok().flatten());

            match current_id {
                Some(current_id) => self
                    .db
                    .get_provider_by_id(&current_id, app_type)?
                    .into_iter()
                    .collect(),
                None => Vec::new(),
            }
        };

        if candidates.is_empty() {
            return Err(AppError::NoProvidersConfigured);
        }

        let mut eligible = Vec::new();
        for provider in candidates {
            if self
                .is_provider_safe_for_paid_image(&provider, app_type)
                .await?
            {
                eligible.push(provider);
            }
        }

        if eligible.is_empty() {
            Err(AppError::AllProvidersCircuitOpen)
        } else {
            Ok(eligible)
        }
    }

    pub async fn select_health_neutral_providers(
        &self,
        app_type: &str,
    ) -> Result<Vec<Provider>, AppError> {
        let auto_failover_enabled = match self.db.get_proxy_config_for_app(app_type).await {
            Ok(config) => config.auto_failover_enabled,
            Err(error) => {
                log::error!("[{app_type}] 读取 proxy_config 失败: {error}，默认禁用故障转移");
                false
            }
        };

        let providers = if auto_failover_enabled {
            let all_providers = self.db.get_all_providers(app_type)?;
            self.db
                .get_failover_queue(app_type)?
                .into_iter()
                .filter(|item| item.enabled)
                .filter_map(|item| all_providers.get(&item.provider_id).cloned())
                .collect::<Vec<_>>()
        } else {
            let current_id = AppType::from_str(app_type)
                .ok()
                .and_then(|app_enum| {
                    crate::settings::get_effective_current_provider(&self.db, &app_enum)
                        .ok()
                        .flatten()
                })
                .or_else(|| self.db.get_current_provider(app_type).ok().flatten());

            match current_id {
                Some(current_id) => self
                    .db
                    .get_provider_by_id(&current_id, app_type)?
                    .into_iter()
                    .collect(),
                None => Vec::new(),
            }
        };

        if providers.is_empty() {
            log::warn!("[{app_type}] [FO-005] 未配置供应商");
            Err(AppError::NoProvidersConfigured)
        } else {
            Ok(providers)
        }
    }

    pub async fn is_provider_safe_for_paid_image(
        &self,
        provider: &Provider,
        app_type: &str,
    ) -> Result<bool, AppError> {
        let health = self.db.get_provider_health(&provider.id, app_type).await?;
        let circuit_key = format!("{app_type}:{}", provider.id);
        let breaker = self
            .get_or_create_circuit_breaker_from_health(&circuit_key, &health)
            .await;
        if !health.is_healthy {
            log::info!(
                "[{app_type}] 跳过付费图片供应商: provider_id={}, provider_name={}, reason=persisted_unhealthy",
                provider.id,
                provider.name
            );
            return Ok(false);
        }

        let circuit_state = breaker.get_state().await;
        if circuit_state != CircuitState::Closed {
            log::info!(
                "[{app_type}] 跳过付费图片供应商: provider_id={}, provider_name={}, reason=circuit_{circuit_state}",
                provider.id,
                provider.name
            );
            return Ok(false);
        }

        Ok(true)
    }

    async fn select_failover_queue_providers(
        &self,
        app_type: &str,
    ) -> Result<Vec<Provider>, AppError> {
        let all_providers = self.db.get_all_providers(app_type)?;
        let ordered_ids = self
            .db
            .get_failover_queue(app_type)?
            .into_iter()
            .filter(|item| item.enabled)
            .map(|item| item.provider_id)
            .collect::<Vec<_>>();
        let total_providers = ordered_ids.len();
        let mut unavailable_count = 0usize;
        let mut providers = Vec::new();

        for provider_id in ordered_ids {
            let Some(provider) = all_providers.get(&provider_id).cloned() else {
                continue;
            };

            let health = self.db.get_provider_health(&provider.id, app_type).await?;
            let circuit_key = format!("{app_type}:{}", provider.id);
            let breaker = self
                .get_or_create_circuit_breaker_from_health(&circuit_key, &health)
                .await;
            if breaker.is_available().await {
                providers.push(provider);
            } else {
                unavailable_count += 1;
            }
        }

        if !providers.is_empty() {
            return Ok(providers);
        }

        if total_providers > 0 && unavailable_count == total_providers {
            log::warn!("[{app_type}] [FO-004] 所有队列供应商当前均不可用");
            Err(AppError::AllProvidersCircuitOpen)
        } else {
            log::warn!("[{app_type}] [FO-005] 未配置供应商");
            Err(AppError::NoProvidersConfigured)
        }
    }

    /// 请求执行前获取熔断器“放行许可”
    ///
    /// - Closed：直接放行
    /// - Open：超时到达后切到 HalfOpen 并放行一次探测
    /// - HalfOpen：按限流规则放行探测
    ///
    /// 注意：调用方必须在请求结束后通过 `record_result()` 释放 HalfOpen 名额，
    /// 否则会导致该 Provider 长时间无法进入探测状态。
    pub async fn allow_provider_request(&self, provider_id: &str, app_type: &str) -> AllowResult {
        let circuit_key = format!("{app_type}:{provider_id}");
        let breaker = self.get_or_create_circuit_breaker(&circuit_key).await;
        breaker.allow_request().await
    }

    /// 记录供应商请求结果
    pub async fn record_result(
        &self,
        provider_id: &str,
        app_type: &str,
        used_half_open_permit: bool,
        success: bool,
        error_msg: Option<String>,
    ) -> Result<(), AppError> {
        // 1. 按应用独立获取熔断器配置
        let failure_threshold = match self.db.get_proxy_config_for_app(app_type).await {
            Ok(app_config) => app_config.circuit_failure_threshold,
            Err(_) => 5, // 默认值
        };

        // 2. 更新熔断器状态
        let circuit_key = format!("{app_type}:{provider_id}");
        let breaker = self.get_or_create_circuit_breaker(&circuit_key).await;

        if success {
            breaker.record_success(used_half_open_permit).await;
        } else {
            breaker.record_failure(used_half_open_permit).await;
        }

        // 3. 更新数据库健康状态（使用配置的阈值）
        self.db
            .update_provider_health_with_threshold(
                provider_id,
                app_type,
                success,
                error_msg.clone(),
                failure_threshold,
            )
            .await?;

        Ok(())
    }

    /// 重置熔断器（手动恢复）
    pub async fn reset_circuit_breaker(&self, circuit_key: &str) {
        let breakers = self.circuit_breakers.read().await;
        if let Some(breaker) = breakers.get(circuit_key) {
            breaker.reset().await;
        }
    }

    /// 重置指定供应商的熔断器
    pub async fn reset_provider_breaker(&self, provider_id: &str, app_type: &str) {
        let circuit_key = format!("{app_type}:{provider_id}");
        self.reset_circuit_breaker(&circuit_key).await;
    }

    /// 仅释放 HalfOpen permit，不影响健康统计（neutral 接口）
    ///
    /// 用于整流器等场景：请求结果不应计入 Provider 健康度，
    /// 但仍需释放占用的探测名额，避免 HalfOpen 状态卡死
    pub async fn release_permit_neutral(
        &self,
        provider_id: &str,
        app_type: &str,
        used_half_open_permit: bool,
    ) {
        if !used_half_open_permit {
            return;
        }
        let circuit_key = format!("{app_type}:{provider_id}");
        let breaker = self.get_or_create_circuit_breaker(&circuit_key).await;
        breaker.release_half_open_permit();
    }

    /// 更新所有熔断器的配置（热更新）
    pub async fn update_all_configs(&self, config: CircuitBreakerConfig) {
        let breakers = self.circuit_breakers.read().await;
        for breaker in breakers.values() {
            breaker.update_config(config.clone()).await;
        }
    }

    /// 更新指定应用已创建熔断器的配置（热更新）
    pub async fn update_app_configs(&self, app_type: &str, config: CircuitBreakerConfig) {
        let prefix = format!("{app_type}:");
        let breakers = self.circuit_breakers.read().await;
        for (key, breaker) in breakers.iter() {
            if key.starts_with(&prefix) {
                breaker.update_config(config.clone()).await;
            }
        }
    }

    /// 获取熔断器状态
    #[allow(dead_code)]
    pub async fn get_circuit_breaker_stats(
        &self,
        provider_id: &str,
        app_type: &str,
    ) -> Option<crate::proxy::circuit_breaker::CircuitBreakerStats> {
        let circuit_key = format!("{app_type}:{provider_id}");
        let breakers = self.circuit_breakers.read().await;

        if let Some(breaker) = breakers.get(&circuit_key) {
            Some(breaker.get_stats().await)
        } else {
            None
        }
    }

    /// 获取或创建熔断器
    async fn get_or_create_circuit_breaker(&self, key: &str) -> Arc<CircuitBreaker> {
        self.get_or_create_circuit_breaker_with_open_elapsed(key, None)
            .await
    }

    async fn get_or_create_circuit_breaker_from_health(
        &self,
        key: &str,
        health: &ProviderHealth,
    ) -> Arc<CircuitBreaker> {
        let open_elapsed = if health.is_healthy {
            None
        } else {
            Some(
                health
                    .last_failure_at
                    .as_deref()
                    .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
                    .and_then(|failed_at| {
                        chrono::Utc::now()
                            .signed_duration_since(failed_at.with_timezone(&chrono::Utc))
                            .to_std()
                            .ok()
                    })
                    .unwrap_or_default(),
            )
        };

        self.get_or_create_circuit_breaker_with_open_elapsed(key, open_elapsed)
            .await
    }

    async fn get_or_create_circuit_breaker_with_open_elapsed(
        &self,
        key: &str,
        open_elapsed: Option<Duration>,
    ) -> Arc<CircuitBreaker> {
        // 先尝试读锁获取
        {
            let breakers = self.circuit_breakers.read().await;
            if let Some(breaker) = breakers.get(key) {
                return breaker.clone();
            }
        }

        // 如果不存在，获取写锁创建
        let mut breakers = self.circuit_breakers.write().await;

        // 双重检查，防止竞争条件
        if let Some(breaker) = breakers.get(key) {
            return breaker.clone();
        }

        // 从 key 中提取 app_type (格式: "app_type:provider_id")
        let app_type = key.split(':').next().unwrap_or("claude");

        // 按应用独立读取熔断器配置
        let config = match self.db.get_proxy_config_for_app(app_type).await {
            Ok(app_config) => crate::proxy::circuit_breaker::CircuitBreakerConfig {
                failure_threshold: app_config.circuit_failure_threshold,
                success_threshold: app_config.circuit_success_threshold,
                timeout_seconds: app_config.circuit_timeout_seconds as u64,
                auto_recovery_enabled: app_config.circuit_auto_recovery_enabled,
                error_rate_threshold: app_config.circuit_error_rate_threshold,
                min_requests: app_config.circuit_min_requests,
            },
            Err(_) => crate::proxy::circuit_breaker::CircuitBreakerConfig::default(),
        };

        let breaker = Arc::new(match open_elapsed {
            Some(elapsed) => CircuitBreaker::new_open(config, elapsed),
            None => CircuitBreaker::new(config),
        });
        breakers.insert(key.to_string(), breaker.clone());

        breaker
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;
    use serde_json::json;
    use serial_test::serial;
    use std::env;
    use tempfile::TempDir;

    struct TempHome {
        #[allow(dead_code)]
        dir: TempDir,
        original_home: Option<String>,
        original_userprofile: Option<String>,
        original_test_home: Option<String>,
    }

    impl TempHome {
        fn new() -> Self {
            let dir = TempDir::new().expect("failed to create temp home");
            let original_home = env::var("HOME").ok();
            let original_userprofile = env::var("USERPROFILE").ok();
            let original_test_home = env::var("STACKFERRY_TEST_HOME").ok();

            env::set_var("HOME", dir.path());
            env::set_var("USERPROFILE", dir.path());
            env::set_var("STACKFERRY_TEST_HOME", dir.path());
            crate::settings::reload_settings().expect("reload settings");

            Self {
                dir,
                original_home,
                original_userprofile,
                original_test_home,
            }
        }
    }

    impl Drop for TempHome {
        fn drop(&mut self) {
            match &self.original_home {
                Some(value) => env::set_var("HOME", value),
                None => env::remove_var("HOME"),
            }

            match &self.original_userprofile {
                Some(value) => env::set_var("USERPROFILE", value),
                None => env::remove_var("USERPROFILE"),
            }

            match &self.original_test_home {
                Some(value) => env::set_var("STACKFERRY_TEST_HOME", value),
                None => env::remove_var("STACKFERRY_TEST_HOME"),
            }
        }
    }

    #[tokio::test]
    #[serial]
    async fn test_provider_router_creation() {
        let _home = TempHome::new();
        let db = Arc::new(Database::memory().unwrap());
        let router = ProviderRouter::new(db);

        let breaker = router.get_or_create_circuit_breaker("claude:test").await;
        assert!(breaker.allow_request().await.allowed);
    }

    #[tokio::test]
    #[serial]
    async fn test_failover_disabled_uses_current_provider() {
        let _home = TempHome::new();
        let db = Arc::new(Database::memory().unwrap());

        let provider_a =
            Provider::with_id("a".to_string(), "Provider A".to_string(), json!({}), None);
        let provider_b =
            Provider::with_id("b".to_string(), "Provider B".to_string(), json!({}), None);

        db.save_provider("claude", &provider_a).unwrap();
        db.save_provider("claude", &provider_b).unwrap();
        db.set_current_provider("claude", "a").unwrap();
        db.add_to_failover_queue("claude", "b").unwrap();

        let router = ProviderRouter::new(db.clone());
        let providers = router.select_providers("claude").await.unwrap();

        assert_eq!(providers.len(), 1);
        assert_eq!(providers[0].id, "a");
    }

    #[tokio::test]
    #[serial]
    async fn test_failover_enabled_uses_queue_order_ignoring_current() {
        let _home = TempHome::new();
        let db = Arc::new(Database::memory().unwrap());

        // 首页顺序为 b、a，故障转移加入顺序为 a、b
        let mut provider_a =
            Provider::with_id("a".to_string(), "Provider A".to_string(), json!({}), None);
        provider_a.sort_index = Some(2);
        let mut provider_b =
            Provider::with_id("b".to_string(), "Provider B".to_string(), json!({}), None);
        provider_b.sort_index = Some(1);

        db.save_provider("claude", &provider_a).unwrap();
        db.save_provider("claude", &provider_b).unwrap();
        db.set_current_provider("claude", "a").unwrap();

        db.add_to_failover_queue("claude", "a").unwrap();
        db.add_to_failover_queue("claude", "b").unwrap();

        // 启用自动故障转移（使用新的 proxy_config API）
        let mut config = db.get_proxy_config_for_app("claude").await.unwrap();
        config.auto_failover_enabled = true;
        db.update_proxy_config_for_app(config).await.unwrap();

        let router = ProviderRouter::new(db.clone());
        let providers = router.select_providers("claude").await.unwrap();

        assert_eq!(providers.len(), 2);
        // 故障转移开启时：仅按加入顺序选择（忽略首页顺序和当前供应商）
        assert_eq!(providers[0].id, "a");
        assert_eq!(providers[1].id, "b");
    }

    #[tokio::test]
    #[serial]
    async fn test_failover_enabled_uses_queue_only_even_if_current_not_in_queue() {
        let _home = TempHome::new();
        let db = Arc::new(Database::memory().unwrap());

        let provider_a =
            Provider::with_id("a".to_string(), "Provider A".to_string(), json!({}), None);
        let mut provider_b =
            Provider::with_id("b".to_string(), "Provider B".to_string(), json!({}), None);
        provider_b.sort_index = Some(1);

        db.save_provider("claude", &provider_a).unwrap();
        db.save_provider("claude", &provider_b).unwrap();
        db.set_current_provider("claude", "a").unwrap();

        // 只把 b 加入故障转移队列（模拟“当前供应商不在队列里”的常见配置）
        db.add_to_failover_queue("claude", "b").unwrap();

        let mut config = db.get_proxy_config_for_app("claude").await.unwrap();
        config.auto_failover_enabled = true;
        db.update_proxy_config_for_app(config).await.unwrap();

        let router = ProviderRouter::new(db.clone());
        let providers = router.select_providers("claude").await.unwrap();

        assert_eq!(providers.len(), 1);
        assert_eq!(providers[0].id, "b");
    }

    #[tokio::test]
    #[serial]
    async fn test_failover_enabled_skips_disabled_queue_channels_without_health_reads() {
        let _home = TempHome::new();
        let db = Arc::new(Database::memory().unwrap());
        let first = Provider::with_id("first".to_string(), "First".to_string(), json!({}), None);
        let second = Provider::with_id("second".to_string(), "Second".to_string(), json!({}), None);
        db.save_provider("claude", &first).unwrap();
        db.save_provider("claude", &second).unwrap();
        db.add_to_failover_queue("claude", &first.id).unwrap();
        db.add_to_failover_queue("claude", &second.id).unwrap();
        db.set_proxy_flags_sync("claude", true, true).unwrap();
        db.set_failover_provider_enabled("claude", &first.id, false)
            .unwrap();

        let router = ProviderRouter::new(db.clone());
        let providers = router.select_providers("claude").await.unwrap();

        assert_eq!(
            providers
                .iter()
                .map(|provider| provider.id.as_str())
                .collect::<Vec<_>>(),
            vec!["second"]
        );
        let health = db.get_provider_health(&first.id, "claude").await.unwrap();
        assert!(health.is_healthy);
        assert_eq!(health.consecutive_failures, 0);
    }

    #[tokio::test]
    #[serial]
    async fn test_failover_preserves_persisted_cooldown_after_router_restart() {
        let _home = TempHome::new();
        let db = Arc::new(Database::memory().unwrap());
        let mut provider_a =
            Provider::with_id("a".to_string(), "Provider A".to_string(), json!({}), None);
        provider_a.sort_index = Some(2);
        let mut provider_b =
            Provider::with_id("b".to_string(), "Provider B".to_string(), json!({}), None);
        provider_b.sort_index = Some(1);
        db.save_provider("claude", &provider_a).unwrap();
        db.save_provider("claude", &provider_b).unwrap();
        db.add_to_failover_queue("claude", "b").unwrap();
        db.add_to_failover_queue("claude", "a").unwrap();
        db.update_provider_health_with_threshold(
            "b",
            "claude",
            false,
            Some("unavailable".to_string()),
            1,
        )
        .await
        .unwrap();
        let mut config = db.get_proxy_config_for_app("claude").await.unwrap();
        config.auto_failover_enabled = true;
        config.circuit_timeout_seconds = 60;
        db.update_proxy_config_for_app(config).await.unwrap();

        let router = ProviderRouter::new(db.clone());
        let providers = router.select_providers("claude").await.unwrap();
        assert_eq!(
            providers
                .iter()
                .map(|provider| provider.id.as_str())
                .collect::<Vec<_>>(),
            vec!["a"]
        );

        let restarted_router = ProviderRouter::new(db.clone());
        let activation = restarted_router
            .select_failover_activation_provider("claude")
            .await
            .unwrap();
        assert_eq!(activation.id, "a");
        db.reset_provider_health("b", "claude").await.unwrap();
        restarted_router.reset_provider_breaker("b", "claude").await;
        let recovered = restarted_router.select_providers("claude").await.unwrap();
        assert_eq!(
            recovered
                .iter()
                .map(|provider| provider.id.as_str())
                .collect::<Vec<_>>(),
            vec!["b", "a"]
        );
    }

    #[tokio::test]
    #[serial]
    async fn test_failover_restores_persisted_unhealthy_provider_after_cooldown() {
        let _home = TempHome::new();
        let db = Arc::new(Database::memory().unwrap());
        let provider_a =
            Provider::with_id("a".to_string(), "Provider A".to_string(), json!({}), None);
        let provider_b =
            Provider::with_id("b".to_string(), "Provider B".to_string(), json!({}), None);
        db.save_provider("claude", &provider_a).unwrap();
        db.save_provider("claude", &provider_b).unwrap();
        db.add_to_failover_queue("claude", "b").unwrap();
        db.add_to_failover_queue("claude", "a").unwrap();
        db.update_provider_health_with_threshold(
            "b",
            "claude",
            false,
            Some("unavailable".to_string()),
            1,
        )
        .await
        .unwrap();

        let mut config = db.get_proxy_config_for_app("claude").await.unwrap();
        config.auto_failover_enabled = true;
        config.circuit_failure_threshold = 1;
        config.circuit_success_threshold = 1;
        config.circuit_timeout_seconds = 0;
        db.update_proxy_config_for_app(config).await.unwrap();

        let router = ProviderRouter::new(db.clone());
        let providers = router.select_providers("claude").await.unwrap();
        assert_eq!(
            providers
                .iter()
                .map(|provider| provider.id.as_str())
                .collect::<Vec<_>>(),
            vec!["b", "a"]
        );

        let first = router.allow_provider_request("b", "claude").await;
        assert!(first.allowed);
        assert!(first.used_half_open_permit);
        assert!(!router.allow_provider_request("b", "claude").await.allowed);

        router
            .record_result("b", "claude", first.used_half_open_permit, true, None)
            .await
            .unwrap();

        let health = db.get_provider_health("b", "claude").await.unwrap();
        assert!(health.is_healthy);
        let stats = router
            .get_circuit_breaker_stats("b", "claude")
            .await
            .unwrap();
        assert_eq!(stats.state, CircuitState::Closed);
    }

    #[tokio::test]
    #[serial]
    async fn test_select_providers_does_not_consume_half_open_permit() {
        let _home = TempHome::new();
        let db = Arc::new(Database::memory().unwrap());

        db.update_circuit_breaker_config(&CircuitBreakerConfig {
            failure_threshold: 1,
            timeout_seconds: 0,
            ..Default::default()
        })
        .await
        .unwrap();

        let provider_a =
            Provider::with_id("a".to_string(), "Provider A".to_string(), json!({}), None);
        let provider_b =
            Provider::with_id("b".to_string(), "Provider B".to_string(), json!({}), None);

        db.save_provider("claude", &provider_a).unwrap();
        db.save_provider("claude", &provider_b).unwrap();

        db.add_to_failover_queue("claude", "a").unwrap();
        db.add_to_failover_queue("claude", "b").unwrap();

        // 启用自动故障转移（使用新的 proxy_config API）
        let mut config = db.get_proxy_config_for_app("claude").await.unwrap();
        config.auto_failover_enabled = true;
        db.update_proxy_config_for_app(config).await.unwrap();

        let router = ProviderRouter::new(db.clone());

        router
            .record_result("b", "claude", false, false, Some("fail".to_string()))
            .await
            .unwrap();

        let providers = router.select_providers("claude").await.unwrap();
        assert_eq!(providers.len(), 2);

        assert!(router.allow_provider_request("b", "claude").await.allowed);
    }

    #[tokio::test]
    #[serial]
    async fn test_release_permit_neutral_frees_half_open_slot() {
        let _home = TempHome::new();
        let db = Arc::new(Database::memory().unwrap());

        // 配置熔断器：1 次失败即熔断，0 秒超时立即进入 HalfOpen
        db.update_circuit_breaker_config(&CircuitBreakerConfig {
            failure_threshold: 1,
            timeout_seconds: 0,
            ..Default::default()
        })
        .await
        .unwrap();

        let provider_a =
            Provider::with_id("a".to_string(), "Provider A".to_string(), json!({}), None);
        db.save_provider("claude", &provider_a).unwrap();
        db.add_to_failover_queue("claude", "a").unwrap();

        // 启用自动故障转移
        let mut config = db.get_proxy_config_for_app("claude").await.unwrap();
        config.auto_failover_enabled = true;
        db.update_proxy_config_for_app(config).await.unwrap();

        let router = ProviderRouter::new(db.clone());

        // 触发熔断：1 次失败
        router
            .record_result("a", "claude", false, false, Some("fail".to_string()))
            .await
            .unwrap();

        // 第一次请求：获取 HalfOpen 探测名额
        let first = router.allow_provider_request("a", "claude").await;
        assert!(first.allowed);
        assert!(first.used_half_open_permit);

        // 第二次请求应被拒绝（名额已被占用）
        let second = router.allow_provider_request("a", "claude").await;
        assert!(!second.allowed);

        // 使用 release_permit_neutral 释放名额（不影响健康统计）
        router
            .release_permit_neutral("a", "claude", first.used_half_open_permit)
            .await;

        // 第三次请求应被允许（名额已释放）
        let third = router.allow_provider_request("a", "claude").await;
        assert!(third.allowed);
        assert!(third.used_half_open_permit);
    }

    #[tokio::test]
    #[serial]
    async fn test_pi_persisted_channel_recovers_in_original_queue_position() {
        let _home = TempHome::new();
        let db = Arc::new(Database::memory().unwrap());
        let pi_provider = |id: &str| {
            Provider::with_id(
                id.to_string(),
                id.to_string(),
                json!({
                    "baseUrl": "https://pi.example/v1",
                    "api": "openai-responses",
                    "apiKey": format!("{id}-key"),
                    "authHeader": false,
                    "headers": {},
                    "models": [{"id": "shared-model"}]
                }),
                None,
            )
        };
        let source = pi_provider("source");
        let first = pi_provider("first");
        let second = pi_provider("second");
        db.save_provider("pi", &source).unwrap();
        db.save_provider("pi", &first).unwrap();
        db.save_provider("pi", &second).unwrap();
        db.add_to_failover_queue("pi", "first").unwrap();
        db.add_to_failover_queue("pi", "second").unwrap();

        let mut config = db.get_proxy_config_for_app("pi").await.unwrap();
        config.auto_failover_enabled = true;
        config.circuit_failure_threshold = 1;
        config.circuit_success_threshold = 1;
        config.circuit_timeout_seconds = 0;
        db.update_proxy_config_for_app(config).await.unwrap();
        db.update_provider_health_with_threshold(
            "first",
            "pi",
            false,
            Some("persisted failure".to_string()),
            1,
        )
        .await
        .unwrap();

        let router = ProviderRouter::new(db.clone());
        let selection = router
            .select_pi_providers(
                "source",
                &json!({"model": "shared-model", "input": "probe"}),
                "/responses",
            )
            .await
            .unwrap();
        assert_eq!(
            selection
                .providers
                .iter()
                .map(|provider| provider.id.as_str())
                .collect::<Vec<_>>(),
            vec!["first", "second"]
        );

        let permit = router.allow_provider_request("first", "pi").await;
        assert!(permit.allowed);
        assert!(permit.used_half_open_permit);
        router
            .record_result("first", "pi", permit.used_half_open_permit, true, None)
            .await
            .unwrap();
        assert!(
            db.get_provider_health("first", "pi")
                .await
                .unwrap()
                .is_healthy
        );

        let restarted = ProviderRouter::new(db);
        let selection = restarted
            .select_pi_providers(
                "source",
                &json!({"model": "shared-model", "input": "next"}),
                "/responses",
            )
            .await
            .unwrap();
        assert_eq!(selection.providers[0].id, "first");
    }
}
