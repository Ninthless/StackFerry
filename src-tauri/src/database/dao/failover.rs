//! 故障转移队列 DAO
//!
//! 管理代理模式下的故障转移队列

use crate::database::{lock_conn, Database};
use crate::error::AppError;
use crate::infrastructure::persistence::FailoverQueueItem;
use crate::provider::Provider;
use rusqlite::OptionalExtension;

impl Database {
    /// 获取故障转移队列（按加入顺序排序）
    pub fn get_failover_queue(&self, app_type: &str) -> Result<Vec<FailoverQueueItem>, AppError> {
        let conn = lock_conn!(self.conn);

        let mut stmt = conn
            .prepare(
                "SELECT id, name, notes, failover_enabled
                 FROM providers
                 WHERE app_type = ?1 AND in_failover_queue = 1
                 ORDER BY
                    CASE WHEN failover_order IS NULL THEN 1 ELSE 0 END,
                    failover_order ASC,
                    id ASC",
            )
            .map_err(|e| AppError::Database(e.to_string()))?;

        let rows = stmt
            .query_map([app_type], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, bool>(3)?,
                ))
            })
            .map_err(|e| AppError::Database(e.to_string()))?;

        let items = rows
            .enumerate()
            .map(|(index, row)| {
                let (provider_id, provider_name, provider_notes, enabled) =
                    row.map_err(|e| AppError::Database(e.to_string()))?;
                Ok(FailoverQueueItem {
                    provider_id,
                    provider_name,
                    queue_order: index + 1,
                    enabled,
                    provider_notes,
                })
            })
            .collect::<Result<Vec<_>, AppError>>()?;

        Ok(items)
    }

    /// 获取故障转移队列中的供应商（完整 Provider 信息，按顺序）
    pub fn get_failover_providers(&self, app_type: &str) -> Result<Vec<Provider>, AppError> {
        let queue = self.get_failover_queue(app_type)?;
        let all_providers = self.get_all_providers(app_type)?;
        let result = queue
            .into_iter()
            .filter_map(|item| all_providers.get(&item.provider_id).cloned())
            .collect();

        Ok(result)
    }

    /// 添加供应商到故障转移队列末尾
    pub fn add_to_failover_queue(&self, app_type: &str, provider_id: &str) -> Result<(), AppError> {
        let conn = lock_conn!(self.conn);

        let updated = conn
            .execute(
                "UPDATE providers
             SET in_failover_queue = 1,
                 failover_enabled = CASE
                     WHEN in_failover_queue = 1 THEN failover_enabled
                     ELSE 1
                 END,
                 failover_order = CASE
                     WHEN in_failover_queue = 1 AND failover_order IS NOT NULL
                         THEN failover_order
                     ELSE (
                         SELECT COALESCE(MAX(failover_order), 0) + 1
                         FROM providers
                         WHERE app_type = ?2 AND in_failover_queue = 1
                     )
                 END
             WHERE id = ?1 AND app_type = ?2",
                rusqlite::params![provider_id, app_type],
            )
            .map_err(|e| AppError::Database(e.to_string()))?;

        if updated != 1 {
            return Err(AppError::Message(format!(
                "供应商不存在: {provider_id} ({app_type})"
            )));
        }

        Ok(())
    }

    /// 从故障转移队列中移除供应商
    pub fn remove_from_failover_queue(
        &self,
        app_type: &str,
        provider_id: &str,
    ) -> Result<(), AppError> {
        let mut conn = lock_conn!(self.conn);
        let tx = conn
            .transaction()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let provider_state: Option<(bool, Option<i64>)> = tx
            .query_row(
                "SELECT in_failover_queue, failover_order
                 FROM providers
                 WHERE id = ?1 AND app_type = ?2",
                rusqlite::params![provider_id, app_type],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let Some((was_queued, removed_order)) = provider_state else {
            return Err(AppError::Message(format!(
                "供应商不存在: {provider_id} ({app_type})"
            )));
        };

        tx.execute(
            "UPDATE providers
             SET in_failover_queue = 0, failover_order = NULL, failover_enabled = 1
             WHERE id = ?1 AND app_type = ?2",
            rusqlite::params![provider_id, app_type],
        )
        .map_err(|e| AppError::Database(e.to_string()))?;

        if was_queued {
            if let Some(removed_order) = removed_order {
                tx.execute(
                    "UPDATE providers
                     SET failover_order = failover_order - 1
                     WHERE app_type = ?1
                       AND in_failover_queue = 1
                       AND failover_order > ?2",
                    rusqlite::params![app_type, removed_order],
                )
                .map_err(|e| AppError::Database(e.to_string()))?;
            }
        }

        tx.execute(
            "DELETE FROM provider_health WHERE provider_id = ?1 AND app_type = ?2",
            rusqlite::params![provider_id, app_type],
        )
        .map_err(|e| AppError::Database(e.to_string()))?;

        tx.commit().map_err(|e| AppError::Database(e.to_string()))?;

        log::info!("已从故障转移队列移除供应商 {provider_id} ({app_type}), 并清除其健康状态");

        Ok(())
    }

    /// 清空故障转移队列
    pub fn clear_failover_queue(&self, app_type: &str) -> Result<(), AppError> {
        let conn = lock_conn!(self.conn);

        conn.execute(
            "UPDATE providers
             SET in_failover_queue = 0, failover_order = NULL, failover_enabled = 1
             WHERE app_type = ?1",
            [app_type],
        )
        .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(())
    }

    pub fn set_failover_provider_enabled(
        &self,
        app_type: &str,
        provider_id: &str,
        enabled: bool,
    ) -> Result<(), AppError> {
        let mut conn = lock_conn!(self.conn);
        let tx = conn
            .transaction()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let config: Option<(bool, bool)> = tx
            .query_row(
                "SELECT enabled, auto_failover_enabled
                 FROM proxy_config
                 WHERE app_type = ?1",
                [app_type],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let Some((takeover_enabled, auto_failover_enabled)) = config else {
            return Err(AppError::InvalidInput(format!(
                "无效的应用类型: {app_type}"
            )));
        };
        if !takeover_enabled {
            return Err(AppError::Message(
                "需要先启用该应用的代理接管，再调整故障转移渠道".to_string(),
            ));
        }
        if !auto_failover_enabled {
            return Err(AppError::Message(
                "需要先开启自动故障转移，再调整故障转移渠道".to_string(),
            ));
        }

        let provider_state: Option<(bool, bool)> = tx
            .query_row(
                "SELECT in_failover_queue, failover_enabled
                 FROM providers
                 WHERE id = ?1 AND app_type = ?2",
                rusqlite::params![provider_id, app_type],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let Some((in_queue, currently_enabled)) = provider_state else {
            return Err(AppError::Message(format!(
                "供应商不存在: {provider_id} ({app_type})"
            )));
        };
        if !in_queue {
            return Err(AppError::Message(format!(
                "供应商不在故障转移队列中: {provider_id} ({app_type})"
            )));
        }
        if currently_enabled == enabled {
            tx.commit().map_err(|e| AppError::Database(e.to_string()))?;
            return Ok(());
        }

        if !enabled {
            let enabled_count: i64 = tx
                .query_row(
                    "SELECT COUNT(*)
                     FROM providers
                     WHERE app_type = ?1
                       AND in_failover_queue = 1
                       AND failover_enabled = 1",
                    [app_type],
                    |row| row.get(0),
                )
                .map_err(|e| AppError::Database(e.to_string()))?;
            if enabled_count <= 1 {
                return Err(AppError::Message(
                    "故障转移队列至少需要保留一个启用渠道".to_string(),
                ));
            }
        }

        let updated = tx
            .execute(
                "UPDATE providers
                 SET failover_enabled = ?3
                 WHERE id = ?1 AND app_type = ?2 AND in_failover_queue = 1",
                rusqlite::params![provider_id, app_type, enabled],
            )
            .map_err(|e| AppError::Database(e.to_string()))?;
        if updated != 1 {
            return Err(AppError::Message(format!(
                "故障转移队列状态已变化，请刷新后重试: {provider_id} ({app_type})"
            )));
        }

        tx.commit().map_err(|e| AppError::Database(e.to_string()))?;
        Ok(())
    }

    /// 检查供应商是否在故障转移队列中
    pub fn is_in_failover_queue(
        &self,
        app_type: &str,
        provider_id: &str,
    ) -> Result<bool, AppError> {
        let conn = lock_conn!(self.conn);

        let in_queue: bool = conn
            .query_row(
                "SELECT in_failover_queue FROM providers WHERE id = ?1 AND app_type = ?2",
                rusqlite::params![provider_id, app_type],
                |row| row.get(0),
            )
            .unwrap_or(false);

        Ok(in_queue)
    }

    /// 获取可添加到故障转移队列的供应商（不在队列中的）
    pub fn get_available_providers_for_failover(
        &self,
        app_type: &str,
    ) -> Result<Vec<Provider>, AppError> {
        let all_providers = self.get_all_providers(app_type)?;

        let available: Vec<Provider> = all_providers
            .into_values()
            .filter(|p| !p.in_failover_queue)
            .collect();

        Ok(available)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::{Arc, Barrier};

    fn save_provider(db: &Database, id: &str, sort_index: usize) {
        let mut provider =
            Provider::with_id(id.to_string(), format!("Provider {id}"), json!({}), None);
        provider.sort_index = Some(sort_index);
        db.save_provider("codex", &provider).unwrap();
    }

    fn activate_failover(db: &Database) {
        db.set_proxy_flags_sync("codex", true, true).unwrap();
    }

    #[test]
    fn queue_priority_follows_join_order_not_provider_sort_order() {
        let db = Database::memory().unwrap();
        save_provider(&db, "first", 100);
        save_provider(&db, "second", 0);

        db.add_to_failover_queue("codex", "first").unwrap();
        db.add_to_failover_queue("codex", "second").unwrap();

        let queue = db.get_failover_queue("codex").unwrap();
        assert_eq!(
            queue
                .iter()
                .map(|item| (item.provider_id.as_str(), item.queue_order))
                .collect::<Vec<_>>(),
            vec![("first", 1), ("second", 2)]
        );
    }

    #[test]
    fn duplicate_add_is_idempotent_and_readd_appends_to_end() {
        let db = Database::memory().unwrap();
        save_provider(&db, "a", 0);
        save_provider(&db, "b", 1);
        save_provider(&db, "c", 2);

        db.add_to_failover_queue("codex", "a").unwrap();
        db.add_to_failover_queue("codex", "b").unwrap();
        db.add_to_failover_queue("codex", "a").unwrap();
        db.add_to_failover_queue("codex", "c").unwrap();
        db.remove_from_failover_queue("codex", "a").unwrap();
        db.add_to_failover_queue("codex", "a").unwrap();

        let queue = db.get_failover_queue("codex").unwrap();
        assert_eq!(
            queue
                .iter()
                .map(|item| (item.provider_id.as_str(), item.queue_order))
                .collect::<Vec<_>>(),
            vec![("b", 1), ("c", 2), ("a", 3)]
        );
    }

    #[test]
    fn clear_resets_order_and_missing_provider_is_rejected() {
        let db = Database::memory().unwrap();
        save_provider(&db, "a", 0);
        save_provider(&db, "b", 1);

        db.add_to_failover_queue("codex", "a").unwrap();
        db.add_to_failover_queue("codex", "b").unwrap();
        db.clear_failover_queue("codex").unwrap();

        let ordered_rows: i64 = db
            .conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM providers WHERE failover_order IS NOT NULL",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(ordered_rows, 0);

        db.add_to_failover_queue("codex", "b").unwrap();

        let queue = db.get_failover_queue("codex").unwrap();
        assert_eq!(queue.len(), 1);
        assert_eq!(queue[0].provider_id, "b");
        assert_eq!(queue[0].queue_order, 1);
        assert!(db
            .add_to_failover_queue("codex", "missing")
            .unwrap_err()
            .to_string()
            .contains("供应商不存在"));
    }

    #[test]
    fn toggle_preserves_order_health_and_local_disabled_state() {
        let db = Database::memory().unwrap();
        save_provider(&db, "a", 0);
        save_provider(&db, "b", 1);
        db.add_to_failover_queue("codex", "a").unwrap();
        db.add_to_failover_queue("codex", "b").unwrap();
        activate_failover(&db);
        db.conn
            .lock()
            .unwrap()
            .execute(
                "INSERT INTO provider_health (
                    provider_id, app_type, is_healthy, consecutive_failures,
                    last_error, updated_at
                 ) VALUES ('a', 'codex', 0, 3, 'upstream failed', datetime('now'))",
                [],
            )
            .unwrap();

        db.set_failover_provider_enabled("codex", "a", false)
            .unwrap();
        db.add_to_failover_queue("codex", "a").unwrap();

        let queue = db.get_failover_queue("codex").unwrap();
        assert_eq!(
            queue
                .iter()
                .map(|item| (item.provider_id.as_str(), item.queue_order, item.enabled))
                .collect::<Vec<_>>(),
            vec![("a", 1, false), ("b", 2, true)]
        );
        let health: (bool, i64, String) = db
            .conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT is_healthy, consecutive_failures, last_error
                 FROM provider_health WHERE provider_id = 'a' AND app_type = 'codex'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(health, (false, 3, "upstream failed".to_string()));

        let mut provider = db.get_provider_by_id("a", "codex").unwrap().unwrap();
        provider.name = "Updated A".to_string();
        db.save_provider("codex", &provider).unwrap();
        assert!(!db.get_failover_queue("codex").unwrap()[0].enabled);

        db.remove_from_failover_queue("codex", "a").unwrap();
        db.add_to_failover_queue("codex", "a").unwrap();
        let queue = db.get_failover_queue("codex").unwrap();
        assert_eq!(
            queue
                .iter()
                .map(|item| (item.provider_id.as_str(), item.queue_order, item.enabled))
                .collect::<Vec<_>>(),
            vec![("b", 1, true), ("a", 2, true)]
        );

        db.set_failover_provider_enabled("codex", "a", false)
            .unwrap();
        db.clear_failover_queue("codex").unwrap();
        db.add_to_failover_queue("codex", "a").unwrap();
        let queue = db.get_failover_queue("codex").unwrap();
        assert_eq!((queue[0].queue_order, queue[0].enabled), (1, true));
    }

    #[test]
    fn toggle_rejects_inactive_non_member_and_last_enabled_channel() {
        let db = Database::memory().unwrap();
        save_provider(&db, "a", 0);
        save_provider(&db, "b", 1);
        save_provider(&db, "outside", 2);
        db.add_to_failover_queue("codex", "a").unwrap();
        db.add_to_failover_queue("codex", "b").unwrap();

        let inactive = db
            .set_failover_provider_enabled("codex", "a", false)
            .unwrap_err()
            .to_string();
        assert!(inactive.contains("代理接管"));
        assert!(db.get_failover_queue("codex").unwrap()[0].enabled);

        db.set_proxy_flags_sync("codex", true, false).unwrap();
        let failover_off = db
            .set_failover_provider_enabled("codex", "a", false)
            .unwrap_err()
            .to_string();
        assert!(failover_off.contains("自动故障转移"));

        activate_failover(&db);
        let outside = db
            .set_failover_provider_enabled("codex", "outside", false)
            .unwrap_err()
            .to_string();
        assert!(outside.contains("不在故障转移队列"));

        db.set_failover_provider_enabled("codex", "a", false)
            .unwrap();
        let last_enabled = db
            .set_failover_provider_enabled("codex", "b", false)
            .unwrap_err()
            .to_string();
        assert!(last_enabled.contains("至少需要保留一个"));
        let queue = db.get_failover_queue("codex").unwrap();
        assert_eq!(
            queue.iter().map(|item| item.enabled).collect::<Vec<_>>(),
            vec![false, true]
        );
    }

    #[test]
    fn concurrent_disables_keep_one_channel_enabled() {
        let db = Arc::new(Database::memory().unwrap());
        save_provider(&db, "a", 0);
        save_provider(&db, "b", 1);
        db.add_to_failover_queue("codex", "a").unwrap();
        db.add_to_failover_queue("codex", "b").unwrap();
        activate_failover(&db);
        let barrier = Arc::new(Barrier::new(3));

        let handles = ["a", "b"].map(|provider_id| {
            let db = Arc::clone(&db);
            let barrier = Arc::clone(&barrier);
            std::thread::spawn(move || {
                barrier.wait();
                db.set_failover_provider_enabled("codex", provider_id, false)
            })
        });
        barrier.wait();
        let results = handles.map(|handle| handle.join().unwrap());

        assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
        assert_eq!(
            db.get_failover_queue("codex")
                .unwrap()
                .iter()
                .filter(|item| item.enabled)
                .count(),
            1
        );
    }
}
