use crate::app_config::McpServer;
use crate::config::{atomic_write, write_json_file};
use crate::error::AppError;
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

pub const PI_MCP_ADAPTER_PACKAGE: &str = "npm:pi-mcp-adapter@2.19.0";
pub const PI_MCP_ADAPTER_VERSION: &str = "2.19.0";
const MANAGED_STATE_VERSION: u32 = 1;
const MANAGED_STATE_FILE: &str = ".stackferry-mcp-state.json";
const WRITE_LOCK_DIR: &str = ".stackferry-mcp-write.lock";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiMcpStatus {
    pub state: String,
    pub configured_version: Option<String>,
    pub installed_version: Option<String>,
    pub config_path: String,
    pub project_override_path: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedState {
    #[serde(default = "managed_state_version")]
    version: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    adapter_package_entry: Option<Value>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    managed_servers: BTreeMap<String, ManagedServer>,
    #[serde(default, skip_serializing_if = "is_false")]
    mcp_file_created: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    settings_file_created: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    mcp_servers_field_created: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    packages_field_created: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedServer {
    last_projected_hash: String,
}

#[derive(Clone)]
struct FileSnapshot {
    bytes: Option<Vec<u8>>,
    permissions: Option<fs::Permissions>,
}

struct PiMcpWriteLock {
    path: PathBuf,
}

impl PiMcpWriteLock {
    fn acquire(dir: &Path) -> Result<Self, AppError> {
        fs::create_dir_all(dir).map_err(|error| AppError::io(dir, error))?;
        let path = dir.join(WRITE_LOCK_DIR);
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            match fs::create_dir(&path) {
                Ok(()) => return Ok(Self { path }),
                Err(error)
                    if error.kind() == std::io::ErrorKind::AlreadyExists
                        && Instant::now() < deadline =>
                {
                    std::thread::sleep(Duration::from_millis(20));
                }
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                    return Err(AppError::Message(
                        "Pi MCP configuration is being updated by another process".to_string(),
                    ));
                }
                Err(error) => return Err(AppError::io(&path, error)),
            }
        }
    }
}

impl Drop for PiMcpWriteLock {
    fn drop(&mut self) {
        let _ = fs::remove_dir(&self.path);
    }
}

fn managed_state_version() -> u32 {
    MANAGED_STATE_VERSION
}

fn is_false(value: &bool) -> bool {
    !*value
}

fn process_write_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

pub fn project_servers_to_pi(servers: &IndexMap<String, McpServer>) -> Result<(), AppError> {
    let desired = servers
        .values()
        .filter(|server| server.apps.pi)
        .map(|server| (server.id.clone(), server.server.clone()))
        .collect();
    project_servers_in_dir(&crate::pi_config::get_pi_dir(), desired)
}

pub fn read_pi_servers() -> Result<Map<String, Value>, AppError> {
    read_pi_servers_in_dir(&crate::pi_config::get_pi_dir())
}

pub fn get_pi_mcp_status(project_dir: Option<&Path>, enabled_ids: &HashSet<String>) -> PiMcpStatus {
    get_pi_mcp_status_in_dir(&crate::pi_config::get_pi_dir(), project_dir, enabled_ids)
}

