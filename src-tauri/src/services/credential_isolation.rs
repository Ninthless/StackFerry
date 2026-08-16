use std::path::PathBuf;

use crate::database::{AgentInstance, Database, SessionCredentialBinding};
use crate::error::AppError;

const CREDENTIAL_SERVICE: &str = "StackFerry.AgentInstance";

pub struct CredentialIsolationService;

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
        let codex_home = (app_type == "codex").then(|| codex_home_for_instance(&id));
        if let Some(path) = codex_home.as_ref() {
            std::fs::create_dir_all(path).map_err(|e| AppError::io(path, e))?;
        }
        let codex_config = if app_type == "codex" {
            match prepare_codex_instance_config(&provider.settings_config) {
                Ok(config) => Some(config),
                Err(error) => {
                    if let Some(path) = codex_home.as_ref() {
                        let _ = std::fs::remove_dir_all(path);
                    }
                    return Err(error);
                }
            }
        } else {
            None
        };

        let entry = credential_entry(&credential_ref)?;
        entry
            .set_password(api_key)
            .map_err(|e| AppError::Config(format!("保存实例凭据失败: {e}")))?;
        if let (Some(home), Some(config)) = (codex_home.as_ref(), codex_config.as_ref()) {
            if let Err(error) = crate::config::write_text_file(&home.join("config.toml"), config) {
                let _ = entry.delete_credential();
                let _ = std::fs::remove_dir_all(home);
                return Err(error);
            }
        }

        let instance = AgentInstance {
            id,
            provider_id: provider_id.to_string(),
            app_type: app_type.to_string(),
            name: name.to_string(),
            credential_ref,
            codex_home: codex_home.map(|path| path.to_string_lossy().into_owned()),
            created_at: now,
            updated_at: now,
        };
        if let Err(error) = db.save_agent_instance(&instance) {
            let _ = entry.delete_credential();
            if let Some(path) = instance.codex_home.as_deref() {
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
        let quarantined_home = instance.codex_home.as_deref().and_then(|home| {
            let home = PathBuf::from(home);
            if !home.exists() {
                return None;
            }
            let quarantine = home.with_extension(format!("deleting-{}", uuid::Uuid::new_v4()));
            std::fs::rename(&home, &quarantine)
                .map(|_| (home, quarantine))
                .ok()
        });
        match db.delete_agent_instance(id) {
            Ok(deleted) => {
                if let Some((_, quarantine)) = quarantined_home {
                    std::fs::remove_dir_all(&quarantine)
                        .map_err(|error| AppError::io(&quarantine, error))?;
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

    pub fn refresh_codex_instance_config(db: &Database, instance_id: &str) -> Result<(), AppError> {
        let instance = db
            .get_agent_instance(instance_id)?
            .ok_or_else(|| AppError::InvalidInput(format!("实例 {instance_id} 不存在")))?;
        if instance.app_type != "codex" {
            return Ok(());
        }
        let provider = db
            .get_provider_by_id(&instance.provider_id, "codex")?
            .ok_or_else(|| {
                AppError::InvalidInput(format!("供应商 {} 不存在", instance.provider_id))
            })?;
        let home = instance
            .codex_home
            .map(PathBuf::from)
            .ok_or_else(|| AppError::InvalidInput("Codex 实例缺少 CODEX_HOME".to_string()))?;
        std::fs::create_dir_all(&home).map_err(|error| AppError::io(&home, error))?;
        crate::config::write_text_file(
            &home.join("config.toml"),
            &prepare_codex_instance_config(&provider.settings_config)?,
        )
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

fn codex_home_for_instance(instance_id: &str) -> PathBuf {
    crate::config::get_app_config_dir()
        .join("instances")
        .join("codex")
        .join(instance_id)
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
    provider.remove("auth");
    Ok(document.to_string())
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
        assert!(!config.contains("must-not-survive"));
    }
}
