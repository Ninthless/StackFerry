use std::path::PathBuf;

use crate::database::{
    AgentInstance, Database, ResourceOperation, ResourceOperationUpdate, SessionCredentialBinding,
};
use crate::error::AppError;
use serde::Serialize;

const CREDENTIAL_SERVICE: &str = "StackFerry.AgentInstance";

#[cfg(test)]
static RUNTIME_CONFIG_WRITE_FAILURE: std::sync::atomic::AtomicIsize =
    std::sync::atomic::AtomicIsize::new(-1);
#[cfg(test)]
static DELETE_FAILURES: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

const DELETE_OPERATION: &str = "delete_instance";
const PHASE_RECORDED: &str = "recorded";
const PHASE_QUARANTINED: &str = "quarantined";
const PHASE_DB_DELETED: &str = "db_deleted";
const PHASE_CLEANUP_FAILED: &str = "cleanup_failed";

const FAIL_QUARANTINE: usize = 1;
const FAIL_DB_DELETE: usize = 2;
const FAIL_CREDENTIAL_DELETE: usize = 4;
const FAIL_DIRECTORY_DELETE: usize = 8;
const FAIL_COMPENSATION: usize = 16;

pub struct CredentialIsolationService;

pub(crate) struct RuntimeConfigRefreshBatch {
    entries: Vec<RuntimeConfigRefreshEntry>,
    committed: usize,
}