fn project_servers_in_dir(dir: &Path, desired: BTreeMap<String, Value>) -> Result<(), AppError> {
    if desired.is_empty() && !dir.join(MANAGED_STATE_FILE).exists() {
        return Ok(());
    }

    let _process_guard = process_write_lock()
        .lock()
        .map_err(|_| AppError::Message("Pi MCP configuration lock is poisoned".to_string()))?;
    let _file_guard = PiMcpWriteLock::acquire(dir)?;

    for (id, spec) in &desired {
        if !spec.is_object() {
            return Err(AppError::McpValidation(format!(
                "Pi MCP server '{id}' must be a JSON object"
            )));
        }
    }

    let mcp_path = dir.join("mcp.json");
    let settings_path = dir.join("settings.json");
    let state_path = dir.join(MANAGED_STATE_FILE);
    let mcp_snapshot = snapshot(&mcp_path)?;
    let settings_snapshot = snapshot(&settings_path)?;
    let state_snapshot = snapshot(&state_path)?;

    let mut mcp_root = parse_object_snapshot(&mcp_path, &mcp_snapshot, "Pi MCP config")?;
    let original_mcp_root = mcp_root.clone();
    let mut settings_root =
        parse_object_snapshot(&settings_path, &settings_snapshot, "Pi settings")?;
    let original_settings_root = settings_root.clone();
    let mut state = parse_state_snapshot(&state_path, &state_snapshot)?;
    let original_state = state.clone();
    let had_mcp_servers_field = mcp_root.contains_key("mcpServers");
    let had_packages_field = settings_root.contains_key("packages");

    plan_server_projection(&mut mcp_root, &mut state, &desired)?;
    plan_adapter_package(&mut settings_root, &mut state, !desired.is_empty())?;

    if !desired.is_empty() {
        if mcp_snapshot.bytes.is_none() && mcp_root != original_mcp_root {
            state.mcp_file_created = true;
        }
        if settings_snapshot.bytes.is_none() && settings_root != original_settings_root {
            state.settings_file_created = true;
        }
        if !had_mcp_servers_field && mcp_root.contains_key("mcpServers") {
            state.mcp_servers_field_created = true;
        }
        if !had_packages_field && settings_root.contains_key("packages") {
            state.packages_field_created = true;
        }
    }

    let remove_mcp_file = desired.is_empty()
        && release_created_root_field(
            &mut mcp_root,
            "mcpServers",
            &mut state.mcp_servers_field_created,
            &mut state.mcp_file_created,
        );
    let remove_settings_file = desired.is_empty()
        && release_created_root_field(
            &mut settings_root,
            "packages",
            &mut state.packages_field_created,
            &mut state.settings_file_created,
        );

    let mut written: Vec<(PathBuf, FileSnapshot)> = Vec::new();
    let result = (|| {
        if remove_mcp_file {
            remove_checked(&mcp_path, &mcp_snapshot, &mut written)?;
        } else if mcp_root != original_mcp_root {
            write_checked_json(
                &mcp_path,
                &mcp_snapshot,
                &Value::Object(mcp_root),
                &mut written,
            )?;
        }
        if remove_settings_file {
            remove_checked(&settings_path, &settings_snapshot, &mut written)?;
        } else if settings_root != original_settings_root {
            write_checked_json(
                &settings_path,
                &settings_snapshot,
                &Value::Object(settings_root),
                &mut written,
            )?;
        }
        if state != original_state || (state_is_empty(&state) && state_snapshot.bytes.is_some()) {
            if state_is_empty(&state) {
                remove_checked(&state_path, &state_snapshot, &mut written)?;
            } else {
                write_checked_json(
                    &state_path,
                    &state_snapshot,
                    &serde_json::to_value(&state)
                        .map_err(|error| AppError::JsonSerialize { source: error })?,
                    &mut written,
                )?;
            }
        }
        Ok(())
    })();

    if let Err(error) = result {
        let mut rollback_error = None;
        for (path, snapshot) in written.into_iter().rev() {
            if let Err(error) = restore_snapshot(&path, &snapshot) {
                rollback_error = Some(error);
            }
        }
        if let Some(rollback_error) = rollback_error {
            return Err(AppError::Message(format!(
                "Pi MCP configuration update failed ({error}); rollback also failed ({rollback_error})"
            )));
        }
        return Err(error);
    }
    Ok(())
}

fn plan_server_projection(
    root: &mut Map<String, Value>,
    state: &mut ManagedState,
    desired: &BTreeMap<String, Value>,
) -> Result<(), AppError> {
    if desired.is_empty() && state.managed_servers.is_empty() {
        return Ok(());
    }
    if desired.is_empty() && !root.contains_key("mcpServers") {
        state.managed_servers.clear();
        return Ok(());
    }

    let servers = root
        .entry("mcpServers".to_string())
        .or_insert_with(|| Value::Object(Map::new()))
        .as_object_mut()
        .ok_or_else(|| AppError::Config("Pi mcp.json mcpServers must be an object".to_string()))?;

    let removed: Vec<String> = state
        .managed_servers
        .keys()
        .filter(|id| !desired.contains_key(*id))
        .cloned()
        .collect();
    for id in removed {
        let managed = state.managed_servers.get(&id).expect("managed ID exists");
        if let Some(current) = servers.get(&id) {
            if value_fingerprint(current) != managed.last_projected_hash {
                return Err(collision_error(&id));
            }
        }
        servers.remove(&id);
        state.managed_servers.remove(&id);
    }

    for (id, desired_spec) in desired {
        if let Some(managed) = state.managed_servers.get_mut(id) {
            if let Some(current) = servers.get(id) {
                if value_fingerprint(current) != managed.last_projected_hash
                    && current != desired_spec
                {
                    return Err(collision_error(id));
                }
            }
            servers.insert(id.clone(), desired_spec.clone());
            managed.last_projected_hash = value_fingerprint(desired_spec);
            continue;
        }

        match servers.get(id) {
            Some(current) if current == desired_spec => {}
            Some(_) => return Err(collision_error(id)),
            None => {
                servers.insert(id.clone(), desired_spec.clone());
                state.managed_servers.insert(
                    id.clone(),
                    ManagedServer {
                        last_projected_hash: value_fingerprint(desired_spec),
                    },
                );
            }
        }
    }
    Ok(())
}

