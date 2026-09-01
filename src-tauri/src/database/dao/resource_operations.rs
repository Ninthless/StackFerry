use crate::database::{lock_conn, Database};
use crate::error::AppError;
use rusqlite::{params, OptionalExtension};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResourceOperation {
    pub id: String,
    pub operation_type: String,
    pub phase: String,
    pub instance_id: String,
    pub provider_id: String,
    pub app_type: String,
    pub credential_ref: String,
    pub original_dir: Option<String>,
    pub quarantine_dir: Option<String>,
    pub error: Option<String>,
    pub retry_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub completed_at: Option<i64>,
}

pub struct ResourceOperationUpdate<'a> {
    pub phase: &'a str,
    pub original_dir: Option<&'a str>,
    pub quarantine_dir: Option<&'a str>,
    pub error: Option<&'a str>,
    pub retry_count: i64,
    pub updated_at: i64,
}

impl Database {
    pub fn create_resource_operation(&self, operation: &ResourceOperation) -> Result<(), AppError> {
        let conn = lock_conn!(self.conn);
        conn.execute(
            "INSERT INTO instance_resource_operations (
                id, operation_type, phase, instance_id, provider_id, app_type, credential_ref,
                original_dir, quarantine_dir, error, retry_count, created_at, updated_at, completed_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                operation.id,
                operation.operation_type,
                operation.phase,
                operation.instance_id,
                operation.provider_id,
                operation.app_type,
                operation.credential_ref,
                operation.original_dir,
                operation.quarantine_dir,
                operation.error,
                operation.retry_count,
                operation.created_at,
                operation.updated_at,
                operation.completed_at,
            ],
        )
        .map_err(|error| AppError::Database(format!("创建实例资源操作失败: {error}")))?;
        Ok(())
    }

    pub fn update_resource_operation(
        &self,
        id: &str,
        update: ResourceOperationUpdate<'_>,
    ) -> Result<bool, AppError> {
        let conn = lock_conn!(self.conn);
        conn.execute(
            "UPDATE instance_resource_operations
             SET phase = ?2,
                 original_dir = COALESCE(?3, original_dir),
                 quarantine_dir = COALESCE(?4, quarantine_dir),
                 error = ?5,
                 retry_count = ?6,
                 updated_at = ?7
             WHERE id = ?1 AND completed_at IS NULL",
            params![
                id,
                update.phase,
                update.original_dir,
                update.quarantine_dir,
                update.error,
                update.retry_count,
                update.updated_at
            ],
        )
        .map(|changed| changed > 0)
        .map_err(|error| AppError::Database(format!("更新实例资源操作失败: {error}")))
    }

    pub(crate) fn record_resource_operation_failure(
        &self,
        id: &str,
        phase: &str,
        error: &str,
        updated_at: i64,
    ) -> Result<bool, AppError> {
        let conn = lock_conn!(self.conn);
        conn.execute(
            "UPDATE instance_resource_operations
             SET phase = ?2,
                 error = ?3,
                 retry_count = retry_count + 1,
                 updated_at = ?4
             WHERE id = ?1 AND completed_at IS NULL",
            params![id, phase, error, updated_at],
        )
        .map(|changed| changed > 0)
        .map_err(|db_error| AppError::Database(format!("记录实例资源操作失败状态失败: {db_error}")))
    }

    pub fn complete_resource_operation(&self, id: &str, now: i64) -> Result<bool, AppError> {
        let conn = lock_conn!(self.conn);
        conn.execute(
            "UPDATE instance_resource_operations
             SET phase = 'completed', error = NULL, updated_at = ?2, completed_at = ?2
             WHERE id = ?1 AND completed_at IS NULL",
            params![id, now],
        )
        .map(|changed| changed > 0)
        .map_err(|error| AppError::Database(format!("完成实例资源操作失败: {error}")))
    }

    pub fn list_pending_resource_operations(&self) -> Result<Vec<ResourceOperation>, AppError> {
        let conn = lock_conn!(self.conn);
        let mut statement = conn
            .prepare(
                "SELECT id, operation_type, phase, instance_id, provider_id, app_type,
                        credential_ref, original_dir, quarantine_dir, error, retry_count,
                        created_at, updated_at, completed_at
                 FROM instance_resource_operations
                 WHERE completed_at IS NULL
                 ORDER BY created_at, id",
            )
            .map_err(|error| AppError::Database(format!("准备查询未完成资源操作失败: {error}")))?;
        let rows = statement
            .query_map([], map_resource_operation)
            .map_err(|error| AppError::Database(format!("查询未完成资源操作失败: {error}")))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| AppError::Database(format!("读取未完成资源操作失败: {error}")))
    }

    pub(crate) fn get_resource_operation(
        &self,
        id: &str,
    ) -> Result<Option<ResourceOperation>, AppError> {
        let conn = lock_conn!(self.conn);
        conn.query_row(
            "SELECT id, operation_type, phase, instance_id, provider_id, app_type,
                    credential_ref, original_dir, quarantine_dir, error, retry_count,
                    created_at, updated_at, completed_at
             FROM instance_resource_operations
             WHERE id = ?1",
            [id],
            map_resource_operation,
        )
        .optional()
        .map_err(|error| AppError::Database(format!("读取实例资源操作失败: {error}")))
    }

    pub(crate) fn commit_instance_resource_deletion(
        &self,
        operation_id: &str,
        instance_id: &str,
        now: i64,
    ) -> Result<bool, AppError> {
        let conn = lock_conn!(self.conn);
        let transaction = conn
            .unchecked_transaction()
            .map_err(|error| AppError::Database(format!("开始实例删除事务失败: {error}")))?;
        let deleted = transaction
            .execute("DELETE FROM agent_instances WHERE id = ?1", [instance_id])
            .map_err(|error| AppError::Database(format!("删除实例数据库记录失败: {error}")))?;
        let operation_updated = transaction
            .execute(
                "UPDATE instance_resource_operations
                 SET phase = 'db_deleted', error = NULL, updated_at = ?2
                 WHERE id = ?1 AND completed_at IS NULL",
                params![operation_id, now],
            )
            .map_err(|error| AppError::Database(format!("记录实例数据库删除阶段失败: {error}")))?;
        if operation_updated != 1 {
            return Err(AppError::Database(format!(
                "实例资源操作 {operation_id} 不存在或已完成"
            )));
        }
        transaction
            .commit()
            .map_err(|error| AppError::Database(format!("提交实例删除事务失败: {error}")))?;
        Ok(deleted > 0)
    }
}

fn map_resource_operation(row: &rusqlite::Row<'_>) -> rusqlite::Result<ResourceOperation> {
    Ok(ResourceOperation {
        id: row.get(0)?,
        operation_type: row.get(1)?,
        phase: row.get(2)?,
        instance_id: row.get(3)?,
        provider_id: row.get(4)?,
        app_type: row.get(5)?,
        credential_ref: row.get(6)?,
        original_dir: row.get(7)?,
        quarantine_dir: row.get(8)?,
        error: row.get(9)?,
        retry_count: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
        completed_at: row.get(13)?,
    })
}