struct RuntimeConfigRefreshEntry {
    path: PathBuf,
    previous: Option<Vec<u8>>,
    next: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentInstanceStatus {
    pub kind: AgentInstanceStatusKind,
    pub provider_exists: bool,
    pub runtime_home_exists: bool,
    pub runtime_config_exists: bool,
    pub runtime_config_valid: bool,
    pub credential_available: bool,
    pub cleanup_pending: bool,
    pub healthy: bool,
    pub repair_actions: Vec<AgentInstanceRepairAction>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AgentInstanceStatusKind {
    Ready,
    CredentialMissing,
    RuntimeHomeMissing,
    RuntimeConfigMissing,
    RuntimeConfigInvalid,
    ProviderMissing,
    CleanupPending,
    Unknown,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AgentInstanceRepairAction {
    RotateKey,
    RebuildConfig,
}

impl CredentialIsolationService {
    pub fn create_instance(
        db: &Database,
        provider_id: &str,
        app_type: &str,
        name: &str,
        api_key: &str,
    ) -> Result<AgentInstance, AppError> {
        let provider_id = require_value(provider_id, "providerId")?;
        let app_type = require_value(app_type, "appType")?;
        let name = require_value(name, "name")?;
        let api_key = require_value(api_key, "apiKey")?;
        let provider = db
            .get_provider_by_id(provider_id, app_type)?
            .ok_or_else(|| AppError::InvalidInput(format!("供应商 {provider_id} 不存在")))?;
        if provider.uses_managed_account_auth() {
            return Err(AppError::InvalidInput(format!(
                "供应商 {provider_id} 使用托管账号认证，不支持实例 API Key"
            )));
        }

        let id = uuid::Uuid::new_v4().to_string();
        let credential_ref = format!("{app_type}:{provider_id}:{id}");
        let now = unix_timestamp()?;
        if !matches!(app_type, "claude" | "codex") {
            return Err(AppError::InvalidInput(
                "仅 Claude 和 Codex 支持独立运行目录".to_string(),
            ));
        }
        let runtime_home = runtime_home_for_instance(app_type, &id);
        std::fs::create_dir_all(&runtime_home).map_err(|e| AppError::io(&runtime_home, e))?;
        let runtime_config = match prepare_runtime_config(app_type, &provider.settings_config) {
            Ok(config) => config,
            Err(error) => {
                let _ = std::fs::remove_dir_all(&runtime_home);
                return Err(error);
            }
        };
        let runtime_config_name = runtime_config_file_name(app_type);

        let entry = credential_entry(&credential_ref)?;
        entry
            .set_password(api_key)
            .map_err(|e| AppError::Config(format!("保存实例凭据失败: {e}")))?;
        if let Err(error) =
            crate::config::write_text_file(&runtime_home.join(runtime_config_name), &runtime_config)
        {
            let _ = entry.delete_credential();
            let _ = std::fs::remove_dir_all(&runtime_home);
            return Err(error);
        }

        let instance = AgentInstance {
            id,
            provider_id: provider_id.to_string(),
            app_type: app_type.to_string(),
            name: name.to_string(),
            credential_ref,
            codex_home: (app_type == "codex").then(|| runtime_home.to_string_lossy().into_owned()),
            runtime_home: Some(runtime_home.to_string_lossy().into_owned()),
            recent_project_dir: None,
            last_launched_at: None,
            runtime_config: Some(runtime_config_name.to_string()),
            created_at: now,
            updated_at: now,
        };
        if let Err(error) = db.save_agent_instance(&instance) {
            let _ = entry.delete_credential();
            if let Some(path) = instance.runtime_home.as_deref() {
                let _ = std::fs::remove_dir_all(path);
            }
            return Err(error);
        }
        Ok(instance)
    }

    pub fn list_instances(
        db: &Database,
        provider_id: &str,
        app_type: &str,
    ) -> Result<Vec<AgentInstance>, AppError> {
        db.get_agent_instances(provider_id, app_type)
    }

    pub fn delete_instance(db: &Database, id: &str) -> Result<bool, AppError> {
        delete_instance_with_root(db, id, &crate::config::get_app_config_dir())
    }

    pub fn resume_pending_resource_operations(db: &Database) -> Result<(), AppError> {
        resume_pending_resource_operations_with_root(db, &crate::config::get_app_config_dir())
    }

    pub fn rename_instance(db: &Database, id: &str, name: &str) -> Result<AgentInstance, AppError> {
        let name = require_value(name, "name")?;
        if !db.rename_agent_instance(id, name, unix_timestamp()?)? {
            return Err(AppError::InvalidInput(format!("实例 {id} 不存在")));
        }
        db.get_agent_instance(id)?
            .ok_or_else(|| AppError::InvalidInput(format!("实例 {id} 不存在")))
    }

    pub fn replace_api_key(db: &Database, id: &str, api_key: &str) -> Result<(), AppError> {
        let api_key = require_value(api_key, "apiKey")?;
        let instance = db
            .get_agent_instance(id)?
            .ok_or_else(|| AppError::InvalidInput(format!("实例 {id} 不存在")))?;
        let entry = credential_entry(&instance.credential_ref)?;
        let old_api_key = entry.get_password().map_err(|error| match error {
            keyring::Error::NoEntry => {
                AppError::InvalidInput(format!("实例 {id} 未配置旧 API Key，无法安全替换"))
            }
            other => AppError::Config(format!("读取旧实例凭据失败: {other}")),
        })?;
        entry
            .set_password(api_key)
            .map_err(|error| AppError::Config(format!("保存新实例凭据失败: {error}")))?;
        if let Err(error) =
            db.update_agent_instance_runtime(id, None, None, None, unix_timestamp()?)
        {
            entry.set_password(&old_api_key).map_err(|restore_error| {
                AppError::Config(format!(
                    "更新实例失败且恢复旧凭据失败: {error}; {restore_error}"
                ))
            })?;
            return Err(error);
        }
        Ok(())
    }

    pub fn set_recent_project(
        db: &Database,
        id: &str,
        project_dir: Option<&str>,
    ) -> Result<AgentInstance, AppError> {
        let path = project_dir
            .map(|project_dir| {
                let project_dir = require_value(project_dir, "recentProjectDir")?;
                let path = std::fs::canonicalize(project_dir)
                    .map_err(|error| AppError::io(PathBuf::from(project_dir), error))?;
                if !path.is_dir() {
                    return Err(AppError::InvalidInput(format!(
                        "项目目录不是文件夹: {}",
                        path.display()
                    )));
                }
                Ok(path)
            })
            .transpose()?;
        let now = unix_timestamp()?;
        let path_text = path.as_ref().map(|path| path.to_string_lossy());
        if !db.update_agent_instance_runtime(id, Some(path_text.as_deref()), None, None, now)? {
            return Err(AppError::InvalidInput(format!("实例 {id} 不存在")));
        }
        db.get_agent_instance(id)?
            .ok_or_else(|| AppError::InvalidInput(format!("实例 {id} 不存在")))
    }

    pub fn mark_launched(
        db: &Database,
        id: &str,
        project_dir: Option<&str>,
    ) -> Result<(), AppError> {
        let now = unix_timestamp()?;
        if !db.update_agent_instance_runtime(id, project_dir.map(Some), Some(now), None, now)? {
            return Err(AppError::InvalidInput(format!("实例 {id} 不存在")));
        }
        Ok(())
    }

    pub fn status(db: &Database, id: &str) -> Result<AgentInstanceStatus, AppError> {
        let instance = db
            .get_agent_instance(id)?
            .ok_or_else(|| AppError::InvalidInput(format!("实例 {id} 不存在")))?;
        let provider_exists = db
            .get_provider_by_id(&instance.provider_id, &instance.app_type)?
            .is_some();
        let runtime_home = instance
            .runtime_home
            .as_deref()
            .or(instance.codex_home.as_deref())
            .map(PathBuf::from);
        let runtime_home_exists = runtime_home.as_ref().is_some_and(|path| path.is_dir());
        let runtime_config = runtime_home.as_ref().map(|home| {
            home.join(
                instance
                    .runtime_config
                    .as_deref()
                    .unwrap_or_else(|| runtime_config_file_name(&instance.app_type)),
            )
        });
        let runtime_config_exists = runtime_config.as_ref().is_some_and(|path| path.is_file());
        let (runtime_config_valid, runtime_config_check_failed) =
            match runtime_config.as_ref().filter(|_| runtime_config_exists) {
                Some(path) => match std::fs::read_to_string(path) {
                    Ok(content) => (validate_runtime_config(&instance.app_type, &content), false),
                    Err(_) => (false, true),
                },
                None => (false, false),
            };
        let cleanup_pending = runtime_home
            .as_ref()
            .is_some_and(|home| has_pending_runtime_cleanup(home));
        let (credential_available, credential_check_failed) =
            match credential_entry(&instance.credential_ref)
                .and_then(|entry| entry.get_password().map_err(map_credential_read_error))
            {
                Ok(_) => (true, false),
                Err(AppError::InvalidInput(_)) => (false, false),
                Err(_) => (false, true),
            };
        Ok(build_instance_status(
            provider_exists,
            runtime_home_exists,
            runtime_config_exists,
            runtime_config_valid,
            credential_available,
            cleanup_pending,
            credential_check_failed || runtime_config_check_failed,
        ))
    }

    pub fn refresh_instance_config(db: &Database, instance_id: &str) -> Result<(), AppError> {
        let instance = db
            .get_agent_instance(instance_id)?
            .ok_or_else(|| AppError::InvalidInput(format!("实例 {instance_id} 不存在")))?;
        if !matches!(instance.app_type.as_str(), "claude" | "codex") {
            return Ok(());
        }
        let provider = db
            .get_provider_by_id(&instance.provider_id, &instance.app_type)?
            .ok_or_else(|| {
                AppError::InvalidInput(format!("供应商 {} 不存在", instance.provider_id))
            })?;
        let app_type = instance.app_type.clone();
        RuntimeConfigRefreshBatch::prepare_for_instances(
            &app_type,
            &provider.settings_config,
            vec![instance],
        )?
        .commit()
    }

    pub fn resolve_api_key(db: &Database, instance_id: &str) -> Result<String, AppError> {
        let instance = db.get_agent_instance(instance_id)?.ok_or_else(|| {
            AppError::InvalidInput(format!(
                "实例 {instance_id} 不存在，禁止回退到 Provider 凭据"
            ))
        })?;
        credential_entry(&instance.credential_ref)?
            .get_password()
            .map_err(|error| match error {
                keyring::Error::NoEntry => AppError::InvalidInput(format!(
                    "实例 {instance_id} 未配置 API Key，禁止回退到 Provider 凭据"
                )),
                other => AppError::Config(format!("读取实例凭据失败: {other}")),
            })
    }

    pub fn bind_session(
        db: &Database,
        app_type: &str,
        session_id: &str,
        provider_id: &str,
        instance_id: &str,
    ) -> Result<SessionCredentialBinding, AppError> {
        let instance = db.get_agent_instance(instance_id)?.ok_or_else(|| {
            AppError::InvalidInput(format!(
                "实例 {instance_id} 不存在，禁止回退到 Provider 凭据"
            ))
        })?;
        if instance.app_type != app_type || instance.provider_id != provider_id {
            return Err(AppError::InvalidInput(format!(
                "实例 {instance_id} 不属于 {app_type}/{provider_id}"
            )));
        }
        Self::resolve_api_key(db, instance_id)?;
        db.bind_session_credential(
            app_type,
            session_id,
            provider_id,
            instance_id,
            unix_timestamp()?,
        )
    }

    pub fn resolve_session_api_key(
        db: &Database,
        app_type: &str,
        instance_id: &str,
        session_id: &str,
        provider_id: &str,
    ) -> Result<String, AppError> {
        resolve_session_api_key_with(
            db,
            app_type,
            instance_id,
            session_id,
            provider_id,
            Self::resolve_api_key,
        )
    }
}

fn resolve_session_api_key_with<F>(
    db: &Database,
    app_type: &str,
    instance_id: &str,
    session_id: &str,
    provider_id: &str,
    resolve_api_key: F,
) -> Result<String, AppError>
where
    F: FnOnce(&Database, &str) -> Result<String, AppError>,
{
    let binding = db
        .get_session_credential_binding(app_type, session_id, Some(instance_id))?
        .ok_or_else(|| {
            AppError::InvalidInput(format!(
                "会话 {session_id} 未绑定实例凭据，禁止回退到 Provider 凭据"
            ))
        })?;
    if binding.provider_id != provider_id {
        return Err(AppError::InvalidInput(format!(
            "会话 {session_id} 已固定到供应商 {}，禁止故障转移到 {provider_id}",
            binding.provider_id
        )));
    }
    let api_key = resolve_api_key(db, &binding.instance_id)?;
    let now = unix_timestamp()?;
    if !db.mark_session_credential_binding_used(app_type, &binding.instance_id, session_id, now)? {
        return Err(AppError::InvalidInput(format!(
            "会话 {session_id} 的实例凭据绑定已失效，禁止回退到 Provider 凭据"
        )));
    }
    Ok(api_key)
}

impl RuntimeConfigRefreshBatch {
    pub(crate) fn prepare_for_provider(
        db: &Database,
        app_type: &str,
        provider_id: &str,
        settings: &serde_json::Value,
    ) -> Result<Self, AppError> {
        if !matches!(app_type, "claude" | "codex") {
            return Ok(Self {
                entries: Vec::new(),
                committed: 0,
            });
        }
        let instances = db.get_agent_instances(provider_id, app_type)?;
        Self::prepare_for_instances(app_type, settings, instances)
    }

    fn prepare_for_instances(
        app_type: &str,
        settings: &serde_json::Value,
        instances: Vec<AgentInstance>,
    ) -> Result<Self, AppError> {
        let next = prepare_runtime_config(app_type, settings)?;
        let mut entries = Vec::new();
        for instance in instances {
            let home = instance
                .runtime_home
                .or(instance.codex_home)
                .map(PathBuf::from)
                .ok_or_else(|| {
                    AppError::InvalidInput(format!("实例 {} 缺少运行目录", instance.id))
                })?;
            let config_name = instance
                .runtime_config
                .unwrap_or_else(|| runtime_config_file_name(app_type).to_string());
            let path = home.join(config_name);
            let previous = match std::fs::read(&path) {
                Ok(content) => Some(content),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
                Err(error) => return Err(AppError::io(&path, error)),
            };
            entries.push(RuntimeConfigRefreshEntry {
                path,
                previous,
                next: next.clone(),
            });
        }
        Ok(Self {
            entries,
            committed: 0,
        })
    }

    pub(crate) fn commit(mut self) -> Result<(), AppError> {
        for index in 0..self.entries.len() {
            let entry = &self.entries[index];
            #[cfg(test)]
            if RUNTIME_CONFIG_WRITE_FAILURE
                .compare_exchange(
                    index as isize,
                    -1,
                    std::sync::atomic::Ordering::SeqCst,
                    std::sync::atomic::Ordering::SeqCst,
                )
                .is_ok()
            {
                let error = AppError::io(
                    &entry.path,
                    std::io::Error::other("injected runtime config write failure"),
                );
                let rollback_errors = self.rollback_committed();
                return Err(with_rollback_errors(error, rollback_errors));
            }
            if let Err(error) = crate::config::write_text_file(&entry.path, &entry.next) {
                let rollback_errors = self.rollback_committed();
                return Err(with_rollback_errors(error, rollback_errors));
            }
            self.committed += 1;
        }
        Ok(())
    }

    fn rollback_committed(&mut self) -> Vec<String> {
        let mut errors = Vec::new();
        for entry in self.entries[..self.committed].iter().rev() {
            let result = match entry.previous.as_deref() {
                Some(content) => crate::config::atomic_write(&entry.path, content),
                None => match std::fs::remove_file(&entry.path) {
                    Ok(()) => Ok(()),
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
                    Err(error) => Err(AppError::io(&entry.path, error)),
                },
            };
            if let Err(error) = result {
                errors.push(format!("{}: {error}", entry.path.display()));
            }
        }
        self.committed = 0;
        errors
    }
}

fn delete_instance_with_root(
    db: &Database,
    id: &str,
    app_config_dir: &std::path::Path,
) -> Result<bool, AppError> {
    let Some(instance) = db.get_agent_instance(id)? else {
        return Ok(false);
    };
    let original_dir = validate_instance_runtime_dir(
        app_config_dir,
        &instance.app_type,
        &instance.id,
        instance.runtime_home.as_deref(),
    )?;
    let operation_id = uuid::Uuid::new_v4().to_string();
    let quarantine_dir = original_dir
        .as_ref()
        .map(|_| quarantine_dir_for_operation(app_config_dir, &operation_id));
    let now = unix_timestamp()?;
    db.create_resource_operation(&ResourceOperation {
        id: operation_id.clone(),
        operation_type: DELETE_OPERATION.to_string(),
        phase: PHASE_RECORDED.to_string(),
        instance_id: instance.id.clone(),
        provider_id: instance.provider_id.clone(),
        app_type: instance.app_type.clone(),
        credential_ref: instance.credential_ref.clone(),
        original_dir: original_dir
            .as_ref()
            .map(|path| path.to_string_lossy().into_owned()),
        quarantine_dir: quarantine_dir
            .as_ref()
            .map(|path| path.to_string_lossy().into_owned()),
        error: None,
        retry_count: 0,
        created_at: now,
        updated_at: now,
        completed_at: None,
    })?;
    let operation = db
        .get_resource_operation(&operation_id)?
        .ok_or_else(|| AppError::Database(format!("实例资源操作 {operation_id} 未写入")))?;
    match run_resource_operation(db, &operation, app_config_dir) {
        Ok(()) => Ok(true),
        Err(error) => Err(error),
    }
}

fn resume_pending_resource_operations_with_root(
    db: &Database,
    app_config_dir: &std::path::Path,
) -> Result<(), AppError> {
    let mut errors = Vec::new();
    for operation in db.list_pending_resource_operations()? {
        if operation.operation_type != DELETE_OPERATION {
            let error = format!(
                "拒绝恢复未知实例资源操作类型 {}: {}",
                operation.operation_type, operation.id
            );
            record_operation_failure(db, &operation, &operation.phase, &error);
            errors.push(error);
            continue;
        }
        if let Err(error) = run_resource_operation(db, &operation, app_config_dir) {
            errors.push(format!("{}: {error}", operation.id));
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(AppError::Message(format!(
            "恢复未完成实例资源操作失败: {}",
            errors.join("; ")
        )))
    }
}

fn run_resource_operation(
    db: &Database,
    operation: &ResourceOperation,
    app_config_dir: &std::path::Path,
) -> Result<(), AppError> {
    let original_dir = validate_operation_path(
        app_config_dir,
        &operation.app_type,
        &operation.instance_id,
        operation.original_dir.as_deref(),
        false,
    )?;
    let quarantine_dir = validate_operation_path(
        app_config_dir,
        &operation.app_type,
        &operation.instance_id,
        operation.quarantine_dir.as_deref(),
        true,
    )?;
    let db_committed = db.get_agent_instance(&operation.instance_id)?.is_none();
    if !db_committed {
        let quarantined =
            quarantine_runtime_directory(original_dir.as_deref(), quarantine_dir.as_deref())
                .inspect_err(|error| {
                    record_operation_failure(db, operation, PHASE_RECORDED, &error.to_string());
                })?;
        if let Err(error) = db.update_resource_operation(
            &operation.id,
            ResourceOperationUpdate {
                phase: PHASE_QUARANTINED,
                original_dir: None,
                quarantine_dir: None,
                error: None,
                retry_count: operation.retry_count,
                updated_at: unix_timestamp()?,
            },
        ) {
            return Err(compensate_db_failure(
                db,
                operation,
                original_dir.as_deref(),
                quarantined.then_some(quarantine_dir.as_deref()).flatten(),
                error,
            ));
        }
        if should_fail(FAIL_DB_DELETE) {
            let error = AppError::Database("injected instance delete failure".to_string());
            return Err(compensate_db_failure(
                db,
                operation,
                original_dir.as_deref(),
                quarantined.then_some(quarantine_dir.as_deref()).flatten(),
                error,
            ));
        }
        if let Err(error) = db.commit_instance_resource_deletion(
            &operation.id,
            &operation.instance_id,
            unix_timestamp()?,
        ) {
            return Err(compensate_db_failure(
                db,
                operation,
                original_dir.as_deref(),
                quarantined.then_some(quarantine_dir.as_deref()).flatten(),
                error,
            ));
        }
    } else if operation.phase != PHASE_DB_DELETED && operation.phase != PHASE_CLEANUP_FAILED {
        db.update_resource_operation(
            &operation.id,
            ResourceOperationUpdate {
                phase: PHASE_DB_DELETED,
                original_dir: None,
                quarantine_dir: None,
                error: None,
                retry_count: operation.retry_count,
                updated_at: unix_timestamp()?,
            },
        )?;
    }
    if db_committed {
        quarantine_orphan_directory(original_dir.as_deref(), quarantine_dir.as_deref())
            .inspect_err(|error| {
                record_operation_failure(db, operation, PHASE_CLEANUP_FAILED, &error.to_string());
            })?;
    }
    finalize_resource_operation(db, operation, quarantine_dir.as_deref())
}

fn quarantine_orphan_directory(
    original_dir: Option<&std::path::Path>,
    quarantine_dir: Option<&std::path::Path>,
) -> Result<(), AppError> {
    let (Some(original_dir), Some(quarantine_dir)) = (original_dir, quarantine_dir) else {
        return Ok(());
    };
    if !original_dir.exists() {
        return Ok(());
    }
    if quarantine_dir.exists() {
        return Err(AppError::InvalidInput(format!(
            "孤立实例原目录与隔离目录同时存在: {}; {}",
            original_dir.display(),
            quarantine_dir.display()
        )));
    }
    reject_symlink(original_dir)?;
    if let Some(parent) = quarantine_dir.parent() {
        std::fs::create_dir_all(parent).map_err(|error| AppError::io(parent, error))?;
    }
    std::fs::rename(original_dir, quarantine_dir).map_err(|error| AppError::io(original_dir, error))
}

fn quarantine_runtime_directory(
    original_dir: Option<&std::path::Path>,
    quarantine_dir: Option<&std::path::Path>,
) -> Result<bool, AppError> {
    let (Some(original_dir), Some(quarantine_dir)) = (original_dir, quarantine_dir) else {
        return Ok(false);
    };
    if quarantine_dir.exists() {
        if original_dir.exists() {
            return Err(AppError::InvalidInput(format!(
                "实例原目录与隔离目录同时存在: {}; {}",
                original_dir.display(),
                quarantine_dir.display()
            )));
        }
        return Ok(true);
    }
    if !original_dir.exists() {
        return Ok(false);
    }
    reject_symlink(original_dir)?;
    if should_fail(FAIL_QUARANTINE) {
        return Err(AppError::io(
            original_dir,
            std::io::Error::other("injected quarantine failure"),
        ));
    }
    if let Some(parent) = quarantine_dir.parent() {
        std::fs::create_dir_all(parent).map_err(|error| AppError::io(parent, error))?;
    }
    std::fs::rename(original_dir, quarantine_dir)
        .map_err(|error| AppError::io(original_dir, error))?;
    Ok(true)
}

fn compensate_db_failure(
    db: &Database,
    operation: &ResourceOperation,
    original_dir: Option<&std::path::Path>,
    quarantine_dir: Option<&std::path::Path>,
    error: AppError,
) -> AppError {
    let mut errors = vec![error.to_string()];
    if let (Some(original_dir), Some(quarantine_dir)) = (original_dir, quarantine_dir) {
        let compensation = if should_fail(FAIL_COMPENSATION) {
            Err(std::io::Error::other("injected compensation failure"))
        } else if quarantine_dir.exists() && !original_dir.exists() {
            std::fs::rename(quarantine_dir, original_dir)
        } else {
            Ok(())
        };
        if let Err(compensation_error) = compensation {
            errors.push(format!(
                "恢复实例目录失败 {} -> {}: {compensation_error}",
                quarantine_dir.display(),
                original_dir.display()
            ));
        }
    }
    let message = errors.join("; ");
    record_operation_failure(db, operation, PHASE_RECORDED, &message);
    AppError::Message(message)
}

fn finalize_resource_operation(
    db: &Database,
    operation: &ResourceOperation,
    quarantine_dir: Option<&std::path::Path>,
) -> Result<(), AppError> {
    let mut errors = Vec::new();
    if should_fail(FAIL_CREDENTIAL_DELETE) {
        errors.push("删除实例凭据失败: injected credential delete failure".to_string());
    } else {
        match credential_entry(&operation.credential_ref).and_then(|entry| {
            entry.delete_credential().map_err(|error| match error {
                keyring::Error::NoEntry => AppError::Message(String::new()),
                other => AppError::Config(format!("删除实例凭据失败: {other}")),
            })
        }) {
            Ok(()) => {}
            Err(AppError::Message(message)) if message.is_empty() => {}
            Err(error) => errors.push(error.to_string()),
        }
    }
    if let Some(quarantine_dir) = quarantine_dir {
        if quarantine_dir.exists() {
            if let Err(error) = reject_symlink(quarantine_dir) {
                errors.push(error.to_string());
            } else if should_fail(FAIL_DIRECTORY_DELETE) {
                errors.push(format!(
                    "删除实例隔离目录失败 {}: injected directory delete failure",
                    quarantine_dir.display()
                ));
            } else if let Err(error) = std::fs::remove_dir_all(quarantine_dir) {
                errors.push(format!(
                    "删除实例隔离目录失败 {}: {error}",
                    quarantine_dir.display()
                ));
            }
        }
    }
    if errors.is_empty() {
        db.complete_resource_operation(&operation.id, unix_timestamp()?)?;
        Ok(())
    } else {
        let message = errors.join("; ");
        record_operation_failure(db, operation, PHASE_CLEANUP_FAILED, &message);
        Err(AppError::Message(format!(
            "实例数据库已删除，但最终资源清理失败，可重试恢复: {message}"
        )))
    }
}

fn validate_instance_runtime_dir(
    app_config_dir: &std::path::Path,
    app_type: &str,
    instance_id: &str,
    runtime_home: Option<&str>,
) -> Result<Option<PathBuf>, AppError> {
    validate_operation_path(app_config_dir, app_type, instance_id, runtime_home, false)
}

fn validate_operation_path(
    app_config_dir: &std::path::Path,
    app_type: &str,
    instance_id: &str,
    path: Option<&str>,
    quarantine: bool,
) -> Result<Option<PathBuf>, AppError> {
    let Some(path) = path else {
        return Ok(None);
    };
    if path.trim().is_empty()
        || !matches!(app_type, "claude" | "codex")
        || !valid_path_segment(app_type)
        || !valid_path_segment(instance_id)
    {
        return Err(AppError::InvalidInput(
            "实例资源操作包含非法路径标识".to_string(),
        ));
    }
    let root = app_config_dir.join("instances");
    reject_existing_symlink_chain(app_config_dir, &root)?;
    let expected = if quarantine {
        let file_name = std::path::Path::new(path)
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| AppError::InvalidInput("隔离目录名称无效".to_string()))?;
        if !file_name.starts_with(".delete-") || !valid_path_segment(&file_name[8..]) {
            return Err(AppError::InvalidInput(format!("隔离目录不受管理: {path}")));
        }
        root.join(".quarantine").join(file_name)
    } else {
        root.join(app_type).join(instance_id)
    };
    let supplied = PathBuf::from(path);
    if supplied != expected || !supplied.starts_with(&root) {
        return Err(AppError::InvalidInput(format!(
            "实例资源路径越界或不匹配: {}",
            supplied.display()
        )));
    }
    reject_existing_symlink_chain(&root, &supplied)?;
    Ok(Some(supplied))
}

fn quarantine_dir_for_operation(app_config_dir: &std::path::Path, operation_id: &str) -> PathBuf {
    app_config_dir
        .join("instances")
        .join(".quarantine")
        .join(format!(".delete-{operation_id}"))
}

fn valid_path_segment(value: &str) -> bool {
    !value.is_empty()
        && value != "."
        && value != ".."
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
}

fn reject_existing_symlink_chain(
    base: &std::path::Path,
    target: &std::path::Path,
) -> Result<(), AppError> {
    let mut current = PathBuf::from(base);
    if current.exists() {
        reject_symlink(&current)?;
    }
    let relative = target
        .strip_prefix(base)
        .map_err(|_| AppError::InvalidInput(format!("路径越界: {}", target.display())))?;
    for component in relative.components() {
        current.push(component.as_os_str());
        if current.exists() {
            reject_symlink(&current)?;
        }
    }
    Ok(())
}

fn reject_symlink(path: &std::path::Path) -> Result<(), AppError> {
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(AppError::io(path, error)),
    };
    if metadata.file_type().is_symlink() {
        return Err(AppError::InvalidInput(format!(
            "拒绝符号链接实例资源路径: {}",
            path.display()
        )));
    }
    Ok(())
}

fn record_operation_failure(
    db: &Database,
    operation: &ResourceOperation,
    phase: &str,
    error: &str,
) {
    if let Ok(now) = unix_timestamp() {
        let _ = db.record_resource_operation_failure(&operation.id, phase, error, now);
    }
}

#[cfg(test)]
fn should_fail(mask: usize) -> bool {
    DELETE_FAILURES.load(std::sync::atomic::Ordering::SeqCst) & mask != 0
}

#[cfg(not(test))]
fn should_fail(_mask: usize) -> bool {
    false
}

#[cfg(test)]
pub(crate) fn fail_runtime_config_write_at(index: isize) {
    RUNTIME_CONFIG_WRITE_FAILURE.store(index, std::sync::atomic::Ordering::SeqCst);
}

#[cfg(test)]
fn fail_delete_operations(mask: usize) {
    DELETE_FAILURES.store(mask, std::sync::atomic::Ordering::SeqCst);
}

fn with_rollback_errors(error: AppError, rollback_errors: Vec<String>) -> AppError {
    if rollback_errors.is_empty() {
        error
    } else {
        AppError::Message(format!(
            "{error}; rollback failed: {}",
            rollback_errors.join("; ")
        ))
    }
}

fn credential_entry(credential_ref: &str) -> Result<keyring::Entry, AppError> {
    keyring::Entry::new(CREDENTIAL_SERVICE, credential_ref)
        .map_err(|e| AppError::Config(format!("初始化系统凭据存储失败: {e}")))
}

fn map_credential_read_error(error: keyring::Error) -> AppError {
    match error {
        keyring::Error::NoEntry => AppError::InvalidInput("实例凭据不存在".to_string()),
        other => AppError::Config(format!("读取实例凭据失败: {other}")),
    }
}

fn validate_runtime_config(app_type: &str, content: &str) -> bool {
    match app_type {
        "codex" => validate_codex_runtime_config(content),
        "claude" => {
            serde_json::from_str::<serde_json::Value>(content).is_ok_and(|value| value.is_object())
        }
        _ => false,
    }
}

fn validate_codex_runtime_config(content: &str) -> bool {
    let Ok(document) = content.parse::<toml_edit::DocumentMut>() else {
        return false;
    };
    let Some(provider_id) = document
        .get("model_provider")
        .and_then(toml_edit::Item::as_str)
    else {
        return false;
    };
    document
        .get("model_providers")
        .and_then(toml_edit::Item::as_table)
        .and_then(|providers| providers.get(provider_id))
        .and_then(toml_edit::Item::as_table)
        .and_then(|provider| provider.get("env_key"))
        .and_then(toml_edit::Item::as_str)
        == Some("STACKFERRY_INSTANCE_API_KEY")
}

fn has_pending_runtime_cleanup(runtime_home: &std::path::Path) -> bool {
    let Some(parent) = runtime_home.parent() else {
        return false;
    };
    let Some(name) = runtime_home.file_name().and_then(|name| name.to_str()) else {
        return false;
    };
    let prefix = format!("{name}.deleting-");
    std::fs::read_dir(parent).is_ok_and(|entries| {
        entries.filter_map(Result::ok).any(|entry| {
            entry
                .file_name()
                .to_str()
                .is_some_and(|candidate| candidate.starts_with(&prefix))
        })
    })
}

fn build_instance_status(
    provider_exists: bool,
    runtime_home_exists: bool,
    runtime_config_exists: bool,
    runtime_config_valid: bool,
    credential_available: bool,
    cleanup_pending: bool,
    check_failed: bool,
) -> AgentInstanceStatus {
    let kind = if check_failed {
        AgentInstanceStatusKind::Unknown
    } else if cleanup_pending {
        AgentInstanceStatusKind::CleanupPending
    } else if !provider_exists {
        AgentInstanceStatusKind::ProviderMissing
    } else if !runtime_home_exists {
        AgentInstanceStatusKind::RuntimeHomeMissing
    } else if !runtime_config_exists {
        AgentInstanceStatusKind::RuntimeConfigMissing
    } else if !runtime_config_valid {
        AgentInstanceStatusKind::RuntimeConfigInvalid
    } else if !credential_available {
        AgentInstanceStatusKind::CredentialMissing
    } else {
        AgentInstanceStatusKind::Ready
    };
    let mut repair_actions = Vec::new();
    if !credential_available && !check_failed && !cleanup_pending {
        repair_actions.push(AgentInstanceRepairAction::RotateKey);
    }
    if provider_exists
        && !check_failed
        && !cleanup_pending
        && (!runtime_home_exists || !runtime_config_exists || !runtime_config_valid)
    {
        repair_actions.push(AgentInstanceRepairAction::RebuildConfig);
    }
    AgentInstanceStatus {
        kind,
        provider_exists,
        runtime_home_exists,
        runtime_config_exists,
        runtime_config_valid,
        credential_available,
        cleanup_pending,
        healthy: kind == AgentInstanceStatusKind::Ready,
        repair_actions,
    }
}

fn require_value<'a>(value: &'a str, field: &str) -> Result<&'a str, AppError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(AppError::InvalidInput(format!("{field} 不能为空")));
    }
    Ok(value)
}