fn plan_adapter_package(
    settings: &mut Map<String, Value>,
    state: &mut ManagedState,
    enabled: bool,
) -> Result<(), AppError> {
    if !enabled && state.adapter_package_entry.is_none() {
        return Ok(());
    }
    if !enabled && !settings.contains_key("packages") {
        state.adapter_package_entry = None;
        return Ok(());
    }

    let packages = settings
        .entry("packages".to_string())
        .or_insert_with(|| Value::Array(Vec::new()))
        .as_array_mut()
        .ok_or_else(|| AppError::Config("Pi settings packages must be an array".to_string()))?;
    let matching: Vec<usize> = packages
        .iter()
        .enumerate()
        .filter_map(|(index, entry)| is_adapter_entry(entry).then_some(index))
        .collect();
    if matching.len() > 1 {
        return Err(AppError::Config(
            "Pi settings contains multiple pi-mcp-adapter package entries".to_string(),
        ));
    }

    if enabled {
        if let Some(index) = matching.first().copied() {
            let source = package_source(&packages[index]).unwrap_or_default();
            if source != PI_MCP_ADAPTER_PACKAGE {
                return Err(AppError::Config(format!(
                    "Pi MCP adapter package must be pinned to {PI_MCP_ADAPTER_VERSION}"
                )));
            }
            if !adapter_entry_loads_extensions(&packages[index]) {
                return Err(AppError::Config(
                    "Pi MCP adapter package entry disables its extension".to_string(),
                ));
            }
            if let Some(owned) = &state.adapter_package_entry {
                if &packages[index] != owned {
                    return Err(AppError::Config(
                        "Pi MCP adapter package entry changed outside StackFerry".to_string(),
                    ));
                }
            }
        } else {
            let entry = Value::String(PI_MCP_ADAPTER_PACKAGE.to_string());
            packages.push(entry.clone());
            state.adapter_package_entry = Some(entry);
        }
        return Ok(());
    }

    if let Some(owned) = state.adapter_package_entry.take() {
        if let Some(index) = matching.first().copied() {
            if packages[index] != owned {
                return Err(AppError::Config(
                    "Pi MCP adapter package entry changed outside StackFerry".to_string(),
                ));
            }
            packages.remove(index);
        }
    }
    Ok(())
}

fn collision_error(id: &str) -> AppError {
    AppError::McpValidation(format!(
        "Pi MCP server '{id}' conflicts with an unmanaged or externally changed entry"
    ))
}

fn value_fingerprint(value: &Value) -> String {
    fn canonicalize(value: &Value) -> Value {
        match value {
            Value::Object(object) => {
                let sorted: BTreeMap<_, _> = object.iter().collect();
                Value::Object(
                    sorted
                        .into_iter()
                        .map(|(key, value)| (key.clone(), canonicalize(value)))
                        .collect(),
                )
            }
            Value::Array(array) => Value::Array(array.iter().map(canonicalize).collect()),
            _ => value.clone(),
        }
    }

    let canonical = canonicalize(value).to_string();
    format!("{:x}", Sha256::digest(canonical.as_bytes()))
}

fn package_source(entry: &Value) -> Option<&str> {
    entry
        .as_str()
        .or_else(|| entry.get("source").and_then(Value::as_str))
}

fn is_adapter_entry(entry: &Value) -> bool {
    let Some(source) = package_source(entry).and_then(|source| source.strip_prefix("npm:")) else {
        return false;
    };
    source == "pi-mcp-adapter" || source.starts_with("pi-mcp-adapter@")
}

