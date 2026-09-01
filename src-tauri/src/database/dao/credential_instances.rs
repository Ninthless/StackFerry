use crate::database::{lock_conn, Database};
use crate::error::AppError;
use crate::infrastructure::persistence::{AgentInstance, SessionCredentialBinding};
use rusqlite::{params, OptionalExtension};

impl Database {
    pub fn save_agent_instance(&self, instance: &AgentInstance) -> Result<(), AppError> {
        let conn = lock_conn!(self.conn);
        conn.execute(
            "INSERT INTO agent_instances (
                id, provider_id, app_type, name, credential_ref, codex_home, runtime_home,
                recent_project_dir, last_launched_at, runtime_config, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            ON CONFLICT(id) DO UPDATE SET
                provider_id = excluded.provider_id,
                app_type = excluded.app_type,
                name = excluded.name,
                credential_ref = excluded.credential_ref,
                codex_home = excluded.codex_home,
                runtime_home = excluded.runtime_home,
                recent_project_dir = excluded.recent_project_dir,
                last_launched_at = excluded.last_launched_at,
                runtime_config = excluded.runtime_config,
                updated_at = excluded.updated_at",
            params![
                instance.id,
                instance.provider_id,
                instance.app_type,
                instance.name,
                instance.credential_ref,
                instance.codex_home,
                instance.runtime_home,
                instance.recent_project_dir,
                instance.last_launched_at,
                instance.runtime_config,
                instance.created_at,
                instance.updated_at,
            ],
        )
        .map_err(|e| AppError::Database(e.to_string()))?;
        Ok(())
    }

    pub fn get_agent_instance(&self, id: &str) -> Result<Option<AgentInstance>, AppError> {
        let conn = lock_conn!(self.conn);
        conn.query_row(
            "SELECT id, provider_id, app_type, name, credential_ref, codex_home, runtime_home,
                    recent_project_dir, last_launched_at, runtime_config, created_at, updated_at
             FROM agent_instances WHERE id = ?1",
            [id],
            map_agent_instance,
        )
        .optional()
        .map_err(|e| AppError::Database(e.to_string()))
    }