fn unix_timestamp() -> Result<i64, AppError> {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .map_err(|error| AppError::Message(format!("读取系统时间失败: {error}")))
}

fn runtime_home_for_instance(app_type: &str, instance_id: &str) -> PathBuf {
    crate::config::get_app_config_dir()
        .join("instances")
        .join(app_type)
        .join(instance_id)
}

fn runtime_config_file_name(app_type: &str) -> &'static str {
    if app_type == "codex" {
        "config.toml"
    } else {
        "settings.json"
    }
}

fn prepare_runtime_config(
    app_type: &str,
    settings: &serde_json::Value,
) -> Result<String, AppError> {
    if app_type == "codex" {
        prepare_codex_instance_config(settings)
    } else {
        prepare_claude_instance_config(settings)
    }
}

fn prepare_claude_instance_config(settings: &serde_json::Value) -> Result<String, AppError> {
    let mut config = settings.clone();
    if let Some(env) = config
        .get_mut("env")
        .and_then(serde_json::Value::as_object_mut)
    {
        for key in [
            "ANTHROPIC_API_KEY",
            "ANTHROPIC_AUTH_TOKEN",
            "CLAUDE_CODE_OAUTH_TOKEN",
        ] {
            env.remove(key);
        }
    }
    serde_json::to_string_pretty(&config)
        .map_err(|error| AppError::Config(format!("序列化 Claude 实例配置失败: {error}")))
}

