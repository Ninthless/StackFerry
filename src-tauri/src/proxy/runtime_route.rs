use super::types::{ActiveTarget, ProxyStatus};
use crate::app_config::AppType;
use crate::database::Database;
use crate::error::AppError;
use crate::provider::Provider;
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::{Mutex, RwLock};

pub(crate) const RUNTIME_PROVIDER_CHANGED_EVENT: &str = "proxy-runtime-provider-changed";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct RuntimeRouteUpdate {
    pub accepted: bool,
    pub changed: bool,
    pub failover_incremented: bool,
}

#[derive(Clone)]
struct RuntimeProvider {
    provider_id: String,
    provider_name: String,
    sequence: u64,
}

#[derive(Default)]
struct RuntimeRoutes {
    providers: HashMap<String, RuntimeProvider>,
    next_sequence: u64,
}

pub(crate) struct RuntimeRouteTracker {
    db: Arc<Database>,
    status: Arc<RwLock<ProxyStatus>>,
    routes: Mutex<RuntimeRoutes>,
    app_handle: Option<tauri::AppHandle>,
}

impl RuntimeRouteTracker {
    pub(crate) fn new(
        db: Arc<Database>,
        status: Arc<RwLock<ProxyStatus>>,
        app_handle: Option<tauri::AppHandle>,
    ) -> Self {
        Self {
            db,
            status,
            routes: Mutex::new(RuntimeRoutes::default()),
            app_handle,
        }
    }

    pub(crate) async fn active_targets(&self) -> Vec<ActiveTarget> {
        let routes = self.routes.lock().await;
        let mut targets = routes
            .providers
            .iter()
            .map(|(app_type, provider)| ActiveTarget {
                app_type: app_type.clone(),
                provider_id: provider.provider_id.clone(),
                provider_name: provider.provider_name.clone(),
            })
            .collect::<Vec<_>>();
        targets.sort_by(|left, right| left.app_type.cmp(&right.app_type));
        targets
    }

    pub(crate) async fn provider_id(&self, app_type: &str) -> Option<String> {
        self.routes
            .lock()
            .await
            .providers
            .get(app_type)
            .map(|provider| provider.provider_id.clone())
    }

    pub(crate) async fn record_main_success(
        &self,
        app_type: &str,
        provider: &Provider,
        request_failed_over: bool,
    ) -> Result<RuntimeRouteUpdate, AppError> {
        let config = self.db.get_proxy_config_for_app(app_type).await?;
        if !config.enabled {
            self.clear_if_matches(app_type, &provider.id).await;
            return Ok(RuntimeRouteUpdate {
                accepted: false,
                changed: false,
                failover_incremented: false,
            });
        }

        let failover_queue = if config.auto_failover_enabled {
            let queue = self.db.get_failover_queue(app_type)?;
            if !queue
                .iter()
                .any(|item| item.provider_id == provider.id && item.enabled)
            {
                self.clear_if_matches(app_type, &provider.id).await;
                return Ok(RuntimeRouteUpdate {
                    accepted: false,
                    changed: false,
                    failover_incremented: false,
                });
            }
            Some(queue)
        } else {
            let app = AppType::from_str(app_type)
                .map_err(|_| AppError::InvalidInput(format!("无效的应用类型: {app_type}")))?;
            let current_provider = crate::settings::get_effective_current_provider(&self.db, &app)?;
            if current_provider.as_deref() != Some(provider.id.as_str()) {
                self.clear_if_matches(app_type, &provider.id).await;
                return Ok(RuntimeRouteUpdate {
                    accepted: false,
                    changed: false,
                    failover_incremented: false,
                });
            }
            None
        };

        let mut routes = self.routes.lock().await;
        let previous = routes.providers.get(app_type).cloned();
        let changed = previous
            .as_ref()
            .is_none_or(|current| current.provider_id != provider.id);
        let mut failover_incremented = false;

        if changed {
            if let (Some(queue), Some(previous)) = (failover_queue.as_ref(), previous.as_ref()) {
                let previous_order = queue
                    .iter()
                    .find(|item| item.enabled && item.provider_id == previous.provider_id)
                    .map(|item| item.queue_order);
                let next_order = queue
                    .iter()
                    .find(|item| item.enabled && item.provider_id == provider.id)
                    .map(|item| item.queue_order);
                if previous_order
                    .zip(next_order)
                    .is_some_and(|(old, new)| old < new)
                {
                    let previous_failed = request_failed_over
                        || !self
                            .db
                            .get_provider_health(&previous.provider_id, app_type)
                            .await?
                            .is_healthy;
                    failover_incremented = previous_failed;
                }
            }
        }

        routes.next_sequence = routes.next_sequence.saturating_add(1);
        let sequence = routes.next_sequence;
        routes.providers.insert(
            app_type.to_string(),
            RuntimeProvider {
                provider_id: provider.id.clone(),
                provider_name: provider.name.clone(),
                sequence,
            },
        );
        drop(routes);

        {
            let mut status = self.status.write().await;
            status.current_provider = Some(provider.name.clone());
            status.current_provider_id = Some(provider.id.clone());
            status.last_error = None;
            if failover_incremented {
                status.failover_count = status.failover_count.saturating_add(1);
            }
        }

        if changed {
            self.emit_change(app_type, Some(provider));
        }

        Ok(RuntimeRouteUpdate {
            accepted: true,
            changed,
            failover_incremented,
        })
    }