    pub fn get_agent_instances(
        &self,
        provider_id: &str,
        app_type: &str,
    ) -> Result<Vec<AgentInstance>, AppError> {
        let conn = lock_conn!(self.conn);
        let mut statement = conn
            .prepare(
                "SELECT id, provider_id, app_type, name, credential_ref, codex_home, runtime_home,
                        recent_project_dir, last_launched_at, runtime_config, created_at, updated_at
                 FROM agent_instances
                 WHERE provider_id = ?1 AND app_type = ?2
                 ORDER BY created_at, id",
            )
            .map_err(|e| AppError::Database(e.to_string()))?;
        let rows = statement
            .query_map(params![provider_id, app_type], map_agent_instance)
            .map_err(|e| AppError::Database(e.to_string()))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::Database(e.to_string()))
    }

    pub fn get_agent_instances_for_app(
        &self,
        app_type: &str,
    ) -> Result<Vec<AgentInstance>, AppError> {
        let conn = lock_conn!(self.conn);
        let mut statement = conn
            .prepare(
                "SELECT id, provider_id, app_type, name, credential_ref, codex_home, runtime_home,
                        recent_project_dir, last_launched_at, runtime_config, created_at, updated_at
                 FROM agent_instances
                 WHERE app_type = ?1
                 ORDER BY created_at, id",
            )
            .map_err(|e| AppError::Database(e.to_string()))?;
        let rows = statement
            .query_map([app_type], map_agent_instance)
            .map_err(|e| AppError::Database(e.to_string()))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| AppError::Database(e.to_string()))
    }

    pub fn delete_agent_instance(&self, id: &str) -> Result<bool, AppError> {
        let conn = lock_conn!(self.conn);
        conn.execute("DELETE FROM agent_instances WHERE id = ?1", [id])
            .map(|changed| changed > 0)
            .map_err(|e| AppError::Database(e.to_string()))
    }

    pub fn rename_agent_instance(
        &self,
        id: &str,
        name: &str,
        updated_at: i64,
    ) -> Result<bool, AppError> {
        let conn = lock_conn!(self.conn);
        conn.execute(
            "UPDATE agent_instances SET name = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, name, updated_at],
        )
        .map(|changed| changed > 0)
        .map_err(|e| AppError::Database(e.to_string()))
    }

    pub fn update_agent_instance_runtime(
        &self,
        id: &str,
        recent_project_dir: Option<Option<&str>>,
        last_launched_at: Option<i64>,
        runtime_config: Option<&str>,
        updated_at: i64,
    ) -> Result<bool, AppError> {
        let conn = lock_conn!(self.conn);
        let changed = match recent_project_dir {
            Some(project_dir) => conn.execute(
                "UPDATE agent_instances
                 SET recent_project_dir = ?2,
                     last_launched_at = COALESCE(?3, last_launched_at),
                     runtime_config = COALESCE(?4, runtime_config),
                     updated_at = ?5
                 WHERE id = ?1",
                params![
                    id,
                    project_dir,
                    last_launched_at,
                    runtime_config,
                    updated_at
                ],
            ),
            None => conn.execute(
                "UPDATE agent_instances
                 SET last_launched_at = COALESCE(?2, last_launched_at),
                     runtime_config = COALESCE(?3, runtime_config),
                     updated_at = ?4
                 WHERE id = ?1",
                params![id, last_launched_at, runtime_config, updated_at],
            ),
        };
        changed
            .map(|changed| changed > 0)
            .map_err(|e| AppError::Database(e.to_string()))
    }

    pub fn bind_session_credential(
        &self,
        app_type: &str,
        session_id: &str,
        provider_id: &str,
        instance_id: &str,
        now: i64,
    ) -> Result<SessionCredentialBinding, AppError> {
        let conn = lock_conn!(self.conn);
        let transaction = conn
            .unchecked_transaction()
            .map_err(|e| AppError::Database(e.to_string()))?;
        let existing = transaction
            .query_row(
                "SELECT app_type, session_id, provider_id, instance_id, created_at, last_used_at
                 FROM session_credential_bindings
                 WHERE app_type = ?1 AND instance_id = ?2 AND session_id = ?3",
                params![app_type, instance_id, session_id],
                map_session_binding,
            )
            .optional()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let binding = if let Some(mut binding) = existing {
            if binding.provider_id != provider_id || binding.instance_id != instance_id {
                return Err(AppError::InvalidInput(format!(
                    "会话 {session_id} 已绑定到实例 {}，禁止切换或回退到其他凭据",
                    binding.instance_id
                )));
            }
            transaction
                .execute(
                    "UPDATE session_credential_bindings
                     SET last_used_at = ?3
                     WHERE app_type = ?1 AND instance_id = ?2 AND session_id = ?4",
                    params![app_type, instance_id, now, session_id],
                )
                .map_err(|e| AppError::Database(e.to_string()))?;
            binding.last_used_at = now;
            binding
        } else {
            transaction
                .execute(
                    "INSERT INTO session_credential_bindings (
                        app_type, session_id, provider_id, instance_id, created_at, last_used_at
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
                    params![app_type, session_id, provider_id, instance_id, now],
                )
                .map_err(|e| AppError::Database(e.to_string()))?;
            SessionCredentialBinding {
                app_type: app_type.to_string(),
                session_id: session_id.to_string(),
                provider_id: provider_id.to_string(),
                instance_id: instance_id.to_string(),
                created_at: now,
                last_used_at: now,
            }
        };

        transaction
            .commit()
            .map_err(|e| AppError::Database(e.to_string()))?;
        Ok(binding)
    }

    pub fn get_session_credential_binding(
        &self,
        app_type: &str,
        session_id: &str,
        instance_id: Option<&str>,
    ) -> Result<Option<SessionCredentialBinding>, AppError> {
        let conn = lock_conn!(self.conn);
        if let Some(instance_id) = instance_id {
            return conn
                .query_row(
                    "SELECT app_type, session_id, provider_id, instance_id, created_at, last_used_at
                     FROM session_credential_bindings
                     WHERE app_type = ?1 AND instance_id = ?2 AND session_id = ?3",
                    params![app_type, instance_id, session_id],
                    map_session_binding,
                )
                .optional()
                .map_err(|e| AppError::Database(e.to_string()));
        }
        let mut statement = conn
            .prepare(
                "SELECT app_type, session_id, provider_id, instance_id, created_at, last_used_at
                 FROM session_credential_bindings
                 WHERE app_type = ?1 AND session_id = ?2
                 ORDER BY instance_id
                 LIMIT 2",
            )
            .map_err(|e| AppError::Database(e.to_string()))?;
        let mut rows = statement
            .query_map(params![app_type, session_id], map_session_binding)
            .map_err(|e| AppError::Database(e.to_string()))?;
        let first = rows
            .next()
            .transpose()
            .map_err(|e| AppError::Database(e.to_string()))?;
        if rows
            .next()
            .transpose()
            .map_err(|e| AppError::Database(e.to_string()))?
            .is_some()
        {
            return Err(AppError::InvalidInput(format!(
                "会话 {session_id} 存在多个实例凭据绑定，必须显式指定实例"
            )));
        }
        Ok(first)
    }

    pub fn mark_session_credential_binding_used(
        &self,
        app_type: &str,
        instance_id: &str,
        session_id: &str,
        now: i64,
    ) -> Result<bool, AppError> {
        let conn = lock_conn!(self.conn);
        conn.execute(
            "UPDATE session_credential_bindings
             SET last_used_at = ?4
             WHERE app_type = ?1 AND instance_id = ?2 AND session_id = ?3",
            params![app_type, instance_id, session_id, now],
        )
        .map(|changed| changed > 0)
        .map_err(|e| AppError::Database(e.to_string()))
    }
}