fn prepare_codex_instance_config(settings: &serde_json::Value) -> Result<String, AppError> {
    let config = settings
        .get("config")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| AppError::InvalidInput("Codex Provider 缺少 config.toml".to_string()))?;
    let config = crate::codex_config::remove_codex_experimental_bearer_token_if(config, |_| true)?;
    let mut document = config
        .parse::<toml_edit::DocumentMut>()
        .map_err(|error| AppError::Message(format!("Invalid Codex config.toml: {error}")))?;
    document.remove("model_catalog_json");
    let provider_id = document
        .get("model_provider")
        .and_then(toml_edit::Item::as_str)
        .ok_or_else(|| AppError::InvalidInput("Codex config.toml 缺少 model_provider".to_string()))?
        .to_string();
    let provider = document
        .get_mut("model_providers")
        .and_then(toml_edit::Item::as_table_mut)
        .and_then(|providers| providers.get_mut(&provider_id))
        .and_then(toml_edit::Item::as_table_mut)
        .ok_or_else(|| {
            AppError::InvalidInput(format!(
                "Codex config.toml 缺少 model_providers.{provider_id}"
            ))
        })?;
    provider["requires_openai_auth"] = toml_edit::value(false);
    provider["env_key"] = toml_edit::value("STACKFERRY_INSTANCE_API_KEY");
    let base_url = provider
        .get("base_url")
        .and_then(toml_edit::Item::as_str)
        .unwrap_or_default()
        .to_string();
    if let Some(env_http_headers) = provider
        .get_mut("env_http_headers")
        .and_then(toml_edit::Item::as_table_mut)
    {
        let private_headers = env_http_headers
            .iter()
            .filter(|(name, _)| name.to_ascii_lowercase().starts_with("x-stackferry-"))
            .map(|(name, _)| name.to_string())
            .collect::<Vec<_>>();
        for name in private_headers {
            env_http_headers.remove(&name);
        }
    }
    if is_loopback_stackferry_endpoint(&base_url) {
        let env_http_headers = provider
            .entry("env_http_headers")
            .or_insert(toml_edit::Item::Table(toml_edit::Table::new()))
            .as_table_mut()
            .ok_or_else(|| {
                AppError::InvalidInput(format!(
                    "Codex model_providers.{provider_id}.env_http_headers 必须是表"
                ))
            })?;
        env_http_headers["x-stackferry-instance-id"] = toml_edit::value("STACKFERRY_INSTANCE_ID");
    }
    provider.remove("auth");
    Ok(document.to_string())
}