fn adapter_entry_loads_extensions(entry: &Value) -> bool {
    let Some(object) = entry.as_object() else {
        return true;
    };
    let extensions = object.get("extensions").and_then(Value::as_array);
    if extensions.is_some_and(Vec::is_empty) {
        return false;
    }
    if object.get("autoload").and_then(Value::as_bool) == Some(false) {
        return extensions.is_some_and(|patterns| {
            patterns.iter().any(|pattern| {
                pattern
                    .as_str()
                    .is_some_and(|pattern| !pattern.starts_with('!') && !pattern.starts_with('-'))
            })
        });
    }
    true
}

fn read_pi_servers_in_dir(dir: &Path) -> Result<Map<String, Value>, AppError> {
    let path = dir.join("mcp.json");
    let snapshot = snapshot(&path)?;
    let root = parse_object_snapshot(&path, &snapshot, "Pi MCP config")?;
    root.get("mcpServers")
        .map(|value| {
            value.as_object().cloned().ok_or_else(|| {
                AppError::Config("Pi mcp.json mcpServers must be an object".to_string())
            })
        })
        .transpose()
        .map(Option::unwrap_or_default)
}

fn get_pi_mcp_status_in_dir(
    dir: &Path,
    project_dir: Option<&Path>,
    enabled_ids: &HashSet<String>,
) -> PiMcpStatus {
    let config_path = dir.join("mcp.json").to_string_lossy().to_string();
    let status_result = (|| {
        let settings_path = dir.join("settings.json");
        let settings =
            parse_object_snapshot(&settings_path, &snapshot(&settings_path)?, "Pi settings")?;
        let packages = settings
            .get("packages")
            .map(|value| {
                value.as_array().ok_or_else(|| {
                    AppError::Config("Pi settings packages must be an array".to_string())
                })
            })
            .transpose()?
            .cloned()
            .unwrap_or_default();
        let matching: Vec<&Value> = packages
            .iter()
            .filter(|entry| is_adapter_entry(entry))
            .collect();
        if matching.len() > 1 {
            return Err(AppError::Config(
                "Pi settings contains multiple pi-mcp-adapter package entries".to_string(),
            ));
        }
        let configured = matching.first().and_then(|entry| package_source(entry));
        if configured.is_some_and(|source| source != PI_MCP_ADAPTER_PACKAGE) {
            return Err(AppError::Config(format!(
                "Pi MCP adapter package must be pinned to {PI_MCP_ADAPTER_VERSION}"
            )));
        }
        if matching
            .first()
            .is_some_and(|entry| !adapter_entry_loads_extensions(entry))
        {
            return Err(AppError::Config(
                "Pi MCP adapter package entry disables its extension".to_string(),
            ));
        }

        let installed_path = dir
            .join("npm")
            .join("node_modules")
            .join("pi-mcp-adapter")
            .join("package.json");
        let installed_version = if installed_path.exists() {
            let content = fs::read_to_string(&installed_path)
                .map_err(|error| AppError::io(&installed_path, error))?;
            let package: Value = serde_json::from_str(&content).map_err(|error| {
                AppError::Config(format!(
                    "Invalid installed Pi MCP adapter package metadata: {error}"
                ))
            })?;
            package
                .get("version")
                .and_then(Value::as_str)
                .map(str::to_string)
        } else {
            None
        };
        if installed_version
            .as_deref()
            .is_some_and(|version| version != PI_MCP_ADAPTER_VERSION)
        {
            return Err(AppError::Config(format!(
                "Installed Pi MCP adapter version does not match {PI_MCP_ADAPTER_VERSION}"
            )));
        }

        let state = if configured.is_none() {
            "inactive"
        } else if installed_version.is_some() {
            "installed"
        } else {
            "pending"
        };
        let project_override_path = match project_dir {
            Some(path) => detect_project_override(path, enabled_ids)?,
            None => None,
        };

        Ok((
            state.to_string(),
            configured.map(|_| PI_MCP_ADAPTER_VERSION.to_string()),
            installed_version,
            project_override_path,
        ))
    })();

    match status_result {
        Ok((state, configured_version, installed_version, project_override_path)) => PiMcpStatus {
            state,
            configured_version,
            installed_version,
            config_path,
            project_override_path,
            error: None,
        },
        Err(error) => PiMcpStatus {
            state: "error".to_string(),
            configured_version: None,
            installed_version: None,
            config_path,
            project_override_path: None,
            error: Some(error.to_string()),
        },
    }
}

