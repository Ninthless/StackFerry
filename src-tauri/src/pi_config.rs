use crate::config::write_json_file;
use crate::error::AppError;
use serde_json::{json, Map, Value};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

const SUPPORTED_APIS: [&str; 4] = [
    "openai-completions",
    "openai-responses",
    "anthropic-messages",
    "google-generative-ai",
];
const USER_AGENT_HEADER: &str = "User-Agent";
const STACKFERRY_USER_AGENT: &str = "StackFerry";

fn pi_write_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

struct AuthLock {
    path: PathBuf,
}

impl AuthLock {
    fn acquire(auth_path: &Path) -> Result<Self, AppError> {
        let parent = auth_path
            .parent()
            .ok_or_else(|| AppError::Config("Invalid Pi auth path".to_string()))?;
        fs::create_dir_all(parent).map_err(|error| AppError::io(parent, error))?;
        let path = PathBuf::from(format!("{}.lock", auth_path.display()));
        fs::create_dir(&path).map_err(|error| {
            if error.kind() == std::io::ErrorKind::AlreadyExists {
                AppError::Message(
                    "Pi credentials are being updated by another process. Try again shortly."
                        .to_string(),
                )
            } else {
                AppError::io(&path, error)
            }
        })?;
        Ok(Self { path })
    }
}

impl Drop for AuthLock {
    fn drop(&mut self) {
        let _ = fs::remove_dir(&self.path);
    }
}

pub fn get_pi_dir() -> PathBuf {
    if let Some(path) = crate::settings::get_pi_override_dir() {
        return path;
    }
    if let Some(path) = std::env::var_os("PI_CODING_AGENT_DIR").filter(|value| !value.is_empty()) {
        return PathBuf::from(path);
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".pi")
        .join("agent")
}

pub fn get_models_path() -> PathBuf {
    get_pi_dir().join("models.json")
}

pub fn get_settings_path() -> PathBuf {
    get_pi_dir().join("settings.json")
}

pub fn get_sessions_dir() -> PathBuf {
    if let Some(path) =
        std::env::var_os("PI_CODING_AGENT_SESSION_DIR").filter(|value| !value.is_empty())
    {
        return PathBuf::from(path);
    }
    let pi_dir = get_pi_dir();
    let configured = fs::read_to_string(pi_dir.join("settings.json"))
        .ok()
        .and_then(|content| serde_json::from_str::<Value>(&content).ok())
        .and_then(|settings| {
            settings
                .get("sessionDir")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        });
    let Some(configured) = configured else {
        return pi_dir.join("sessions");
    };
    if configured == "~" {
        return dirs::home_dir().unwrap_or(pi_dir);
    }
    if let Some(relative) = configured
        .strip_prefix("~/")
        .or_else(|| configured.strip_prefix("~\\"))
    {
        return dirs::home_dir()
            .unwrap_or_else(|| pi_dir.clone())
            .join(relative);
    }
    let path = PathBuf::from(configured);
    if path.is_absolute() {
        path
    } else {
        pi_dir.join(path)
    }
}

fn read_object(path: &Path) -> Result<Map<String, Value>, AppError> {
    if !path.exists() {
        return Ok(Map::new());
    }
    let content = fs::read_to_string(path).map_err(|error| AppError::io(path, error))?;
    let value: Value = serde_json::from_str(&content).map_err(|error| {
        AppError::Config(format!("Invalid Pi JSON at {}: {error}", path.display()))
    })?;
    value.as_object().cloned().ok_or_else(|| {
        AppError::Config(format!(
            "Pi configuration at {} must be a JSON object",
            path.display()
        ))
    })
}