fn is_loopback_stackferry_endpoint(base_url: &str) -> bool {
    let Ok(url) = url::Url::parse(base_url) else {
        return false;
    };
    let Some(host) = url.host_str() else {
        return false;
    };
    host.eq_ignore_ascii_case("localhost")
        || host
            .parse::<std::net::IpAddr>()
            .is_ok_and(|address| address.is_loopback())
}

#[cfg(test)]
mod tests {
    use super::{
        build_instance_status, delete_instance_with_root, fail_delete_operations,
        prepare_codex_instance_config, resolve_session_api_key_with, validate_operation_path,
        validate_runtime_config, AgentInstanceRepairAction, AgentInstanceStatusKind,
        FAIL_CREDENTIAL_DELETE, FAIL_DB_DELETE,
    };
    use crate::database::{AgentInstance, Database};
    use crate::error::AppError;
    use crate::provider::Provider;
    use serde_json::json;
    use serial_test::serial;
    use tempfile::TempDir;

    fn seed_instance(db: &Database, app_type: &str, instance_id: &str, provider_id: &str) {
        db.save_provider(
            app_type,
            &Provider::with_id(
                provider_id.to_string(),
                provider_id.to_string(),
                json!({}),
                None,
            ),
        )
        .expect("seed provider");
        db.save_agent_instance(&AgentInstance {
            id: instance_id.to_string(),
            provider_id: provider_id.to_string(),
            app_type: app_type.to_string(),
            name: instance_id.to_string(),
            credential_ref: format!("credential:{instance_id}"),
            codex_home: None,
            runtime_home: None,
            recent_project_dir: None,
            last_launched_at: None,
            runtime_config: None,
            created_at: 1,
            updated_at: 1,
        })
        .expect("seed instance");
    }