fn map_agent_instance(row: &rusqlite::Row<'_>) -> rusqlite::Result<AgentInstance> {
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
}

fn map_session_binding(row: &rusqlite::Row<'_>) -> rusqlite::Result<SessionCredentialBinding> {
    Ok(SessionCredentialBinding {
        app_type: row.get(0)?,
        session_id: row.get(1)?,
        provider_id: row.get(2)?,
        instance_id: row.get(3)?,
        created_at: row.get(4)?,
        last_used_at: row.get(5)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::provider::Provider;
    use serde_json::json;
    use std::sync::{Arc, Barrier};

    fn seed_instance(db: &Database, instance_id: &str, provider_id: &str) -> AgentInstance {
        db.save_provider(
            "codex",
            &Provider::with_id(
                provider_id.to_string(),
                provider_id.to_string(),
                json!({}),
                None,
            ),
        )
        .expect("seed provider");
        let instance = AgentInstance {
            id: instance_id.to_string(),
            provider_id: provider_id.to_string(),
            app_type: "codex".to_string(),
            name: instance_id.to_string(),
            credential_ref: format!("credential:{instance_id}"),
            codex_home: Some(format!("/tmp/{instance_id}")),
            runtime_home: Some(format!("/tmp/{instance_id}")),
            recent_project_dir: None,
            last_launched_at: None,
            runtime_config: None,
            created_at: 1,
            updated_at: 1,
        };
        db.save_agent_instance(&instance).expect("save instance");
        instance
    }

    #[test]
    fn same_session_id_is_isolated_by_instance_and_unscoped_lookup_fails() {
        let db = Database::memory().expect("memory db");
        seed_instance(&db, "instance-a", "provider-a");
        seed_instance(&db, "instance-b", "provider-b");

        db.bind_session_credential("codex", "session-1", "provider-a", "instance-a", 10)
            .expect("bind session");
        db.bind_session_credential("codex", "session-1", "provider-b", "instance-b", 11)
            .expect("same session id may exist under another instance home");

        let error = db
            .get_session_credential_binding("codex", "session-1", None)
            .expect_err("unscoped lookup must reject ambiguous instance bindings");
        assert!(error.to_string().contains("必须显式指定实例"));
        let binding = db
            .get_session_credential_binding("codex", "session-1", Some("instance-a"))
            .expect("read binding")
            .expect("binding");
        assert_eq!(binding.provider_id, "provider-a");
        assert_eq!(binding.instance_id, "instance-a");
        assert_eq!(binding.last_used_at, 10);
    }

    #[test]
    fn mark_session_binding_used_updates_only_exact_instance_scope() {
        let db = Database::memory().expect("memory db");
        seed_instance(&db, "instance-a", "provider-a");
        seed_instance(&db, "instance-b", "provider-b");

        db.bind_session_credential("codex", "session-1", "provider-a", "instance-a", 10)
            .expect("bind first");
        db.bind_session_credential("codex", "session-1", "provider-b", "instance-b", 11)
            .expect("bind second");

        assert!(db
            .mark_session_credential_binding_used("codex", "instance-a", "session-1", 20)
            .expect("mark binding used"));

        let first = db
            .get_session_credential_binding("codex", "session-1", Some("instance-a"))
            .expect("read first")
            .expect("first binding");
        let second = db
            .get_session_credential_binding("codex", "session-1", Some("instance-b"))
            .expect("read second")
            .expect("second binding");
        assert_eq!(first.last_used_at, 20);
        assert_eq!(second.last_used_at, 11);
    }

    #[test]
    fn concurrent_sessions_do_not_cross_instance_boundaries() {
        let db = Arc::new(Database::memory().expect("memory db"));
        seed_instance(&db, "instance-a", "provider-a");
        seed_instance(&db, "instance-b", "provider-b");
        let barrier = Arc::new(Barrier::new(3));

        let handles = [
            ("session-a", "provider-a", "instance-a"),
            ("session-b", "provider-b", "instance-b"),
        ]
        .into_iter()
        .map(|(session_id, provider_id, instance_id)| {
            let db = db.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                db.bind_session_credential("codex", session_id, provider_id, instance_id, 20)
            })
        })
        .collect::<Vec<_>>();

        barrier.wait();
        for handle in handles {
            handle.join().expect("worker").expect("bind session");
        }

        let first = db
            .get_session_credential_binding("codex", "session-a", Some("instance-a"))
            .expect("read first")
            .expect("first binding");
        let second = db
            .get_session_credential_binding("codex", "session-b", Some("instance-b"))
            .expect("read second")
            .expect("second binding");
        assert_eq!(first.instance_id, "instance-a");
        assert_eq!(second.instance_id, "instance-b");
    }

    #[test]
    fn runtime_fields_round_trip_and_update_without_clearing_other_state() {
        let db = Database::memory().expect("memory db");
        let mut instance = seed_instance(&db, "instance-a", "provider-a");
        instance.recent_project_dir = Some("/tmp/project-a".to_string());
        instance.last_launched_at = Some(10);
        instance.runtime_config = Some(r#"{"healthy":true}"#.to_string());
        instance.updated_at = 10;
        db.save_agent_instance(&instance).expect("update instance");

        db.update_agent_instance_runtime(
            "instance-a",
            Some(Some("/tmp/project-b")),
            Some(20),
            None,
            20,
        )
        .expect("update runtime");
        db.rename_agent_instance("instance-a", "Renamed", 21)
            .expect("rename");

        let stored = db
            .get_agent_instance("instance-a")
            .expect("read instance")
            .expect("instance");
        assert_eq!(stored.name, "Renamed");
        assert_eq!(stored.runtime_home.as_deref(), Some("/tmp/instance-a"));
        assert_eq!(stored.recent_project_dir.as_deref(), Some("/tmp/project-b"));
        assert_eq!(stored.last_launched_at, Some(20));
        assert_eq!(
            stored.runtime_config.as_deref(),
            Some(r#"{"healthy":true}"#)
        );
        assert_eq!(stored.updated_at, 21);
    }
}