fn detect_project_override(
    project_dir: &Path,
    enabled_ids: &HashSet<String>,
) -> Result<Option<String>, AppError> {
    for path in [
        project_dir.join(".pi/mcp.json"),
        project_dir.join(".mcp.json"),
    ] {
        if !path.exists() {
            continue;
        }
        let root = parse_object_snapshot(&path, &snapshot(&path)?, "project MCP config")?;
        let overrides_enabled = root
            .get("mcpServers")
            .and_then(Value::as_object)
            .is_some_and(|servers| servers.keys().any(|id| enabled_ids.contains(id)));
        let has_imports = root
            .get("imports")
            .and_then(Value::as_array)
            .is_some_and(|imports| !imports.is_empty());
        if overrides_enabled || has_imports || !root.is_empty() {
            return Ok(Some(path.to_string_lossy().to_string()));
        }
    }
    Ok(None)
}

fn snapshot(path: &Path) -> Result<FileSnapshot, AppError> {
    let (bytes, permissions) = match fs::read(path) {
        Ok(bytes) => {
            let permissions = fs::metadata(path)
                .map_err(|error| AppError::io(path, error))?
                .permissions();
            (Some(bytes), Some(permissions))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => (None, None),
        Err(error) => return Err(AppError::io(path, error)),
    };
    Ok(FileSnapshot { bytes, permissions })
}

fn parse_object_snapshot(
    path: &Path,
    snapshot: &FileSnapshot,
    label: &str,
) -> Result<Map<String, Value>, AppError> {
    let Some(bytes) = &snapshot.bytes else {
        return Ok(Map::new());
    };
    let value: Value = serde_json::from_slice(bytes).map_err(|error| {
        AppError::Config(format!("Invalid {label} at {}: {error}", path.display()))
    })?;
    value.as_object().cloned().ok_or_else(|| {
        AppError::Config(format!(
            "{label} at {} must be a JSON object",
            path.display()
        ))
    })
}

fn parse_state_snapshot(path: &Path, snapshot: &FileSnapshot) -> Result<ManagedState, AppError> {
    let Some(bytes) = &snapshot.bytes else {
        return Ok(ManagedState {
            version: MANAGED_STATE_VERSION,
            ..ManagedState::default()
        });
    };
    let state: ManagedState = serde_json::from_slice(bytes).map_err(|error| {
        AppError::Config(format!(
            "Invalid StackFerry Pi MCP state at {}: {error}",
            path.display()
        ))
    })?;
    if state.version != MANAGED_STATE_VERSION {
        return Err(AppError::Config(format!(
            "Unsupported StackFerry Pi MCP state version {}",
            state.version
        )));
    }
    Ok(state)
}

fn state_is_empty(state: &ManagedState) -> bool {
    state.adapter_package_entry.is_none()
        && state.managed_servers.is_empty()
        && !state.mcp_file_created
        && !state.settings_file_created
        && !state.mcp_servers_field_created
        && !state.packages_field_created
}

fn release_created_root_field(
    root: &mut Map<String, Value>,
    field: &str,
    field_created: &mut bool,
    file_created: &mut bool,
) -> bool {
    if *field_created {
        let field_is_empty = root.get(field).is_some_and(|value| match value {
            Value::Object(object) => object.is_empty(),
            Value::Array(array) => array.is_empty(),
            _ => false,
        });
        if field_is_empty {
            root.remove(field);
        }
        *field_created = false;
    }

    if *file_created {
        *file_created = false;
        return root.is_empty();
    }
    false
}

fn ensure_unchanged(path: &Path, expected: &FileSnapshot) -> Result<(), AppError> {
    let current = snapshot(path)?;
    if current.bytes != expected.bytes {
        return Err(AppError::Message(format!(
            "Pi MCP configuration changed concurrently: {}",
            path.display()
        )));
    }
    Ok(())
}

fn write_checked_json(
    path: &Path,
    expected: &FileSnapshot,
    value: &Value,
    written: &mut Vec<(PathBuf, FileSnapshot)>,
) -> Result<(), AppError> {
    ensure_unchanged(path, expected)?;
    write_json_file(path, value)?;
    written.push((path.to_path_buf(), expected.clone()));
    Ok(())
}

fn remove_checked(
    path: &Path,
    expected: &FileSnapshot,
    written: &mut Vec<(PathBuf, FileSnapshot)>,
) -> Result<(), AppError> {
    ensure_unchanged(path, expected)?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| AppError::io(path, error))?;
        written.push((path.to_path_buf(), expected.clone()));
    }
    Ok(())
}