    #[test]
    fn managed_resource_paths_reject_escape_and_mismatch() {
        let root = TempDir::new().expect("temp root");
        let managed = root
            .path()
            .join("instances")
            .join("codex")
            .join("instance-a");
        std::fs::create_dir_all(&managed).expect("create managed path");

        assert_eq!(
            validate_operation_path(root.path(), "codex", "instance-a", managed.to_str(), false,)
                .expect("managed path"),
            Some(managed)
        );
        assert!(validate_operation_path(
            root.path(),
            "codex",
            "instance-a",
            root.path().join("outside").to_str(),
            false,
        )
        .is_err());
        assert!(validate_operation_path(
            root.path(),
            "codex",
            "../escape",
            root.path().join("instances").join("escape").to_str(),
            false,
        )
        .is_err());
    }

    #[test]
    #[serial]
    fn database_failure_restores_quarantined_directory_and_retains_operation() {
        let root = TempDir::new().expect("temp root");
        let db = Database::memory().expect("memory db");
        seed_instance(&db, "codex", "instance-a", "provider-a");
        let runtime_home = root
            .path()
            .join("instances")
            .join("codex")
            .join("instance-a");
        std::fs::create_dir_all(&runtime_home).expect("create runtime home");
        let mut instance = db
            .get_agent_instance("instance-a")
            .expect("read instance")
            .expect("instance");
        instance.runtime_home = Some(runtime_home.to_string_lossy().into_owned());
        db.save_agent_instance(&instance)
            .expect("save runtime home");

        fail_delete_operations(FAIL_DB_DELETE);
        let error =
            delete_instance_with_root(&db, "instance-a", root.path()).expect_err("delete fails");
        fail_delete_operations(0);

        assert!(error
            .to_string()
            .contains("injected instance delete failure"));
        assert!(runtime_home.is_dir());
        assert!(db
            .get_agent_instance("instance-a")
            .expect("read instance")
            .is_some());
        let pending = db
            .list_pending_resource_operations()
            .expect("list pending operations");
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].phase, "recorded");
        assert_eq!(pending[0].retry_count, 1);
    }

    #[test]
    #[serial]
    fn post_commit_cleanup_failure_retains_retryable_operation() {
        let root = TempDir::new().expect("temp root");
        let db = Database::memory().expect("memory db");
        seed_instance(&db, "codex", "instance-a", "provider-a");
        let runtime_home = root
            .path()
            .join("instances")
            .join("codex")
            .join("instance-a");
        std::fs::create_dir_all(&runtime_home).expect("create runtime home");
        let mut instance = db
            .get_agent_instance("instance-a")
            .expect("read instance")
            .expect("instance");
        instance.runtime_home = Some(runtime_home.to_string_lossy().into_owned());
        db.save_agent_instance(&instance)
            .expect("save runtime home");

        fail_delete_operations(FAIL_CREDENTIAL_DELETE);
        let error =
            delete_instance_with_root(&db, "instance-a", root.path()).expect_err("cleanup fails");
        fail_delete_operations(0);

        assert!(error.to_string().contains("数据库已删除"));
        assert!(db
            .get_agent_instance("instance-a")
            .expect("read instance")
            .is_none());
        let pending = db
            .list_pending_resource_operations()
            .expect("list pending operations");
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].phase, "cleanup_failed");
        assert_eq!(pending[0].retry_count, 1);
    }

    #[cfg(unix)]
    #[test]
    fn managed_resource_paths_reject_symlinks() {
        use std::os::unix::fs::symlink;

        let root = TempDir::new().expect("temp root");
        let outside = TempDir::new().expect("outside");
        let app_root = root.path().join("instances").join("codex");
        std::fs::create_dir_all(&app_root).expect("create app root");
        let linked = app_root.join("instance-a");
        symlink(outside.path(), &linked).expect("create symlink");

        assert!(validate_operation_path(
            root.path(),
            "codex",
            "instance-a",
            linked.to_str(),
            false,
        )
        .is_err());
    }

    #[test]
    fn session_api_key_resolution_is_scoped_by_instance_and_marks_exact_binding_used() {
        let db = Database::memory().expect("memory db");
        seed_instance(&db, "codex", "instance-a", "provider-a");
        seed_instance(&db, "codex", "instance-b", "provider-b");
        db.bind_session_credential("codex", "shared-session", "provider-a", "instance-a", 1)
            .expect("bind first");
        db.bind_session_credential("codex", "shared-session", "provider-b", "instance-b", 2)
            .expect("bind second");

        let api_key = resolve_session_api_key_with(
            &db,
            "codex",
            "instance-b",
            "shared-session",
            "provider-b",
            |_, instance_id| Ok(format!("key:{instance_id}")),
        )
        .expect("resolve scoped key");

        assert_eq!(api_key, "key:instance-b");
        let first = db
            .get_session_credential_binding("codex", "shared-session", Some("instance-a"))
            .expect("read first")
            .expect("first binding");
        let second = db
            .get_session_credential_binding("codex", "shared-session", Some("instance-b"))
            .expect("read second")
            .expect("second binding");
        assert_eq!(first.last_used_at, 1);
        assert!(second.last_used_at > 2);
    }

    #[test]
    fn session_api_key_conflict_does_not_mark_binding_used() {
        let db = Database::memory().expect("memory db");
        seed_instance(&db, "codex", "instance-a", "provider-a");
        seed_instance(&db, "codex", "instance-b", "provider-b");
        db.bind_session_credential("codex", "shared-session", "provider-a", "instance-a", 1)
            .expect("bind first");
        db.bind_session_credential("codex", "shared-session", "provider-b", "instance-b", 2)
            .expect("bind second");

        let error = resolve_session_api_key_with(
            &db,
            "codex",
            "instance-b",
            "shared-session",
            "provider-a",
            |_, _| panic!("credential resolver must not run"),
        )
        .expect_err("provider conflict");

        assert!(error.to_string().contains("禁止故障转移"));
        let binding = db
            .get_session_credential_binding("codex", "shared-session", Some("instance-b"))
            .expect("read binding")
            .expect("binding");
        assert_eq!(binding.last_used_at, 2);
    }

    #[test]
    fn missing_session_api_key_does_not_mark_binding_used() {
        let db = Database::memory().expect("memory db");
        seed_instance(&db, "codex", "instance-a", "provider-a");
        db.bind_session_credential("codex", "session-1", "provider-a", "instance-a", 1)
            .expect("bind session");

        let error = resolve_session_api_key_with(
            &db,
            "codex",
            "instance-a",
            "session-1",
            "provider-a",
            |_, _| Err(AppError::InvalidInput("missing key".to_string())),
        )
        .expect_err("missing key");

        assert!(error.to_string().contains("missing key"));
        let binding = db
            .get_session_credential_binding("codex", "session-1", Some("instance-a"))
            .expect("read binding")
            .expect("binding");
        assert_eq!(binding.last_used_at, 1);
    }

    #[test]
    fn codex_instance_config_uses_env_key_without_inline_secret() {
        let config = prepare_codex_instance_config(&json!({
            "config": r#"model_provider = "custom"
model_catalog_json = "must-not-survive.json"

[model_providers.custom]
name = "Relay"
base_url = "https://relay.example/v1"
wire_api = "responses"
requires_openai_auth = true
experimental_bearer_token = "must-not-survive"
"#
        }))
        .expect("prepare config");
        let parsed: toml::Value = toml::from_str(&config).expect("parse config");
        let provider = &parsed["model_providers"]["custom"];
        assert_eq!(
            provider["env_key"].as_str(),
            Some("STACKFERRY_INSTANCE_API_KEY")
        );
        assert_eq!(provider["requires_openai_auth"].as_bool(), Some(false));
        assert!(provider.get("experimental_bearer_token").is_none());
        assert!(provider.get("env_http_headers").is_none());
        assert!(parsed.get("model_catalog_json").is_none());
        assert!(!config.contains("must-not-survive"));
    }

    #[test]
    fn codex_instance_config_injects_identity_for_loopback_provider() {
        let config = prepare_codex_instance_config(&json!({
            "config": r#"model_provider = "custom"

[model_providers.custom]
name = "StackFerry"
base_url = "http://127.0.0.1:15721/v1"
wire_api = "responses"
"#
        }))
        .expect("prepare config");
        let parsed: toml::Value = toml::from_str(&config).expect("parse config");

        assert_eq!(
            parsed["model_providers"]["custom"]["env_http_headers"]["x-stackferry-instance-id"]
                .as_str(),
            Some("STACKFERRY_INSTANCE_ID")
        );
    }

    #[test]
    fn runtime_config_validation_requires_codex_instance_env_key() {
        assert!(validate_runtime_config(
            "codex",
            r#"model_provider = "custom"

[model_providers.custom]
env_key = "STACKFERRY_INSTANCE_API_KEY"
"#
        ));
        assert!(!validate_runtime_config(
            "codex",
            r#"model_provider = "custom"

[model_providers.custom]
env_key = "OPENAI_API_KEY"
"#
        ));
        assert!(!validate_runtime_config("codex", "not = [valid"));
    }

    #[test]
    fn runtime_config_validation_parses_claude_json() {
        assert!(validate_runtime_config("claude", r#"{"env":{}}"#));
        assert!(!validate_runtime_config("claude", r#"["unexpected"]"#));
        assert!(!validate_runtime_config("claude", "{ invalid"));
    }

    #[test]
    fn status_reports_config_repair_without_exposing_credentials() {
        let status = build_instance_status(true, true, true, false, true, false, false);

        assert_eq!(status.kind, AgentInstanceStatusKind::RuntimeConfigInvalid);
        assert!(!status.healthy);
        assert_eq!(
            status.repair_actions,
            vec![AgentInstanceRepairAction::RebuildConfig]
        );
        let value = serde_json::to_value(status).expect("serialize status");
        assert_eq!(value["kind"], "runtimeConfigInvalid");
        assert!(value.get("apiKey").is_none());
        assert!(value.get("credentialRef").is_none());
    }

    #[test]
    fn status_reports_all_applicable_repair_actions() {
        let status = build_instance_status(true, false, false, false, false, false, false);

        assert_eq!(status.kind, AgentInstanceStatusKind::RuntimeHomeMissing);
        assert_eq!(
            status.repair_actions,
            vec![
                AgentInstanceRepairAction::RotateKey,
                AgentInstanceRepairAction::RebuildConfig
            ]
        );
    }

    #[test]
    fn provider_missing_precedes_local_runtime_failures() {
        let status = build_instance_status(false, false, false, false, true, false, false);

        assert_eq!(status.kind, AgentInstanceStatusKind::ProviderMissing);
        assert!(status.repair_actions.is_empty());
    }

    #[test]
    fn credential_store_failure_is_unknown() {
        let status = build_instance_status(true, true, true, true, false, false, true);

        assert_eq!(status.kind, AgentInstanceStatusKind::Unknown);
        assert!(status.repair_actions.is_empty());
    }

    #[test]
    fn cleanup_pending_suppresses_conflicting_repairs() {
        let status = build_instance_status(true, false, false, false, false, true, false);

        assert_eq!(status.kind, AgentInstanceStatusKind::CleanupPending);
        assert!(status.repair_actions.is_empty());
    }
}
