use std::path::PathBuf;

use crate::database::{AgentInstance, Database, SessionCredentialBinding};
use crate::error::AppError;
use serde::Serialize;

const CREDENTIAL_SERVICE: &str = "StackFerry.AgentInstance";

#[cfg(test)]
static RUNTIME_CONFIG_WRITE_FAILURE: std::sync::atomic::AtomicIsize =
    std::sync::atomic::AtomicIsize::new(-1);

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
    pub runtime_home_exists: bool,
    pub runtime_config_exists: bool,
    pub credential_available: bool,
    pub healthy: bool,
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
        let Some(instance) = db.get_agent_instance(id)? else {
            return Ok(false);
        };
        let entry = credential_entry(&instance.credential_ref)?;
        let api_key = entry.get_password().ok();
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(error) => {
                return Err(AppError::Config(format!(
                    "删除实例凭据失败，数据库未修改: {error}"
                )))
            }
        }
        let quarantined_home = if let Some(home) = instance.runtime_home.as_deref() {
            let home = PathBuf::from(home);
            if home.exists() {
                let quarantine = home.with_extension(format!("deleting-{}", uuid::Uuid::new_v4()));
                if let Err(error) = std::fs::rename(&home, &quarantine) {
                    if let Some(api_key) = api_key.as_deref() {
                        entry.set_password(api_key).map_err(|restore_error| {
                            AppError::Config(format!(
                                "隔离实例目录失败且恢复凭据失败: {error}; {restore_error}"
                            ))
                        })?;
                    }
                    return Err(AppError::io(&home, error));
                }
                Some((home, quarantine))
            } else {
                None
            }
        } else {
            None
        };
        match db.delete_agent_instance(id) {
            Ok(deleted) => {
                if let Some((_, quarantine)) = quarantined_home {
                    if let Err(error) = std::fs::remove_dir_all(&quarantine) {
                        log::warn!("删除实例隔离目录失败 {}: {error}", quarantine.display());
                    }
                }
                Ok(deleted)
            }
            Err(error) => {
                if let Some(api_key) = api_key {
                    let _ = entry.set_password(&api_key);
                }
                if let Some((home, quarantine)) = quarantined_home {
                    let _ = std::fs::rename(quarantine, home);
                }
                Err(error)
            }
        }
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
        let runtime_home = instance.runtime_home.as_deref().map(PathBuf::from);
        let runtime_home_exists = runtime_home.as_ref().is_some_and(|path| path.is_dir());
        let runtime_config_exists = runtime_home
            .as_ref()
            .zip(instance.runtime_config.as_deref())
            .is_some_and(|(home, config)| home.join(config).is_file());
        let credential_available = credential_entry(&instance.credential_ref)?
            .get_password()
            .is_ok();
        Ok(AgentInstanceStatus {
            runtime_home_exists,
            runtime_config_exists,
            credential_available,
            healthy: runtime_home_exists && runtime_config_exists && credential_available,
        })
    }

    #[allow(dead_code)]
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
        session_id: &str,
        provider_id: &str,
    ) -> Result<String, AppError> {
        let binding = db
            .get_session_credential_binding(app_type, session_id, None)?
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
        Self::resolve_api_key(db, &binding.instance_id)
    }
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

#[cfg(test)]
pub(crate) fn fail_runtime_config_write_at(index: isize) {
    RUNTIME_CONFIG_WRITE_FAILURE.store(index, std::sync::atomic::Ordering::SeqCst);
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
    use super::prepare_codex_instance_config;
    use serde_json::json;

    #[test]
    fn codex_instance_config_uses_env_key_without_inline_secret() {
        let config = prepare_codex_instance_config(&json!({
            "config": r#"model_provider = "custom"

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
}
