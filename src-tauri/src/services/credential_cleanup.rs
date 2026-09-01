use std::collections::HashSet;

use crate::database::{lock_conn, AgentInstance, Database, ResourceOperation};
use crate::error::AppError;

pub(crate) struct CredentialCleanupService;

impl CredentialCleanupService {
    pub(crate) fn snapshot_instances(db: &Database) -> Result<Vec<AgentInstance>, AppError> {
        let connection = lock_conn!(db.conn);
        if !Database::table_exists(&connection, "agent_instances")? {
            return Ok(Vec::new());
        }
        let mut statement = connection.prepare(
            "SELECT id, provider_id, app_type, name, credential_ref, codex_home, runtime_home,
                    recent_project_dir, last_launched_at, runtime_config, created_at, updated_at
             FROM agent_instances
             ORDER BY created_at, id",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(AgentInstance {
                id: row.get(0)?,
                provider_id: row.get(1)?,
                app_type: row.get(2)?,
                name: row.get(3)?,
                credential_ref: row.get(4)?,
                codex_home: row.get(5)?,
                runtime_home: row.get(6)?,
                recent_project_dir: row.get(7)?,
                last_launched_at: row.get(8)?,
                runtime_config: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub(crate) fn schedule_orphan_cleanup(
        db: &Database,
        before_instances: &[AgentInstance],
        after_ids: &HashSet<String>,
    ) -> Result<usize, AppError> {
        let removed = before_instances
            .iter()
            .filter(|instance| !after_ids.contains(&instance.id))
            .collect::<Vec<_>>();
        if removed.is_empty() {
            return Ok(0);
        }

        let now = chrono::Utc::now().timestamp();
        let removed_count = removed.len();
        for instance in removed {
            let operation_id = format!("orphan-cleanup-{}", uuid::Uuid::new_v4());
            db.create_resource_operation(&ResourceOperation {
                id: operation_id.clone(),
                operation_type: "delete_instance".to_string(),
                phase: "db_deleted".to_string(),
                instance_id: instance.id.clone(),
                provider_id: instance.provider_id.clone(),
                app_type: instance.app_type.clone(),
                credential_ref: instance.credential_ref.clone(),
                original_dir: instance
                    .runtime_home
                    .clone()
                    .or_else(|| instance.codex_home.clone()),
                quarantine_dir: Some(
                    crate::config::get_app_config_dir()
                        .join("instances")
                        .join(".quarantine")
                        .join(format!(".delete-{operation_id}"))
                        .to_string_lossy()
                        .into_owned(),
                ),
                error: None,
                retry_count: 0,
                created_at: now,
                updated_at: now,
                completed_at: None,
            })?;
        }
        Ok(removed_count)
    }

    pub(crate) fn restoration_warnings(db: &Database) -> Vec<String> {
        let instances = match Self::snapshot_instances(db) {
            Ok(instances) => instances,
            Err(error) => return vec![format!("读取恢复后的隔离实例失败: {error}")],
        };
        let mut warnings = Vec::new();
        for instance in &instances {
            match crate::credentials::CredentialIsolationService::status(db, &instance.id) {
                Ok(status) => {
                    if !status.credential_available {
                        warnings.push(format!("实例 {} 的本地凭据不可用", instance.name));
                    }
                    if !status.runtime_home_exists {
                        warnings.push(format!("实例 {} 的运行目录不存在", instance.name));
                    } else if !status.runtime_config_exists {
                        warnings.push(format!("实例 {} 的运行配置不存在", instance.name));
                    }
                }
                Err(error) => {
                    warnings.push(format!("实例 {} 状态检查失败: {error}", instance.name))
                }
            }
        }
        warnings
    }
}