fn ensure_user_agent(provider: &mut Map<String, Value>) -> Result<bool, AppError> {
    let headers = provider
        .entry("headers".to_string())
        .or_insert_with(|| Value::Object(Map::new()))
        .as_object_mut()
        .ok_or_else(|| AppError::Config("Pi provider headers must be an object".to_string()))?;
    if headers
        .keys()
        .any(|name| name.eq_ignore_ascii_case(USER_AGENT_HEADER))
    {
        return Ok(false);
    }
    headers.insert(
        USER_AGENT_HEADER.to_string(),
        Value::String(STACKFERRY_USER_AGENT.to_string()),
    );
    Ok(true)
}

pub(crate) fn normalize_provider(settings: &mut Value) -> Result<(), AppError> {
    let provider = settings.as_object_mut().ok_or_else(|| {
        AppError::Config("Pi provider configuration must be an object".to_string())
    })?;
    ensure_user_agent(provider)?;
    Ok(())
}

fn provider_fragment(settings: &Value) -> Result<Map<String, Value>, AppError> {
    let mut fragment = settings.as_object().cloned().ok_or_else(|| {
        AppError::Config("Pi provider configuration must be an object".to_string())
    })?;

    let base_url = fragment
        .get("baseUrl")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::Config("Pi provider baseUrl is required".to_string()))?;
    let parsed_url = url::Url::parse(base_url)
        .map_err(|_| AppError::Config("Pi provider baseUrl is invalid".to_string()))?;
    if !matches!(parsed_url.scheme(), "http" | "https") {
        return Err(AppError::Config(
            "Pi provider baseUrl must use HTTP or HTTPS".to_string(),
        ));
    }
    fragment.insert("baseUrl".to_string(), Value::String(base_url.to_string()));

    let api = fragment
        .get("api")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| SUPPORTED_APIS.contains(value))
        .ok_or_else(|| AppError::Config("Pi provider api is not supported".to_string()))?;
    fragment.insert("api".to_string(), Value::String(api.to_string()));

    let models = fragment
        .get("models")
        .and_then(Value::as_array)
        .filter(|models| !models.is_empty())
        .ok_or_else(|| AppError::Config("Pi provider requires at least one model".to_string()))?;
    let mut model_ids = HashSet::with_capacity(models.len());
    for model in models {
        let model = model
            .as_object()
            .ok_or_else(|| AppError::Config("Every Pi model must be an object".to_string()))?;
        let id = model
            .get("id")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|id| !id.is_empty())
            .ok_or_else(|| {
                AppError::Config("Every Pi model requires a non-empty id".to_string())
            })?;
        if !model_ids.insert(id) {
            return Err(AppError::Config(format!(
                "Pi model id '{id}' is duplicated"
            )));
        }
        if model.get("name").is_some_and(|value| !value.is_string()) {
            return Err(AppError::Config(format!(
                "Pi model '{id}' name must be a string"
            )));
        }
        if model
            .get("reasoning")
            .is_some_and(|value| !value.is_boolean())
        {
            return Err(AppError::Config(format!(
                "Pi model '{id}' reasoning must be a boolean"
            )));
        }
        if let Some(input) = model.get("input") {
            let input = input.as_array().ok_or_else(|| {
                AppError::Config(format!("Pi model '{id}' input must be an array"))
            })?;
            if input
                .iter()
                .any(|value| !matches!(value.as_str(), Some("text") | Some("image")))
            {
                return Err(AppError::Config(format!(
                    "Pi model '{id}' input only supports text and image"
                )));
            }
        }
        for field in ["contextWindow", "maxTokens"] {
            if model
                .get(field)
                .is_some_and(|value| value.as_u64().is_none_or(|number| number == 0))
            {
                return Err(AppError::Config(format!(
                    "Pi model '{id}' {field} must be a positive integer"
                )));
            }
        }
    }

    if fragment
        .get("authHeader")
        .is_some_and(|value| !value.is_boolean())
    {
        return Err(AppError::Config(
            "Pi provider authHeader must be a boolean".to_string(),
        ));
    }
    if fragment
        .get("compat")
        .is_some_and(|value| !value.is_object())
    {
        return Err(AppError::Config(
            "Pi provider compat must be an object".to_string(),
        ));
    }
    ensure_user_agent(&mut fragment)?;

    fragment.remove("apiKey");
    fragment.remove("defaultModel");
    fragment.remove("providerKey");
    Ok(fragment)
}

