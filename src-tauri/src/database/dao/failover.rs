//! 故障转移队列 DAO
//!
//! 管理代理模式下的故障转移队列

use crate::database::{lock_conn, Database};
use crate::error::AppError;
use crate::provider::Provider;
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};

/// 故障转移队列条目
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FailoverQueueItem {
    pub provider_id: String,
    pub provider_name: String,
    pub queue_order: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_notes: Option<String>,
}

impl Database {
    /// 获取故障转移队列（按加入顺序排序）
    pub fn get_failover_queue(&self, app_type: &str) -> Result<Vec<FailoverQueueItem>, AppError> {
        let conn = lock_conn!(self.conn);

        let mut stmt = conn
            .prepare(
                "SELECT id, name, notes
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
                ))
            })
            .map_err(|e| AppError::Database(e.to_string()))?;

        let items = rows
            .enumerate()
            .map(|(index, row)| {
                let (provider_id, provider_name, provider_notes) =
                    row.map_err(|e| AppError::Database(e.to_string()))?;
                Ok(FailoverQueueItem {
                    provider_id,
                    provider_name,
                    queue_order: index + 1,
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
             SET in_failover_queue = 0, failover_order = NULL
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
             SET in_failover_queue = 0, failover_order = NULL
             WHERE app_type = ?1",
            [app_type],
        )
        .map_err(|e| AppError::Database(e.to_string()))?;

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

    fn save_provider(db: &Database, id: &str, sort_index: usize) {
        let mut provider =
            Provider::with_id(id.to_string(), format!("Provider {id}"), json!({}), None);
        provider.sort_index = Some(sort_index);
        db.save_provider("codex", &provider).unwrap();
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
}