fn restore_snapshot(path: &Path, snapshot: &FileSnapshot) -> Result<(), AppError> {
    match &snapshot.bytes {
        Some(bytes) => {
            atomic_write(path, bytes)?;
            if let Some(permissions) = &snapshot.permissions {
                fs::set_permissions(path, permissions.clone())
                    .map_err(|error| AppError::io(path, error))?;
            }
            Ok(())
        }
        None => match fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(AppError::io(path, error)),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::tempdir;

    fn desired(entries: &[(&str, Value)]) -> BTreeMap<String, Value> {
        entries
            .iter()
            .map(|(id, spec)| ((*id).to_string(), spec.clone()))
            .collect()
    }

    #[test]
    fn projection_preserves_unmanaged_fields_and_restores_owned_state() {
        let temp = tempdir().unwrap();
        write_json_file(
            &temp.path().join("settings.json"),
            &json!({
                "theme": "dark",
                "packages": ["npm:user-package", {"source": "npm:filtered", "skills": []}]
            }),
        )
        .unwrap();
        write_json_file(
            &temp.path().join("mcp.json"),
            &json!({
                "imports": ["~/.config/mcp/mcp.json"],
                "settings": {"directTools": false},
                "unknown": {"keep": true},
                "mcpServers": {
                    "unmanaged": {"command": "user-command", "custom": true}
                }
            }),
        )
        .unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(
                temp.path().join("settings.json"),
                fs::Permissions::from_mode(0o600),
            )
            .unwrap();
            fs::set_permissions(
                temp.path().join("mcp.json"),
                fs::Permissions::from_mode(0o600),
            )
            .unwrap();
        }
        let spec = json!({
            "command": "npx",
            "args": ["-y", "server"],
            "env": {"TOKEN": "!read-token"},
            "cwd": "${PROJECT_DIR}",
            "lifecycle": "lazy-keep-alive",
            "requestTimeoutMs": 45000,
            "directTools": ["search"],
            "includeTools": ["search*"],
            "excludeTools": ["delete*"]
        });

        project_servers_in_dir(temp.path(), desired(&[("managed", spec.clone())])).unwrap();

        let settings: Value =
            serde_json::from_slice(&fs::read(temp.path().join("settings.json")).unwrap()).unwrap();
        assert_eq!(settings["theme"], "dark");
        assert!(settings["packages"]
            .as_array()
            .unwrap()
            .contains(&json!(PI_MCP_ADAPTER_PACKAGE)));
        let mcp: Value =
            serde_json::from_slice(&fs::read(temp.path().join("mcp.json")).unwrap()).unwrap();
        assert_eq!(mcp["imports"], json!(["~/.config/mcp/mcp.json"]));
        assert_eq!(mcp["settings"]["directTools"], false);
        assert_eq!(mcp["unknown"]["keep"], true);
        assert_eq!(mcp["mcpServers"]["unmanaged"]["custom"], true);
        assert_eq!(mcp["mcpServers"]["managed"], spec);
        assert_eq!(mcp["mcpServers"]["managed"]["env"]["TOKEN"], "!read-token");
        let managed_state = fs::read_to_string(temp.path().join(MANAGED_STATE_FILE)).unwrap();
        assert!(!managed_state.contains("!read-token"));
        assert!(!managed_state.contains("TOKEN"));

        project_servers_in_dir(temp.path(), BTreeMap::new()).unwrap();

        let settings: Value =
            serde_json::from_slice(&fs::read(temp.path().join("settings.json")).unwrap()).unwrap();
        assert!(!settings["packages"]
            .as_array()
            .unwrap()
            .contains(&json!(PI_MCP_ADAPTER_PACKAGE)));
        let mcp: Value =
            serde_json::from_slice(&fs::read(temp.path().join("mcp.json")).unwrap()).unwrap();
        assert!(mcp["mcpServers"].get("managed").is_none());
        assert_eq!(mcp["mcpServers"]["unmanaged"]["command"], "user-command");
        assert!(!temp.path().join(MANAGED_STATE_FILE).exists());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(temp.path().join("settings.json"))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
            assert_eq!(
                fs::metadata(temp.path().join("mcp.json"))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
    }

    #[test]
    fn fresh_projection_removes_stackferry_created_files_on_deselect() {
        let temp = tempdir().unwrap();

        project_servers_in_dir(
            temp.path(),
            desired(&[("managed", json!({"command": "echo"}))]),
        )
        .unwrap();
        assert!(temp.path().join("mcp.json").exists());
        assert!(temp.path().join("settings.json").exists());

        project_servers_in_dir(temp.path(), BTreeMap::new()).unwrap();

        assert!(!temp.path().join("mcp.json").exists());
        assert!(!temp.path().join("settings.json").exists());
        assert!(!temp.path().join(MANAGED_STATE_FILE).exists());
    }

    #[test]
    fn deselect_removes_only_root_fields_created_by_stackferry() {
        let temp = tempdir().unwrap();
        write_json_file(
            &temp.path().join("mcp.json"),
            &json!({"imports": ["shared"]}),
        )
        .unwrap();
        write_json_file(
            &temp.path().join("settings.json"),
            &json!({"theme": "dark"}),
        )
        .unwrap();

        project_servers_in_dir(
            temp.path(),
            desired(&[("managed", json!({"command": "echo"}))]),
        )
        .unwrap();
        project_servers_in_dir(temp.path(), BTreeMap::new()).unwrap();

        let mcp: Value =
            serde_json::from_slice(&fs::read(temp.path().join("mcp.json")).unwrap()).unwrap();
        let settings: Value =
            serde_json::from_slice(&fs::read(temp.path().join("settings.json")).unwrap()).unwrap();
        assert_eq!(mcp, json!({"imports": ["shared"]}));
        assert_eq!(settings, json!({"theme": "dark"}));
    }

    #[test]
    fn identical_existing_server_remains_user_owned() {
        let temp = tempdir().unwrap();
        let original = json!({"command": "echo", "env": {"TOKEN": "$TOKEN"}});
        write_json_file(
            &temp.path().join("mcp.json"),
            &json!({"mcpServers": {"same": original.clone()}}),
        )
        .unwrap();

        project_servers_in_dir(temp.path(), desired(&[("same", original.clone())])).unwrap();
        let error = project_servers_in_dir(
            temp.path(),
            desired(&[("same", json!({"command": "updated"}))]),
        )
        .unwrap_err();
        assert!(error.to_string().contains("same"));
        project_servers_in_dir(temp.path(), BTreeMap::new()).unwrap();

        let servers = read_pi_servers_in_dir(temp.path()).unwrap();
        assert_eq!(servers.get("same"), Some(&original));
    }

    #[test]
    fn empty_projection_does_not_create_the_pi_agent_directory() {
        let temp = tempdir().unwrap();
        let agent_dir = temp.path().join("agent");

        project_servers_in_dir(&agent_dir, BTreeMap::new()).unwrap();

        assert!(!agent_dir.exists());
    }

    #[test]
    fn differing_unmanaged_server_is_a_non_destructive_collision() {
        let temp = tempdir().unwrap();
        write_json_file(
            &temp.path().join("mcp.json"),
            &json!({"mcpServers": {"same": {"command": "user"}}}),
        )
        .unwrap();
        let before = fs::read(temp.path().join("mcp.json")).unwrap();

        let error = project_servers_in_dir(
            temp.path(),
            desired(&[("same", json!({"command": "stackferry"}))]),
        )
        .unwrap_err();

        assert!(error.to_string().contains("same"));
        assert_eq!(fs::read(temp.path().join("mcp.json")).unwrap(), before);
        assert!(!temp.path().join("settings.json").exists());
    }

    #[test]
    fn package_status_reports_pending_installed_and_project_override() {
        let temp = tempdir().unwrap();
        write_json_file(
            &temp.path().join("settings.json"),
            &json!({"packages": [PI_MCP_ADAPTER_PACKAGE]}),
        )
        .unwrap();
        let enabled = HashSet::from(["managed".to_string()]);

        let pending = get_pi_mcp_status_in_dir(temp.path(), None, &enabled);
        assert_eq!(pending.state, "pending");

        let package_dir = temp.path().join("npm/node_modules/pi-mcp-adapter");
        fs::create_dir_all(&package_dir).unwrap();
        write_json_file(
            &package_dir.join("package.json"),
            &json!({"name": "pi-mcp-adapter", "version": PI_MCP_ADAPTER_VERSION}),
        )
        .unwrap();
        let project = temp.path().join("project");
        fs::create_dir_all(project.join(".pi")).unwrap();
        write_json_file(
            &project.join(".pi/mcp.json"),
            &json!({"mcpServers": {"managed": {"disabled": true}}}),
        )
        .unwrap();

        let installed = get_pi_mcp_status_in_dir(temp.path(), Some(&project), &enabled);
        assert_eq!(installed.state, "installed");
        assert_eq!(
            installed.installed_version.as_deref(),
            Some(PI_MCP_ADAPTER_VERSION)
        );
        let expected_override = project.join(".pi/mcp.json").to_string_lossy().to_string();
        assert_eq!(
            installed.project_override_path.as_deref(),
            Some(expected_override.as_str())
        );
    }

    #[test]
    fn disabled_adapter_package_entry_is_reported_without_overwriting_it() {
        let temp = tempdir().unwrap();
        let disabled_entry = json!({
            "source": PI_MCP_ADAPTER_PACKAGE,
            "autoload": false,
            "extensions": []
        });
        write_json_file(
            &temp.path().join("settings.json"),
            &json!({"packages": [disabled_entry.clone()]}),
        )
        .unwrap();

        let error = project_servers_in_dir(
            temp.path(),
            desired(&[("server", json!({"command": "echo"}))]),
        )
        .unwrap_err();

        assert!(error.to_string().contains("disables its extension"));
        let settings: Value =
            serde_json::from_slice(&fs::read(temp.path().join("settings.json")).unwrap()).unwrap();
        assert_eq!(settings["packages"][0], disabled_entry);
        assert!(!temp.path().join("mcp.json").exists());
        let status = get_pi_mcp_status_in_dir(temp.path(), None, &HashSet::new());
        assert_eq!(status.state, "error");
    }

    #[test]
    fn any_nonempty_project_mcp_config_is_reported_as_an_override() {
        let temp = tempdir().unwrap();
        let project = temp.path().join("project");
        fs::create_dir_all(&project).unwrap();
        write_json_file(
            &project.join(".mcp.json"),
            &json!({"mcpServers": {"project-only": {"command": "echo"}}}),
        )
        .unwrap();

        let status = get_pi_mcp_status_in_dir(
            temp.path(),
            Some(&project),
            &HashSet::from(["global-only".to_string()]),
        );
        let expected_override = project.join(".mcp.json").to_string_lossy().to_string();

        assert_eq!(
            status.project_override_path.as_deref(),
            Some(expected_override.as_str())
        );
    }

    #[test]
    fn malformed_settings_fail_before_writing_projection() {
        let temp = tempdir().unwrap();
        fs::write(temp.path().join("settings.json"), b"not-json").unwrap();

        let error = project_servers_in_dir(
            temp.path(),
            desired(&[("server", json!({"command": "npx"}))]),
        )
        .unwrap_err();

        assert!(error.to_string().contains("settings.json"));
        assert!(!temp.path().join("mcp.json").exists());
        assert!(!temp.path().join(MANAGED_STATE_FILE).exists());
    }

    #[test]
    fn concurrent_stackferry_writes_leave_projection_and_state_consistent() {
        let temp = tempdir().unwrap();
        let dir_a = temp.path().to_path_buf();
        let dir_b = dir_a.clone();
        let first = std::thread::spawn(move || {
            project_servers_in_dir(&dir_a, desired(&[("one", json!({"command": "one"}))]))
        });
        let second = std::thread::spawn(move || {
            project_servers_in_dir(&dir_b, desired(&[("two", json!({"command": "two"}))]))
        });
        first.join().unwrap().unwrap();
        second.join().unwrap().unwrap();

        let servers = read_pi_servers_in_dir(temp.path()).unwrap();
        let state = parse_state_snapshot(
            &temp.path().join(MANAGED_STATE_FILE),
            &snapshot(&temp.path().join(MANAGED_STATE_FILE)).unwrap(),
        )
        .unwrap();
        assert_eq!(servers.len(), 1);
        assert_eq!(state.managed_servers.len(), 1);
        assert_eq!(servers.keys().next(), state.managed_servers.keys().next());
    }
}