pub(crate) fn validate_provider(settings: &Value) -> Result<(), AppError> {
    provider_fragment(settings)?;
    default_model(settings)?;
    if let Some(api_key) = settings.get("apiKey") {
        if !api_key.is_string() {
            return Err(AppError::Config(
                "Pi provider apiKey must be a string".to_string(),
            ));
        }
    }
    Ok(())
}

fn default_model(settings: &Value) -> Result<String, AppError> {
    let models = settings
        .get("models")
        .and_then(Value::as_array)
        .ok_or_else(|| AppError::Config("Pi provider requires at least one model".to_string()))?;
    let model = if let Some(model) = settings
        .get("defaultModel")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|model| !model.is_empty())
    {
        model
    } else {
        models
            .first()
            .and_then(|model| model.get("id"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|model| !model.is_empty())
            .ok_or_else(|| AppError::Config("Pi provider requires a default model".to_string()))?
    };
    if !models.iter().any(|entry| {
        entry
            .get("id")
            .and_then(Value::as_str)
            .is_some_and(|id| id.trim() == model)
    }) {
        return Err(AppError::Config(format!(
            "Pi default model '{model}' is not present in the model list"
        )));
    }
    Ok(model.to_string())
}

fn api_key_credential(value: &Value) -> Option<Value> {
    value
        .get("apiKey")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|key| !key.is_empty())
        .map(|key| json!({ "type": "api_key", "key": key }))
}

fn is_api_key_credential(value: &Value) -> bool {
    value.get("type").and_then(Value::as_str) == Some("api_key")
}