    pub(crate) async fn clear(&self, app_type: &str) -> bool {
        self.clear_matching(app_type, None).await
    }

    pub(crate) async fn clear_if_matches(&self, app_type: &str, provider_id: &str) -> bool {
        self.clear_matching(app_type, Some(provider_id)).await
    }

    async fn clear_matching(&self, app_type: &str, provider_id: Option<&str>) -> bool {
        let mut routes = self.routes.lock().await;
        let should_remove = routes.providers.get(app_type).is_some_and(|current| {
            provider_id.is_none_or(|expected| current.provider_id == expected)
        });
        if !should_remove {
            return false;
        }
        routes.providers.remove(app_type);
        let latest = routes
            .providers
            .values()
            .max_by_key(|provider| provider.sequence)
            .cloned();
        drop(routes);

        {
            let mut status = self.status.write().await;
            status.current_provider = latest
                .as_ref()
                .map(|provider| provider.provider_name.clone());
            status.current_provider_id = latest.map(|provider| provider.provider_id);
        }
        self.emit_change(app_type, None);
        true
    }

    fn emit_change(&self, app_type: &str, provider: Option<&Provider>) {
        let Some(app) = self.app_handle.as_ref() else {
            return;
        };
        let payload = serde_json::json!({
            "appType": app_type,
            "providerId": provider.map(|value| value.id.as_str()),
            "providerName": provider.map(|value| value.name.as_str()),
        });
        if let Err(error) = app.emit(RUNTIME_PROVIDER_CHANGED_EVENT, payload) {
            log::warn!("发射运行时供应商事件失败: {error}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn provider(id: &str) -> Provider {
        Provider::with_id(id.to_string(), format!("Provider {id}"), json!({}), None)
    }

    async fn tracker_with_queue() -> (
        Arc<Database>,
        Arc<RwLock<ProxyStatus>>,
        RuntimeRouteTracker,
        Provider,
        Provider,
    ) {
        let db = Arc::new(Database::memory().unwrap());
        let first = provider("first");
        let second = provider("second");
        db.save_provider("codex", &first).unwrap();
        db.save_provider("codex", &second).unwrap();
        db.add_to_failover_queue("codex", &first.id).unwrap();
        db.add_to_failover_queue("codex", &second.id).unwrap();
        db.set_proxy_flags_sync("codex", true, true).unwrap();
        let status = Arc::new(RwLock::new(ProxyStatus::default()));
        let tracker = RuntimeRouteTracker::new(db.clone(), status.clone(), None);
        (db, status, tracker, first, second)
    }

    #[tokio::test]
    async fn runtime_route_counts_only_failure_driven_priority_downgrades_once() {
        let (db, status, tracker, first, second) = tracker_with_queue().await;

        let first_update = tracker
            .record_main_success("codex", &first, false)
            .await
            .unwrap();
        assert_eq!(
            first_update,
            RuntimeRouteUpdate {
                accepted: true,
                changed: true,
                failover_incremented: false,
            }
        );

        let failed_over = tracker
            .record_main_success("codex", &second, true)
            .await
            .unwrap();
        assert!(failed_over.failover_incremented);
        let repeated = tracker
            .record_main_success("codex", &second, false)
            .await
            .unwrap();
        assert!(!repeated.changed);
        assert!(!repeated.failover_incremented);

        tracker
            .record_main_success("codex", &first, false)
            .await
            .unwrap();
        db.update_provider_health_with_threshold(
            &first.id,
            "codex",
            false,
            Some("circuit open".to_string()),
            1,
        )
        .await
        .unwrap();
        let circuit_failover = tracker
            .record_main_success("codex", &second, false)
            .await
            .unwrap();
        assert!(circuit_failover.failover_incremented);
        assert_eq!(status.read().await.failover_count, 2);
    }

    #[tokio::test]
    async fn disabled_in_flight_success_cannot_restore_runtime_route() {
        let (db, _status, tracker, first, _second) = tracker_with_queue().await;
        tracker
            .record_main_success("codex", &first, false)
            .await
            .unwrap();
        db.set_failover_provider_enabled("codex", &first.id, false)
            .unwrap();

        let update = tracker
            .record_main_success("codex", &first, false)
            .await
            .unwrap();

        assert!(!update.accepted);
        assert_eq!(tracker.provider_id("codex").await, None);
    }

    #[tokio::test]
    async fn manual_disable_clear_does_not_count_next_enabled_channel() {
        let (db, status, tracker, first, second) = tracker_with_queue().await;
        tracker
            .record_main_success("codex", &first, false)
            .await
            .unwrap();
        db.set_failover_provider_enabled("codex", &first.id, false)
            .unwrap();
        assert!(tracker.clear_if_matches("codex", &first.id).await);

        let update = tracker
            .record_main_success("codex", &second, false)
            .await
            .unwrap();

        assert!(update.accepted);
        assert!(!update.failover_incremented);
        assert_eq!(status.read().await.failover_count, 0);
    }
}