fn providers_mut(root: &mut Map<String, Value>) -> Result<&mut Map<String, Value>, AppError> {
    let providers = root
        .entry("providers".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    providers
        .as_object_mut()
        .ok_or_else(|| AppError::Config("Pi models.json providers must be an object".to_string()))
}

fn apply_provider_in_dir(dir: &Path, id: &str, settings: &Value) -> Result<(), AppError> {
    let id = id.trim();
    if id.is_empty() {
        return Err(AppError::Config("Pi provider key is required".to_string()));
    }
    let fragment = provider_fragment(settings)?;
    let models_path = dir.join("models.json");
    let auth_path = dir.join("auth.json");
    let _auth_lock = AuthLock::acquire(&auth_path)?;
    let mut models_root = read_object(&models_path)?;
    let mut auth_root = read_object(&auth_path)?;
    providers_mut(&mut models_root)?.insert(id.to_string(), Value::Object(fragment));

    if settings.get("apiKey").is_some() {
        if let Some(credential) = api_key_credential(settings) {
            auth_root.insert(id.to_string(), credential);
        } else if auth_root.get(id).is_some_and(is_api_key_credential) {
            auth_root.remove(id);
        }
    }

    write_json_file(&models_path, &Value::Object(models_root))?;
    write_json_file(&auth_path, &Value::Object(auth_root))
}

pub fn set_provider(id: &str, settings: &Value) -> Result<(), AppError> {
    let _guard = pi_write_lock()
        .lock()
        .map_err(|_| AppError::Message("Pi configuration lock is poisoned".to_string()))?;
    apply_provider_in_dir(&get_pi_dir(), id, settings)
}

fn migrate_provider_user_agents_in_dir(dir: &Path) -> Result<usize, AppError> {
    let models_path = dir.join("models.json");
    if !models_path.exists() {
        return Ok(0);
    }
    let mut models_root = read_object(&models_path)?;
    let Some(providers) = models_root
        .get_mut("providers")
        .and_then(Value::as_object_mut)
    else {
        return Ok(0);
    };
    let mut changed = 0;
    for provider in providers.values_mut().filter_map(Value::as_object_mut) {
        if ensure_user_agent(provider).unwrap_or(false) {
            changed += 1;
        }
    }
    if changed > 0 {
        write_json_file(&models_path, &Value::Object(models_root))?;
    }
    Ok(changed)
}

pub fn migrate_provider_user_agents() -> Result<usize, AppError> {
    let _guard = pi_write_lock()
        .lock()
        .map_err(|_| AppError::Message("Pi configuration lock is poisoned".to_string()))?;
    migrate_provider_user_agents_in_dir(&get_pi_dir())
}

fn remove_provider_in_dir(dir: &Path, id: &str) -> Result<(), AppError> {
    let models_path = dir.join("models.json");
    let auth_path = dir.join("auth.json");
    let settings_path = dir.join("settings.json");
    let _auth_lock = AuthLock::acquire(&auth_path)?;
    let mut models_root = read_object(&models_path)?;
    let mut auth_root = read_object(&auth_path)?;
    let mut settings_root = read_object(&settings_path)?;

    if let Some(providers) = models_root
        .get_mut("providers")
        .and_then(Value::as_object_mut)
    {
        providers.remove(id);
    }
    if auth_root.get(id).is_some_and(is_api_key_credential) {
        auth_root.remove(id);
    }
    if settings_root.get("defaultProvider").and_then(Value::as_str) == Some(id) {
        settings_root.remove("defaultProvider");
        settings_root.remove("defaultModel");
    }

    write_json_file(&models_path, &Value::Object(models_root))?;
    write_json_file(&auth_path, &Value::Object(auth_root))?;
    write_json_file(&settings_path, &Value::Object(settings_root))
}

pub fn remove_provider(id: &str) -> Result<(), AppError> {
    let _guard = pi_write_lock()
        .lock()
        .map_err(|_| AppError::Message("Pi configuration lock is poisoned".to_string()))?;
    remove_provider_in_dir(&get_pi_dir(), id)
}

fn apply_switch_defaults_in_dir(dir: &Path, id: &str, provider: &Value) -> Result<(), AppError> {
    let models_path = dir.join("models.json");
    let settings_path = dir.join("settings.json");
    let models_root = read_object(&models_path)?;
    let exists = models_root
        .get("providers")
        .and_then(Value::as_object)
        .is_some_and(|providers| providers.contains_key(id));
    if !exists {
        return Err(AppError::Config(format!(
            "Pi provider '{id}' is not present in models.json"
        )));
    }

    let mut settings_root = read_object(&settings_path)?;
    settings_root.insert("defaultProvider".to_string(), Value::String(id.to_string()));
    settings_root.insert(
        "defaultModel".to_string(),
        Value::String(default_model(provider)?),
    );
    write_json_file(&settings_path, &Value::Object(settings_root))
}

pub fn apply_switch_defaults(id: &str, provider: &Value) -> Result<(), AppError> {
    let _guard = pi_write_lock()
        .lock()
        .map_err(|_| AppError::Message("Pi configuration lock is poisoned".to_string()))?;
    apply_switch_defaults_in_dir(&get_pi_dir(), id, provider)
}

fn get_providers_in_dir(dir: &Path) -> Result<Map<String, Value>, AppError> {
    let models_root = read_object(&dir.join("models.json"))?;
    let auth_root = read_object(&dir.join("auth.json"))?;
    let settings_root = read_object(&dir.join("settings.json"))?;
    let mut providers = models_root
        .get("providers")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();

    for (id, provider) in &mut providers {
        let Some(provider) = provider.as_object_mut() else {
            continue;
        };
        if let Some(key) = auth_root
            .get(id)
            .filter(|credential| is_api_key_credential(credential))
            .and_then(|credential| credential.get("key"))
            .and_then(Value::as_str)
        {
            provider.insert("apiKey".to_string(), Value::String(key.to_string()));
        }
        if settings_root.get("defaultProvider").and_then(Value::as_str) == Some(id.as_str()) {
            if let Some(model) = settings_root.get("defaultModel").and_then(Value::as_str) {
                provider.insert("defaultModel".to_string(), Value::String(model.to_string()));
            }
        }
    }
    Ok(providers)
}

pub fn get_providers() -> Result<Map<String, Value>, AppError> {
    get_providers_in_dir(&get_pi_dir())
}

pub fn get_live_provider_ids() -> Result<Vec<String>, AppError> {
    Ok(get_providers()?.into_iter().map(|(id, _)| id).collect())
}

pub fn get_default_provider() -> Result<Option<String>, AppError> {
    Ok(read_object(&get_settings_path())?
        .get("defaultProvider")
        .and_then(Value::as_str)
        .map(str::to_string))
}

pub fn read_settings() -> Result<Value, AppError> {
    Ok(Value::Object(read_object(&get_settings_path())?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn provider() -> Value {
        json!({
            "baseUrl": "https://api.example.com/v1",
            "api": "openai-responses",
            "apiKey": "sk-test",
            "authHeader": true,
            "defaultModel": "gpt-test",
            "models": [{
                "id": "gpt-test",
                "name": "GPT Test",
                "reasoning": true,
                "input": ["text", "image"],
                "contextWindow": 128000,
                "maxTokens": 32000
            }],
            "headers": { "X-Tenant": "alpha" }
        })
    }

    #[test]
    fn provider_updates_preserve_unrelated_pi_configuration() {
        let temp = tempdir().expect("tempdir");
        write_json_file(
            &temp.path().join("models.json"),
            &json!({
                "providers": { "existing": { "baseUrl": "https://existing.test", "api": "openai-completions", "models": [{ "id": "old" }] } },
                "extensionField": true
            }),
        )
        .expect("models");
        write_json_file(
            &temp.path().join("auth.json"),
            &json!({ "oauth-provider": { "type": "oauth", "access": "token" } }),
        )
        .expect("auth");
        write_json_file(
            &temp.path().join("settings.json"),
            &json!({ "theme": "mono", "defaultThinkingLevel": "high" }),
        )
        .expect("settings");

        apply_provider_in_dir(temp.path(), "custom", &provider()).expect("apply provider");
        apply_switch_defaults_in_dir(temp.path(), "custom", &provider()).expect("defaults");

        let models = read_object(&temp.path().join("models.json")).expect("read models");
        assert_eq!(models.get("extensionField"), Some(&Value::Bool(true)));
        assert!(models
            .get("providers")
            .and_then(Value::as_object)
            .is_some_and(|providers| providers.contains_key("existing")));
        assert_eq!(
            models["providers"]["custom"]["headers"][USER_AGENT_HEADER],
            Value::String(STACKFERRY_USER_AGENT.to_string())
        );
        assert_eq!(
            models["providers"]["custom"]["headers"]["X-Tenant"],
            Value::String("alpha".to_string())
        );
        let auth = read_object(&temp.path().join("auth.json")).expect("read auth");
        assert_eq!(
            auth.get("oauth-provider")
                .and_then(|value| value.get("type"))
                .and_then(Value::as_str),
            Some("oauth")
        );
        assert_eq!(
            auth.get("custom")
                .and_then(|value| value.get("key"))
                .and_then(Value::as_str),
            Some("sk-test")
        );
        let settings = read_object(&temp.path().join("settings.json")).expect("read settings");
        assert_eq!(settings.get("theme").and_then(Value::as_str), Some("mono"));
        assert_eq!(
            settings.get("defaultProvider").and_then(Value::as_str),
            Some("custom")
        );
        assert_eq!(
            settings.get("defaultModel").and_then(Value::as_str),
            Some("gpt-test")
        );
    }

    #[test]
    fn imported_provider_merges_api_key_and_default_model() {
        let temp = tempdir().expect("tempdir");
        apply_provider_in_dir(temp.path(), "custom", &provider()).expect("apply provider");
        apply_switch_defaults_in_dir(temp.path(), "custom", &provider()).expect("defaults");

        let providers = get_providers_in_dir(temp.path()).expect("providers");
        let imported = providers.get("custom").expect("custom");
        assert_eq!(
            imported.get("apiKey").and_then(Value::as_str),
            Some("sk-test")
        );
        assert_eq!(
            imported.get("defaultModel").and_then(Value::as_str),
            Some("gpt-test")
        );
    }

    #[test]
    fn provider_normalization_preserves_custom_user_agent() {
        let mut settings = provider();
        settings["headers"] = json!({ "user-agent": "CustomClient/1.0" });

        normalize_provider(&mut settings).expect("normalize");

        assert_eq!(
            settings["headers"]["user-agent"],
            Value::String("CustomClient/1.0".to_string())
        );
        assert!(settings["headers"].get(USER_AGENT_HEADER).is_none());
    }

    #[test]
    fn migration_backfills_existing_provider_user_agents() {
        let temp = tempdir().expect("tempdir");
        write_json_file(
            &temp.path().join("models.json"),
            &json!({
                "providers": {
                    "legacy": { "headers": { "X-Tenant": "alpha" } },
                    "custom": { "headers": { "user-agent": "CustomClient/1.0" } },
                    "invalid": { "headers": "invalid" }
                },
                "extensionField": true
            }),
        )
        .expect("models");

        assert_eq!(
            migrate_provider_user_agents_in_dir(temp.path()).expect("migration"),
            1
        );
        assert_eq!(
            migrate_provider_user_agents_in_dir(temp.path()).expect("idempotent migration"),
            0
        );

        let models = read_object(&temp.path().join("models.json")).expect("models");
        assert_eq!(
            models["providers"]["legacy"]["headers"][USER_AGENT_HEADER],
            Value::String(STACKFERRY_USER_AGENT.to_string())
        );
        assert_eq!(
            models["providers"]["legacy"]["headers"]["X-Tenant"],
            Value::String("alpha".to_string())
        );
        assert_eq!(
            models["providers"]["custom"]["headers"]["user-agent"],
            Value::String("CustomClient/1.0".to_string())
        );
        assert_eq!(models["providers"]["invalid"]["headers"], json!("invalid"));
        assert_eq!(models["extensionField"], Value::Bool(true));
    }

    #[test]
    fn removal_preserves_oauth_credentials_and_unrelated_settings() {
        let temp = tempdir().expect("tempdir");
        apply_provider_in_dir(temp.path(), "custom", &provider()).expect("apply provider");
        apply_switch_defaults_in_dir(temp.path(), "custom", &provider()).expect("defaults");
        let mut auth = read_object(&temp.path().join("auth.json")).expect("auth");
        auth.insert(
            "oauth-provider".to_string(),
            json!({ "type": "oauth", "access": "token" }),
        );
        write_json_file(&temp.path().join("auth.json"), &Value::Object(auth)).expect("auth");

        remove_provider_in_dir(temp.path(), "custom").expect("remove");

        let auth = read_object(&temp.path().join("auth.json")).expect("auth");
        assert!(!auth.contains_key("custom"));
        assert!(auth.contains_key("oauth-provider"));
        let settings = read_object(&temp.path().join("settings.json")).expect("settings");
        assert!(!settings.contains_key("defaultProvider"));
        assert!(!settings.contains_key("defaultModel"));
    }

    #[test]
    fn validation_rejects_duplicate_models_and_unknown_default() {
        let mut duplicate = provider();
        duplicate["models"] = json!([{ "id": "same" }, { "id": "same" }]);
        duplicate["defaultModel"] = json!("same");
        assert!(validate_provider(&duplicate).is_err());

        let mut unknown_default = provider();
        unknown_default["defaultModel"] = json!("missing");
        assert!(validate_provider(&unknown_default).is_err());
    }

    #[test]
    fn validation_rejects_invalid_model_limits() {
        let mut invalid = provider();
        invalid["models"][0]["contextWindow"] = json!(0);
        assert!(validate_provider(&invalid).is_err());
    }
}
