use crate::config::{atomic_write, write_json_file};
use futures::{stream, StreamExt};
use globset::{Glob, GlobSet, GlobSetBuilder};
use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::io::Read;
use std::path::Component;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::mpsc;
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const STATE_FILE: &str = ".stackferry-extensions-state.json";
const LOCK_DIR: &str = ".stackferry-mcp-write.lock";
const TRUST_LOCK_DIR: &str = "trust.json.lock";
const STATE_VERSION: u32 = 1;
const CLI_TIMEOUT: Duration = Duration::from_secs(120);
const CLI_PROBE_TIMEOUT: Duration = Duration::from_secs(3);
const CLI_OUTPUT_LIMIT: usize = 256 * 1024;
const NPM_SEARCH_TIMEOUT: Duration = Duration::from_secs(12);
const NPM_LATEST_TIMEOUT: Duration = Duration::from_secs(10);
const NPM_SEARCH_RESPONSE_LIMIT: usize = 2 * 1024 * 1024;
const NPM_LATEST_RESPONSE_LIMIT: usize = 512 * 1024;
const NPM_SEARCH_CACHE_TTL: Duration = Duration::from_secs(5 * 60);
const NPM_LATEST_CONCURRENCY: usize = 5;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum PiExtensionScope {
    Global,
    Project,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiRuntimeStatus {
    pub scope: PiExtensionScope,
    pub project_dir: Option<String>,
    pub pi_dir: String,
    pub settings_path: String,
    pub cli_available: bool,
    pub cli_path: Option<String>,
    pub cli_version: Option<String>,
    pub mutable: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiExtensionResource {
    pub id: String,
    pub resource_key: String,
    pub scope: PiExtensionScope,
    pub project_dir: Option<String>,
    pub name: String,
    pub path: String,
    pub enabled: bool,
    pub origin: String,
    pub source_type: String,
    pub package_id: Option<String>,
    pub package_source: Option<String>,
    pub version: Option<String>,
    pub status: String,
    pub error: Option<String>,
    pub registrations: Vec<PiExtensionRegistration>,
    pub analysis_complete: bool,
    pub conflicts: Vec<PiExtensionConflict>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PiExtensionRegistration {
    pub kind: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PiExtensionConflict {
    pub kind: String,
    pub name: String,
    pub other_extension_id: String,
    pub other_extension_name: String,
    pub other_extension_path: String,
    pub other_extension_scope: PiExtensionScope,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiInstalledPackage {
    pub id: String,
    pub resource_key: String,
    pub scope: PiExtensionScope,
    pub project_dir: Option<String>,
    pub source: String,
    pub source_type: String,
    pub display_name: String,
    pub version: Option<String>,
    pub installed_path: Option<String>,
    pub status: String,
    pub extension_count: usize,
    pub skill_count: usize,
    pub prompt_count: usize,
    pub theme_count: usize,
    pub extensions: Vec<PiExtensionResource>,
    pub error: Option<String>,
    #[serde(skip)]
    autoload: bool,
    #[serde(skip)]
    entry: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiInventory {
    pub runtime: PiRuntimeStatus,
    pub runtimes: Vec<PiRuntimeStatus>,
    pub project_dir: Option<String>,
    pub project_trust: Option<PiProjectTrust>,
    pub extensions: Vec<PiExtensionResource>,
    pub packages: Vec<PiInstalledPackage>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiProjectTrust {
    pub project_dir: String,
    pub trusted: bool,
    pub decision: Option<bool>,
    pub inherited_from: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiPackageInstallResult {
    pub inventory: PiInventory,
    pub isolated_extensions: Vec<PiExtensionResource>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiPackageCatalogItem {
    pub name: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    pub publisher: Option<String>,
    pub license: Option<String>,
    pub published_at: Option<String>,
    pub npm_url: Option<String>,
    pub repository_url: Option<String>,
    pub homepage_url: Option<String>,
    pub source: String,
    pub downloads: Option<u64>,
    pub resource_types: Vec<String>,
    pub manifest_status: String,
    pub installed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiPackageSearchResult {
    pub items: Vec<PiPackageCatalogItem>,
    pub total: u64,
    pub query: String,
    pub offset: u32,
    pub limit: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct NpmSearchCacheKey {
    query: String,
    offset: u32,
    limit: u32,
}

#[derive(Debug, Clone)]
struct NpmSearchCacheEntry {
    inserted_at: Instant,
    result: PiPackageSearchResult,
}

#[derive(Debug, Clone)]
struct NpmSearchCandidate {
    item: PiPackageCatalogItem,
}

#[derive(Debug, Clone)]
struct SettingsSnapshot {
    bytes: Option<Vec<u8>>,
    permissions: Option<fs::Permissions>,
    root: Result<Map<String, Value>, String>,
}

#[derive(Debug, Clone)]
struct FileSnapshot {
    bytes: Option<Vec<u8>>,
    permissions: Option<fs::Permissions>,
}

#[derive(Debug, Clone)]
struct PackageRecord {
    index: usize,
    source: String,
    entry: Value,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedState {
    #[serde(default = "state_version")]
    version: u32,
    #[serde(default)]
    package_entries: BTreeMap<String, ManagedPackageEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedPackageEntry {
    before: Value,
    last_hash: String,
}

#[derive(Debug, Clone)]
struct PackageResource {
    relative: String,
    path: Option<PathBuf>,
    error: Option<String>,
}

#[derive(Default)]
struct ExtensionAnalysis {
    registrations: Vec<PiExtensionRegistration>,
    complete: bool,
}

#[derive(Debug, Clone)]
enum PiCliKind {
    Direct,
    #[cfg(target_os = "windows")]
    WindowsCmd,
    #[cfg(target_os = "windows")]
    NodeScript(PathBuf),
}

#[derive(Debug, Clone)]
struct PiCli {
    path: PathBuf,
    kind: PiCliKind,
    version: String,
}

trait SettingsWriter {
    fn write_json(&mut self, path: &Path, value: &Value) -> Result<(), String>;
    fn remove(&mut self, path: &Path) -> Result<(), String>;
}

struct FsSettingsWriter;

impl SettingsWriter for FsSettingsWriter {
    fn write_json(&mut self, path: &Path, value: &Value) -> Result<(), String> {
        write_json_file(path, value).map_err(|error| error.to_string())
    }

    fn remove(&mut self, path: &Path) -> Result<(), String> {
        match fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("删除 {} 失败: {error}", path.display())),
        }
    }
}

struct PiWriteLock {
    path: PathBuf,
}

impl PiWriteLock {
    fn acquire(dir: &Path) -> Result<Self, String> {
        Self::acquire_named(dir, LOCK_DIR)
    }

    fn acquire_named(dir: &Path, name: &str) -> Result<Self, String> {
        fs::create_dir_all(dir).map_err(|error| format!("创建 Pi 目录失败: {error}"))?;
        let path = dir.join(name);
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
                    return Err("Pi 配置正被另一个进程修改".to_string());
                }
                Err(error) => return Err(format!("创建 Pi 配置锁失败: {error}")),
            }
        }
    }
}

impl Drop for PiWriteLock {
    fn drop(&mut self) {
        let _ = fs::remove_dir(&self.path);
    }
}

fn state_version() -> u32 {
    STATE_VERSION
}

fn process_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn validate_project_dir(value: &str) -> Result<PathBuf, String> {
    let value = value.trim();
    if value.is_empty() || value.contains(['\n', '\r', '\0']) {
        return Err("Pi 项目目录无效".to_string());
    }
    let expanded = expand_home_path(value);
    if !expanded.is_absolute() {
        return Err("Pi 项目目录必须使用绝对路径".to_string());
    }
    let metadata = fs::symlink_metadata(&expanded)
        .map_err(|error| format!("读取 Pi 项目目录失败: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("Pi 项目目录必须是存在的非 symlink 目录".to_string());
    }
    fs::canonicalize(expanded).map_err(|error| format!("解析 Pi 项目目录失败: {error}"))
}

fn scope_dir(
    scope: PiExtensionScope,
    project_dir: Option<&str>,
) -> Result<(PathBuf, Option<PathBuf>), String> {
    match scope {
        PiExtensionScope::Global => Ok((crate::pi_config::get_pi_dir(), None)),
        PiExtensionScope::Project => {
            let project = validate_project_dir(
                project_dir.ok_or_else(|| "项目作用域需要 projectDir".to_string())?,
            )?;
            ensure_project_trusted(&crate::pi_config::get_pi_dir(), &project)?;
            Ok((
                crate::pi_config::get_project_pi_dir(&project),
                Some(project),
            ))
        }
    }
}

fn validate_project_pi_dir(project_dir: &Path, pi_dir: &Path) -> Result<(), String> {
    match fs::symlink_metadata(pi_dir) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            Err("项目 .pi 目录不允许使用 symlink".to_string())
        }
        Ok(metadata) if !metadata.is_dir() => Err("项目 .pi 必须是目录".to_string()),
        Ok(_) => {
            let canonical = fs::canonicalize(pi_dir)
                .map_err(|error| format!("解析项目 .pi 目录失败: {error}"))?;
            if canonical.starts_with(project_dir) {
                Ok(())
            } else {
                Err("项目 .pi 目录逃逸项目根".to_string())
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("读取项目 .pi 目录失败: {error}")),
    }
}

fn expand_home_path(value: &str) -> PathBuf {
    if value == "~" {
        return crate::config::get_home_dir();
    }
    if let Some(relative) = value
        .strip_prefix("~/")
        .or_else(|| value.strip_prefix("~\\"))
    {
        return crate::config::get_home_dir().join(relative);
    }
    PathBuf::from(value)
}

fn get_project_trust_in_dir(global_pi_dir: &Path, project_dir: &Path) -> PiProjectTrust {
    let project_dir_string = path_string(project_dir);
    let trust_path = global_pi_dir.join("trust.json");
    let root = read_json_object(&trust_path).unwrap_or_default();
    let mut current = Some(project_dir);
    while let Some(path) = current {
        let key = path_string(path);
        if let Some(decision) = root.get(&key).and_then(Value::as_bool) {
            return PiProjectTrust {
                project_dir: project_dir_string,
                trusted: decision,
                decision: Some(decision),
                inherited_from: (path != project_dir).then_some(key),
            };
        }
        current = path.parent();
    }
    PiProjectTrust {
        project_dir: project_dir_string,
        trusted: false,
        decision: None,
        inherited_from: None,
    }
}

fn ensure_project_trusted(global_pi_dir: &Path, project_dir: &Path) -> Result<(), String> {
    if get_project_trust_in_dir(global_pi_dir, project_dir).trusted {
        Ok(())
    } else {
        Err("项目未受信任，拒绝修改 Pi 项目资源".to_string())
    }
}

pub fn set_project_trust(project_dir: String, trusted: bool) -> Result<PiInventory, String> {
    let project_dir = validate_project_dir(&project_dir)?;
    let global_pi_dir = crate::pi_config::get_pi_dir();
    let _process_guard = process_lock()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let _file_guard = PiWriteLock::acquire_named(&global_pi_dir, TRUST_LOCK_DIR)?;
    let trust_path = global_pi_dir.join("trust.json");
    let snapshot = snapshot_file(&trust_path)?;
    let mut root = match &snapshot.bytes {
        Some(bytes) => serde_json::from_slice::<Value>(bytes)
            .map_err(|error| format!("Pi trust.json JSON 无效: {error}"))?
            .as_object()
            .cloned()
            .ok_or_else(|| "Pi trust.json 根节点必须是对象".to_string())?,
        None => Map::new(),
    };
    if root
        .values()
        .any(|value| !value.is_boolean() && !value.is_null())
    {
        return Err("Pi trust.json decision 必须是 boolean 或 null".to_string());
    }
    root.insert(path_string(&project_dir), Value::Bool(trusted));
    ensure_bytes_unchanged(&trust_path, snapshot.bytes.as_deref())?;
    write_json_file(&trust_path, &Value::Object(root)).map_err(|error| error.to_string())?;
    crate::settings::set_recent_pi_project_dir(Some(path_string(&project_dir)))
        .map_err(|error| error.to_string())?;
    Ok(get_scoped_inventory(Some(&project_dir)))
}

fn npm_search_cache() -> &'static Mutex<HashMap<NpmSearchCacheKey, NpmSearchCacheEntry>> {
    static CACHE: OnceLock<Mutex<HashMap<NpmSearchCacheKey, NpmSearchCacheEntry>>> =
        OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn get_inventory(project_dir: Option<String>) -> Result<PiInventory, String> {
    let project = project_dir
        .as_deref()
        .map(validate_project_dir)
        .transpose()?;
    if let Some(project) = &project {
        crate::settings::set_recent_pi_project_dir(Some(path_string(project)))
            .map_err(|error| error.to_string())?;
    }
    Ok(get_scoped_inventory(project.as_deref()))
}

fn get_scoped_inventory(project_dir: Option<&Path>) -> PiInventory {
    let global_dir = crate::pi_config::get_pi_dir();
    get_scoped_inventory_in_dirs(&global_dir, project_dir)
}

fn get_scoped_inventory_in_dirs(global_dir: &Path, project_dir: Option<&Path>) -> PiInventory {
    let mut global = get_inventory_in_dir(global_dir, PiExtensionScope::Global, None);
    let mut runtimes = vec![global.runtime.clone()];
    let mut project_trust = None;
    if let Some(project_dir) = project_dir {
        let trust = get_project_trust_in_dir(global_dir, project_dir);
        project_trust = Some(trust.clone());
        let project_pi_dir = crate::pi_config::get_project_pi_dir(project_dir);
        let project_dir_string = path_string(project_dir);
        let mut project = get_inventory_in_dir(
            &project_pi_dir,
            PiExtensionScope::Project,
            Some(project_dir_string.clone()),
        );
        project.runtime.mutable &= trust.trusted;
        if !trust.trusted {
            project.runtime.error = Some("项目未受信任，Pi 项目资源不会加载".to_string());
            project.extensions.clear();
            project.packages.clear();
        }
        runtimes.push(project.runtime.clone());
        global.extensions.extend(project.extensions);
        global.packages.extend(project.packages);
    }
    apply_package_scope_precedence(&mut global.extensions, &mut global.packages);
    mark_conflicts(&mut global.extensions);
    sync_package_extensions(&global.extensions, &mut global.packages);
    global.runtimes = runtimes;
    global.project_dir = project_dir.map(path_string);
    global.project_trust = project_trust;
    global
}

fn get_inventory_for_target(pi_dir: &Path, project_dir: Option<&Path>) -> PiInventory {
    match project_dir {
        Some(project_dir) => get_scoped_inventory(Some(project_dir)),
        None => get_scoped_inventory_in_dirs(pi_dir, None),
    }
}

fn get_inventory_in_dir(
    pi_dir: &Path,
    scope: PiExtensionScope,
    project_dir: Option<String>,
) -> PiInventory {
    let settings_path = pi_dir.join("settings.json");
    let cli = locate_pi_cli();
    let snapshot = read_settings(&settings_path);
    let mut runtime = PiRuntimeStatus {
        scope,
        project_dir: project_dir.clone(),
        pi_dir: path_string(pi_dir),
        settings_path: path_string(&settings_path),
        cli_available: cli.is_some(),
        cli_path: cli.as_ref().map(|value| path_string(&value.path)),
        cli_version: cli.as_ref().map(|value| value.version.clone()),
        mutable: snapshot.root.is_ok(),
        error: snapshot.root.as_ref().err().cloned(),
    };
    let Ok(root) = snapshot.root else {
        return PiInventory {
            runtimes: vec![runtime.clone()],
            runtime,
            project_dir,
            project_trust: None,
            extensions: Vec::new(),
            packages: Vec::new(),
        };
    };
    let mut extensions = scan_standalone_extensions(pi_dir, &root, scope, project_dir.as_deref());
    let mut packages = parse_packages(pi_dir, &root, scope, project_dir.as_deref());
    for package in &packages {
        extensions.extend(package.extensions.clone());
    }
    mark_conflicts(&mut extensions);
    let extensions_by_id: HashMap<&str, &PiExtensionResource> = extensions
        .iter()
        .map(|extension| (extension.id.as_str(), extension))
        .collect();
    for package in &mut packages {
        for extension in &mut package.extensions {
            if let Some(current) = extensions_by_id.get(extension.id.as_str()) {
                *extension = (*current).clone();
            }
        }
        if package
            .extensions
            .iter()
            .any(|extension| extension.enabled && extension.status == "conflict")
        {
            package.status = "conflict".to_string();
        }
    }
    runtime.mutable = true;
    PiInventory {
        runtimes: vec![runtime.clone()],
        runtime,
        project_dir,
        project_trust: None,
        extensions,
        packages,
    }
}

fn read_settings(path: &Path) -> SettingsSnapshot {
    let snapshot = match snapshot_file(path) {
        Ok(snapshot) => snapshot,
        Err(error) => {
            return SettingsSnapshot {
                bytes: None,
                permissions: None,
                root: Err(error),
            };
        }
    };
    let root = match &snapshot.bytes {
        None => Ok(Map::new()),
        Some(bytes) => serde_json::from_slice::<Value>(bytes)
            .map_err(|error| format!("Pi settings.json JSON 无效: {error}"))
            .and_then(|value| {
                value
                    .as_object()
                    .cloned()
                    .ok_or_else(|| "Pi settings.json 根节点必须是对象".to_string())
            })
            .and_then(validate_settings_root),
    };
    SettingsSnapshot {
        bytes: snapshot.bytes,
        permissions: snapshot.permissions,
        root,
    }
}

fn validate_settings_root(root: Map<String, Value>) -> Result<Map<String, Value>, String> {
    if let Some(extensions) = root.get("extensions") {
        let entries = extensions
            .as_array()
            .ok_or_else(|| "Pi settings extensions 必须是数组".to_string())?;
        if entries.iter().any(|entry| !entry.is_string()) {
            return Err("Pi settings extensions entry 必须是字符串".to_string());
        }
    }
    if let Some(packages) = root.get("packages") {
        let entries = packages
            .as_array()
            .ok_or_else(|| "Pi settings packages 必须是数组".to_string())?;
        for entry in entries {
            match entry {
                Value::String(_) => {}
                Value::Object(object) if object.get("source").is_some_and(Value::is_string) => {}
                Value::Object(_) => {
                    return Err("Pi settings package object source 必须是字符串".to_string());
                }
                _ => {
                    return Err(
                        "Pi settings package entry 必须是字符串或包含 source 的对象".to_string()
                    );
                }
            }
        }
    }
    Ok(root)
}

fn scan_standalone_extensions(
    pi_dir: &Path,
    root: &Map<String, Value>,
    scope: PiExtensionScope,
    project_dir: Option<&str>,
) -> Vec<PiExtensionResource> {
    let mut candidates: Vec<(PathBuf, String)> = Vec::new();
    let auto_dir = pi_dir.join("extensions");
    if let Ok(entries) = fs::read_dir(&auto_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let metadata = match fs::symlink_metadata(&path) {
                Ok(metadata) if !metadata.file_type().is_symlink() => metadata,
                _ => continue,
            };
            if metadata.is_file() && is_script_extension(&path) {
                candidates.push((path, "auto".to_string()));
            } else if metadata.is_dir() {
                for file in ["index.ts", "index.js"] {
                    let index = path.join(file);
                    if fs::symlink_metadata(&index).is_ok_and(|metadata| {
                        metadata.is_file() && !metadata.file_type().is_symlink()
                    }) {
                        candidates.push((index, "auto".to_string()));
                        break;
                    }
                }
            }
        }
    }
    let explicit = root.get("extensions").and_then(Value::as_array);
    if let Some(entries) = explicit {
        for entry in entries {
            let Some(raw) = entry.as_str() else {
                continue;
            };
            let value = raw.strip_prefix(['+', '-']).unwrap_or(raw);
            let path = resolve_extension_path(pi_dir, value);
            if !candidates
                .iter()
                .any(|(candidate, _)| same_path(candidate, &path))
            {
                candidates.push((path, "local".to_string()));
            }
        }
    }
    candidates
        .into_iter()
        .map(|(path, origin)| {
            let display_path = path_string(&path);
            let resource_key = stable_id(&origin, &display_path, &display_path);
            let enabled = extension_enabled(explicit, pi_dir, &path, true);
            let exists = path.is_file();
            let analysis = analyze_extension(&path);
            PiExtensionResource {
                id: scoped_id(scope, &resource_key),
                resource_key,
                scope,
                project_dir: project_dir.map(str::to_string),
                name: extension_name(&path),
                path: display_path,
                enabled,
                origin: origin.clone(),
                source_type: if origin == "auto" { "auto" } else { "local" }.to_string(),
                package_id: None,
                package_source: None,
                version: None,
                status: if !exists {
                    "missing"
                } else if enabled {
                    "active"
                } else {
                    "disabled"
                }
                .to_string(),
                error: None,
                registrations: analysis.registrations,
                analysis_complete: analysis.complete,
                conflicts: Vec::new(),
            }
        })
        .collect()
}

fn parse_packages(
    pi_dir: &Path,
    root: &Map<String, Value>,
    scope: PiExtensionScope,
    project_dir: Option<&str>,
) -> Vec<PiInstalledPackage> {
    let Some(entries) = root.get("packages").and_then(Value::as_array) else {
        return Vec::new();
    };
    entries
        .iter()
        .enumerate()
        .map(|(index, entry)| parse_package(pi_dir, index, entry, scope, project_dir))
        .collect()
}

fn parse_package(
    pi_dir: &Path,
    index: usize,
    entry: &Value,
    scope: PiExtensionScope,
    project_dir: Option<&str>,
) -> PiInstalledPackage {
    let source = package_source(entry).unwrap_or_default().to_string();
    let source_type = package_source_type(&source).to_string();
    let resource_key = package_identity(pi_dir, &source);
    let package_id = scoped_id(
        scope,
        &stable_id("package", &resource_key, &index.to_string()),
    );
    let installed = find_installed_package(pi_dir, &source);
    let mut error = None;
    if source.is_empty() {
        error = Some("package entry 缺少 source".to_string());
    }
    let manifest = installed
        .as_ref()
        .and_then(|path| read_json_object(&path.join("package.json")).ok());
    let display_name = manifest
        .as_ref()
        .and_then(|value| value.get("name"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| package_display_name(&source));
    let version = manifest
        .as_ref()
        .and_then(|value| value.get("version"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let resources = installed
        .as_ref()
        .map(|path| package_resources(path, manifest.as_ref()))
        .unwrap_or_default();
    let filters = entry.as_object();
    let mut extensions = Vec::new();
    for resource in &resources.extensions {
        let enabled = package_extension_enabled(filters, &resource.relative);
        let display_path = resource
            .path
            .as_ref()
            .map(|path| path_string(path))
            .unwrap_or_else(|| {
                installed
                    .as_ref()
                    .map(|path| path_string(&path.join(&resource.relative)))
                    .unwrap_or_else(|| resource.relative.clone())
            });
        let resource_error = resource.error.clone();
        let analysis = resource
            .path
            .as_ref()
            .map(|path| analyze_extension(path))
            .unwrap_or_default();
        extensions.push(PiExtensionResource {
            id: scoped_id(
                scope,
                &stable_id("package", &resource_key, &resource.relative),
            ),
            resource_key: stable_id("package", &resource_key, &resource.relative),
            scope,
            project_dir: project_dir.map(str::to_string),
            name: resource
                .path
                .as_ref()
                .map(|path| extension_name(path))
                .unwrap_or_else(|| package_display_name(&resource.relative)),
            path: display_path.clone(),
            enabled,
            origin: "package".to_string(),
            source_type: source_type.clone(),
            package_id: Some(package_id.clone()),
            package_source: Some(source.clone()),
            version: version.clone(),
            status: if resource_error.is_some() {
                "invalid"
            } else if resource.path.as_ref().is_some_and(|path| path.is_file()) {
                if enabled {
                    "active"
                } else {
                    "disabled"
                }
            } else {
                "missing"
            }
            .to_string(),
            error: resource_error,
            registrations: analysis.registrations,
            analysis_complete: analysis.complete,
            conflicts: Vec::new(),
        });
    }
    let resource_error = resources
        .extensions
        .iter()
        .chain(&resources.skills)
        .chain(&resources.prompts)
        .chain(&resources.themes)
        .find_map(|resource| resource.error.clone());
    let status = if source.is_empty()
        || (installed.is_some() && manifest.is_none())
        || resource_error.is_some()
    {
        "invalid"
    } else if installed.is_none() {
        "missing"
    } else {
        "installed"
    };
    if installed.is_some() && manifest.is_none() {
        error = Some("已安装目录缺少有效 package.json".to_string());
    } else if resource_error.is_some() {
        error = resource_error;
    }
    PiInstalledPackage {
        id: package_id,
        resource_key,
        scope,
        project_dir: project_dir.map(str::to_string),
        source,
        source_type,
        display_name,
        version,
        installed_path: installed.as_ref().map(|path| path_string(path)),
        status: status.to_string(),
        extension_count: resources.extensions.len(),
        skill_count: resources.skills.len(),
        prompt_count: resources.prompts.len(),
        theme_count: resources.themes.len(),
        extensions,
        error,
        autoload: filters
            .and_then(|object| object.get("autoload"))
            .and_then(Value::as_bool)
            .unwrap_or(true),
        entry: entry.clone(),
    }
}

#[derive(Default)]
struct PackageResources {
    extensions: Vec<PackageResource>,
    skills: Vec<PackageResource>,
    prompts: Vec<PackageResource>,
    themes: Vec<PackageResource>,
}

fn package_resources(path: &Path, manifest: Option<&Map<String, Value>>) -> PackageResources {
    let mut resources = PackageResources::default();
    let canonical_root = match fs::canonicalize(path) {
        Ok(root) => root,
        Err(error) => {
            resources.extensions.push(PackageResource {
                relative: String::new(),
                path: None,
                error: Some(format!("解析 package 安装根失败: {error}")),
            });
            return resources;
        }
    };
    let pi_value = manifest.and_then(|value| value.get("pi"));
    let pi = pi_value.and_then(Value::as_object);
    if pi_value.is_some() && pi.is_none() {
        resources.extensions.push(PackageResource {
            relative: String::new(),
            path: None,
            error: Some("package manifest pi 必须是对象".to_string()),
        });
        return resources;
    }
    for (field, output) in [
        ("extensions", &mut resources.extensions),
        ("skills", &mut resources.skills),
        ("prompts", &mut resources.prompts),
        ("themes", &mut resources.themes),
    ] {
        if let Some(pi) = pi {
            if let Some(value) = pi.get(field) {
                collect_resource_values(path, &canonical_root, field, value, output);
            }
        } else {
            collect_conventional(path, &canonical_root, field, output);
        }
    }
    resources
}

fn collect_resource_values(
    root: &Path,
    canonical_root: &Path,
    field: &str,
    value: &Value,
    output: &mut Vec<PackageResource>,
) {
    let entries: Vec<&str> = match value {
        Value::Array(values) => {
            let Some(entries) = values.iter().map(Value::as_str).collect::<Option<Vec<_>>>() else {
                output.push(PackageResource {
                    relative: String::new(),
                    path: None,
                    error: Some("package manifest 资源 entry 必须是字符串".to_string()),
                });
                return;
            };
            entries
        }
        _ => {
            output.push(PackageResource {
                relative: String::new(),
                path: None,
                error: Some("package manifest 资源必须是字符串数组".to_string()),
            });
            return;
        }
    };
    collect_package_patterns(root, canonical_root, field, &entries, output);
}

fn collect_conventional(
    path: &Path,
    canonical_root: &Path,
    field: &str,
    output: &mut Vec<PackageResource>,
) {
    let dir = path.join(field);
    let dir_metadata = match fs::symlink_metadata(&dir) {
        Ok(metadata) if !metadata.file_type().is_symlink() && metadata.is_dir() => metadata,
        Ok(metadata) if metadata.file_type().is_symlink() => {
            output.push(PackageResource {
                relative: field.to_string(),
                path: None,
                error: Some(format!(
                    "package conventional 资源目录不允许使用 symlink: {field}"
                )),
            });
            return;
        }
        _ => return,
    };
    if dir_metadata.is_dir() {
        collect_package_patterns(path, canonical_root, field, &[field], output);
    }
}

fn collect_package_patterns(
    root: &Path,
    canonical_root: &Path,
    field: &str,
    patterns: &[&str],
    output: &mut Vec<PackageResource>,
) {
    let mut discovery = Vec::new();
    let mut overrides = Vec::new();
    for raw in patterns {
        let (prefix, pattern) = raw
            .chars()
            .next()
            .filter(|prefix| matches!(prefix, '!' | '+' | '-'))
            .map_or((None, *raw), |prefix| (Some(prefix), &raw[1..]));
        let pattern = pattern
            .strip_prefix("./")
            .unwrap_or(pattern)
            .replace('\\', "/");
        if pattern.trim().is_empty()
            || Path::new(&pattern).is_absolute()
            || Path::new(&pattern).components().any(|component| {
                matches!(
                    component,
                    Component::Prefix(_) | Component::RootDir | Component::ParentDir
                )
            })
        {
            output.push(PackageResource {
                relative: pattern,
                path: None,
                error: Some(format!("package manifest 资源路径无效: {raw}")),
            });
            continue;
        }
        if let Some(prefix) = prefix {
            overrides.push((prefix, pattern));
        } else {
            discovery.push(pattern);
        }
    }
    let mut discovered = BTreeMap::new();
    for entry in discovery {
        for path in discover_resource_entry(root, field, &entry) {
            let relative = path
                .strip_prefix(root)
                .map(|value| value.to_string_lossy().replace('\\', "/"))
                .unwrap_or_default();
            discovered.insert(relative, path);
        }
    }
    let paths: Vec<String> = discovered.keys().cloned().collect();
    let enabled = apply_resource_patterns(&paths, &overrides);
    for relative in enabled {
        let resolved = resolve_package_resource(root, canonical_root, &relative);
        if !output
            .iter()
            .any(|resource| resource.relative == resolved.relative)
        {
            output.push(resolved);
        }
    }
    output.sort_by(|left, right| left.relative.cmp(&right.relative));
}

fn discover_resource_entry(root: &Path, field: &str, entry: &str) -> Vec<PathBuf> {
    let has_glob = entry.contains(['*', '?', '[', '{']);
    if !has_glob {
        let path = root.join(entry);
        let Ok(metadata) = fs::symlink_metadata(&path) else {
            return Vec::new();
        };
        if metadata.file_type().is_symlink() {
            return Vec::new();
        }
        if metadata.is_file() {
            return resource_file_matches(field, &path)
                .then_some(path)
                .into_iter()
                .collect();
        }
        if metadata.is_dir() {
            return discover_resource_dir(&path, field);
        }
        return Vec::new();
    }
    let Ok(glob) = Glob::new(entry).map(|glob| glob.compile_matcher()) else {
        return Vec::new();
    };
    discover_resource_dir(root, field)
        .into_iter()
        .filter(|path| {
            path.strip_prefix(root)
                .is_ok_and(|relative| glob.is_match(relative.to_string_lossy().replace('\\', "/")))
        })
        .collect()
}

fn discover_resource_dir(dir: &Path, field: &str) -> Vec<PathBuf> {
    let mut builder = WalkBuilder::new(dir);
    builder
        .hidden(true)
        .follow_links(false)
        .git_ignore(true)
        .git_global(false)
        .git_exclude(false)
        .parents(false)
        .add_custom_ignore_filename(".fdignore");
    let mut files = Vec::new();
    for entry in builder.build().filter_map(Result::ok) {
        let path = entry.path();
        if path == dir
            || path
                .strip_prefix(dir)
                .into_iter()
                .flat_map(Path::components)
                .any(|component| component.as_os_str() == "node_modules")
            || entry
                .file_type()
                .is_none_or(|file_type| !file_type.is_file())
            || fs::symlink_metadata(path).is_ok_and(|metadata| metadata.file_type().is_symlink())
        {
            continue;
        }
        if field == "skills" {
            let name = path.file_name().and_then(|value| value.to_str());
            if name == Some("SKILL.md") {
                files.push(path.to_path_buf());
                continue;
            }
            if path.parent() == Some(dir)
                && path.extension().and_then(|value| value.to_str()) == Some("md")
            {
                files.push(path.to_path_buf());
            }
            continue;
        }
        if field == "extensions" {
            let parent = path.parent().unwrap_or(dir);
            let name = path.file_name().and_then(|value| value.to_str());
            if parent == dir && is_script_extension(path)
                || matches!(name, Some("index.ts") | Some("index.js"))
                    && parent.parent() == Some(dir)
            {
                files.push(path.to_path_buf());
            }
            continue;
        }
        if resource_file_matches(field, path) {
            files.push(path.to_path_buf());
        }
    }
    files
}

fn apply_resource_patterns(paths: &[String], overrides: &[(char, String)]) -> Vec<String> {
    let excludes: Vec<String> = overrides
        .iter()
        .filter(|(prefix, _)| *prefix == '!')
        .map(|(_, pattern)| pattern.clone())
        .collect();
    let force_includes: HashSet<&str> = overrides
        .iter()
        .filter(|(prefix, _)| *prefix == '+')
        .map(|(_, pattern)| pattern.as_str())
        .collect();
    let force_excludes: HashSet<&str> = overrides
        .iter()
        .filter(|(prefix, _)| *prefix == '-')
        .map(|(_, pattern)| pattern.as_str())
        .collect();
    let exclude_set =
        build_glob_set(&excludes).unwrap_or_else(|_| GlobSetBuilder::new().build().unwrap());
    paths
        .iter()
        .filter(|path| {
            let mut enabled = !exclude_set.is_match(path);
            if force_includes.contains(path.as_str()) {
                enabled = true;
            }
            if force_excludes.contains(path.as_str()) {
                enabled = false;
            }
            enabled
        })
        .cloned()
        .collect()
}

fn build_glob_set(patterns: &[String]) -> Result<GlobSet, globset::Error> {
    let mut builder = GlobSetBuilder::new();
    for pattern in patterns {
        builder.add(Glob::new(pattern)?);
    }
    builder.build()
}

fn resource_file_matches(field: &str, path: &Path) -> bool {
    match field {
        "extensions" => is_script_extension(path),
        "skills" => path.extension().and_then(|value| value.to_str()) == Some("md"),
        "prompts" => path.extension().and_then(|value| value.to_str()) == Some("md"),
        "themes" => path.extension().and_then(|value| value.to_str()) == Some("json"),
        _ => false,
    }
}

fn resolve_package_resource(root: &Path, canonical_root: &Path, value: &str) -> PackageResource {
    let normalized = value.replace('\\', "/");
    let invalid_component = Path::new(value).components().any(|component| {
        matches!(
            component,
            Component::Prefix(_) | Component::RootDir | Component::ParentDir
        )
    });
    if value.trim().is_empty() || invalid_component || Path::new(value).is_absolute() {
        return PackageResource {
            relative: normalized,
            path: None,
            error: Some(format!("package manifest 资源路径无效: {value}")),
        };
    }
    let target = root.join(value);
    let mut current = root.to_path_buf();
    for component in Path::new(value).components() {
        let Component::Normal(component) = component else {
            continue;
        };
        current.push(component);
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return PackageResource {
                    relative: normalized,
                    path: None,
                    error: Some(format!("package 资源路径包含 symlink: {value}")),
                };
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
            Err(error) => {
                return PackageResource {
                    relative: normalized,
                    path: None,
                    error: Some(format!("检查 package 资源路径失败 {value}: {error}")),
                };
            }
        }
    }
    match fs::canonicalize(&target) {
        Ok(canonical) if canonical.starts_with(canonical_root) => PackageResource {
            relative: normalized,
            path: Some(canonical),
            error: None,
        },
        Ok(_) => PackageResource {
            relative: normalized,
            path: None,
            error: Some(format!("package 资源路径逃逸安装根: {value}")),
        },
        Err(error) => PackageResource {
            relative: normalized,
            path: None,
            error: Some(format!("package 资源不存在或不可访问 {value}: {error}")),
        },
    }
}

fn find_installed_package(pi_dir: &Path, source: &str) -> Option<PathBuf> {
    if package_source_type(source) == "local" {
        let path = resolve_pi_path(pi_dir, source.strip_prefix("local:").unwrap_or(source));
        return path.is_dir().then_some(path);
    }
    let name = npm_package_name(source);
    if let Some(name) = name.as_ref() {
        let path = pi_dir.join("npm").join("node_modules").join(name);
        if path.is_dir() {
            return Some(path);
        }
    }
    for base in [pi_dir.join("npm"), pi_dir.join("git")] {
        if let Some(path) = scan_for_package_metadata(&base, source, name.as_deref()) {
            return Some(path);
        }
    }
    None
}

fn scan_for_package_metadata(base: &Path, source: &str, name: Option<&str>) -> Option<PathBuf> {
    let mut pending = vec![(base.to_path_buf(), 0usize)];
    while let Some((dir, depth)) = pending.pop() {
        if depth > 4 {
            continue;
        }
        let metadata = fs::symlink_metadata(&dir).ok()?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            continue;
        }
        let manifest_path = dir.join("package.json");
        if let Ok(manifest) = read_json_object(&manifest_path) {
            let manifest_name = manifest.get("name").and_then(Value::as_str);
            let repository = manifest
                .get("repository")
                .and_then(repository_string)
                .unwrap_or_default();
            if name.is_some_and(|name| manifest_name == Some(name))
                || !source.is_empty()
                    && ((!repository.is_empty()
                        && (repository.contains(source) || source.contains(repository)))
                        || dir
                            .to_string_lossy()
                            .contains(&package_display_name(source)))
            {
                return Some(dir);
            }
        }
        if let Ok(entries) = fs::read_dir(&dir) {
            pending.extend(
                entries
                    .flatten()
                    .map(|entry| entry.path())
                    .filter(|path| {
                        fs::symlink_metadata(path).is_ok_and(|metadata| {
                            metadata.is_dir() && !metadata.file_type().is_symlink()
                        })
                    })
                    .map(|path| (path, depth + 1)),
            );
        }
    }
    None
}

fn repository_string(value: &Value) -> Option<&str> {
    value
        .as_str()
        .or_else(|| value.get("url").and_then(Value::as_str))
}

fn analyze_extension(path: &Path) -> ExtensionAnalysis {
    let source = match fs::read_to_string(path) {
        Ok(source) => source,
        Err(_) => return ExtensionAnalysis::default(),
    };
    let source = strip_javascript_comments(&source);
    let mut registrations = Vec::new();
    let mut complete = true;
    for (method, kind) in [
        ("registerTool", "tool"),
        ("registerCommand", "command"),
        ("registerFlag", "flag"),
    ] {
        for arguments in extension_call_arguments(&source, method) {
            let name = if method == "registerTool" {
                registration_object_name(arguments)
            } else {
                leading_string_literal(arguments)
            };
            if let Some(name) = name {
                registrations.push(PiExtensionRegistration {
                    kind: kind.to_string(),
                    name,
                });
            } else {
                complete = false;
            }
        }
    }
    registrations.sort_by(|left, right| {
        left.kind
            .cmp(&right.kind)
            .then_with(|| left.name.cmp(&right.name))
    });
    registrations.dedup();
    ExtensionAnalysis {
        registrations,
        complete,
    }
}

fn strip_javascript_comments(source: &str) -> String {
    let bytes = source.as_bytes();
    let mut output = Vec::with_capacity(source.len());
    let mut index = 0;
    let mut quote = None;
    while index < bytes.len() {
        let byte = bytes[index];
        if let Some(delimiter) = quote {
            output.push(byte);
            if byte == b'\\' && index + 1 < bytes.len() {
                index += 1;
                output.push(bytes[index]);
            } else if byte == delimiter {
                quote = None;
            }
            index += 1;
            continue;
        }
        if matches!(byte, b'\'' | b'"' | b'`') {
            quote = Some(byte);
            output.push(byte);
            index += 1;
            continue;
        }
        if byte == b'/' && bytes.get(index + 1) == Some(&b'/') {
            index += 2;
            while index < bytes.len() && bytes[index] != b'\n' {
                index += 1;
            }
            output.push(b'\n');
            index += usize::from(index < bytes.len());
            continue;
        }
        if byte == b'/' && bytes.get(index + 1) == Some(&b'*') {
            index += 2;
            while index + 1 < bytes.len() && !(bytes[index] == b'*' && bytes[index + 1] == b'/') {
                output.push(if bytes[index] == b'\n' { b'\n' } else { b' ' });
                index += 1;
            }
            index = (index + 2).min(bytes.len());
            continue;
        }
        output.push(byte);
        index += 1;
    }
    String::from_utf8(output).unwrap_or_default()
}

fn extension_call_arguments<'a>(source: &'a str, method: &str) -> Vec<&'a str> {
    let mut arguments = Vec::new();
    let bytes = source.as_bytes();
    let mut start = 0;
    while start + method.len() <= bytes.len() {
        if matches!(bytes[start], b'\'' | b'"' | b'`') {
            let quote = bytes[start];
            start += 1;
            while start < bytes.len() {
                if bytes[start] == b'\\' {
                    start += 2;
                } else if bytes[start] == quote {
                    start += 1;
                    break;
                } else {
                    start += 1;
                }
            }
            continue;
        }
        if &bytes[start..start + method.len()] != method.as_bytes() {
            start += 1;
            continue;
        }
        let before = source.as_bytes().get(start.wrapping_sub(1)).copied();
        let after = source.as_bytes().get(start + method.len()).copied();
        if before.is_some_and(is_identifier_byte) || after.is_some_and(is_identifier_byte) {
            start += method.len();
            continue;
        }
        let mut open = start + method.len();
        while source
            .as_bytes()
            .get(open)
            .is_some_and(|byte| byte.is_ascii_whitespace())
        {
            open += 1;
        }
        if source.as_bytes().get(open) != Some(&b'(') {
            start += method.len();
            continue;
        }
        if let Some(close) = matching_delimiter(source, open, b'(', b')') {
            arguments.push(&source[open + 1..close]);
            start = close + 1;
        } else {
            break;
        }
    }
    arguments
}

fn matching_delimiter(source: &str, open: usize, left: u8, right: u8) -> Option<usize> {
    let bytes = source.as_bytes();
    let mut depth = 0;
    let mut quote = None;
    let mut index = open;
    while index < bytes.len() {
        let byte = bytes[index];
        if let Some(delimiter) = quote {
            if byte == b'\\' {
                index += 2;
                continue;
            }
            if byte == delimiter {
                quote = None;
            }
            index += 1;
            continue;
        }
        if matches!(byte, b'\'' | b'"' | b'`') {
            quote = Some(byte);
        } else if byte == left {
            depth += 1;
        } else if byte == right {
            depth -= 1;
            if depth == 0 {
                return Some(index);
            }
        }
        index += 1;
    }
    None
}

fn registration_object_name(arguments: &str) -> Option<String> {
    let object_start = arguments.find('{')?;
    let object_end = matching_delimiter(arguments, object_start, b'{', b'}')?;
    let object = &arguments[object_start + 1..object_end];
    let bytes = object.as_bytes();
    let mut index = 0;
    let mut depth = 0;
    while index + 4 <= bytes.len() {
        if matches!(bytes[index], b'\'' | b'"' | b'`') {
            let quote = bytes[index];
            index += 1;
            while index < bytes.len() {
                if bytes[index] == b'\\' {
                    index += 2;
                } else if bytes[index] == quote {
                    index += 1;
                    break;
                } else {
                    index += 1;
                }
            }
            continue;
        }
        match bytes[index] {
            b'{' | b'[' | b'(' => depth += 1,
            b'}' | b']' | b')' => depth -= 1,
            _ => {}
        }
        if depth == 0
            && &bytes[index..index + 4] == b"name"
            && bytes
                .get(index.wrapping_sub(1))
                .is_none_or(|byte| !is_identifier_byte(*byte))
            && bytes
                .get(index + 4)
                .is_none_or(|byte| !is_identifier_byte(*byte))
        {
            let after_name = &object[index + 4..];
            let colon = after_name.find(':')?;
            return leading_string_literal(&after_name[colon + 1..]);
        }
        index += 1;
    }
    None
}

fn leading_string_literal(value: &str) -> Option<String> {
    let value = value.trim_start();
    let quote = *value.as_bytes().first()?;
    if !matches!(quote, b'\'' | b'"' | b'`') {
        return None;
    }
    let bytes = value.as_bytes();
    let mut output = String::new();
    let mut index = 1;
    while index < bytes.len() {
        let byte = bytes[index];
        if byte == b'\\' {
            let escaped = *bytes.get(index + 1)?;
            output.push(escaped as char);
            index += 2;
        } else if byte == quote {
            return (!output.is_empty()).then_some(output);
        } else if quote == b'`' && byte == b'$' && bytes.get(index + 1) == Some(&b'{') {
            return None;
        } else {
            output.push(byte as char);
            index += 1;
        }
    }
    None
}

fn is_identifier_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'$')
}

fn mark_conflicts(extensions: &mut [PiExtensionResource]) {
    for extension in extensions.iter_mut() {
        extension.conflicts.clear();
        if extension.status == "conflict" {
            extension.status = if extension.enabled {
                "active".to_string()
            } else {
                "disabled".to_string()
            };
            extension.error = None;
        }
    }
    let enabled_indices: Vec<usize> = extensions
        .iter()
        .enumerate()
        .filter_map(|(index, extension)| extension.enabled.then_some(index))
        .collect();
    for left_position in 0..enabled_indices.len() {
        for right_position in left_position + 1..enabled_indices.len() {
            let left = enabled_indices[left_position];
            let right = enabled_indices[right_position];
            mark_pair_conflicts(extensions, left, right, true);
        }
    }
    let disabled_indices: Vec<usize> = extensions
        .iter()
        .enumerate()
        .filter_map(|(index, extension)| (!extension.enabled).then_some(index))
        .collect();
    for disabled in disabled_indices {
        for enabled in &enabled_indices {
            mark_pair_conflicts(extensions, disabled, *enabled, false);
        }
    }
}

fn mark_pair_conflicts(
    extensions: &mut [PiExtensionResource],
    left_index: usize,
    right_index: usize,
    active_conflict: bool,
) {
    let left_snapshot = extensions[left_index].clone();
    let right_snapshot = extensions[right_index].clone();
    let same_path = normalized_path(&left_snapshot.path) == normalized_path(&right_snapshot.path);
    if same_path {
        add_conflict(
            &mut extensions[left_index],
            &right_snapshot,
            "path",
            &left_snapshot.path,
        );
    }
    for registration in &left_snapshot.registrations {
        if right_snapshot.registrations.contains(registration) {
            add_conflict(
                &mut extensions[left_index],
                &right_snapshot,
                &registration.kind,
                &registration.name,
            );
        }
    }
    if same_path {
        add_conflict(
            &mut extensions[right_index],
            &left_snapshot,
            "path",
            &right_snapshot.path,
        );
    }
    for registration in &right_snapshot.registrations {
        if left_snapshot.registrations.contains(registration) {
            add_conflict(
                &mut extensions[right_index],
                &left_snapshot,
                &registration.kind,
                &registration.name,
            );
        }
    }
    if active_conflict {
        let left = &mut extensions[left_index];
        if !left.conflicts.is_empty() {
            left.status = "conflict".to_string();
            left.error = Some("扩展注册项与其他已启用扩展冲突".to_string());
        }
        let right = &mut extensions[right_index];
        if !right.conflicts.is_empty() {
            right.status = "conflict".to_string();
            right.error = Some("扩展注册项与其他已启用扩展冲突".to_string());
        }
    }
}

fn add_conflict(
    extension: &mut PiExtensionResource,
    other: &PiExtensionResource,
    kind: &str,
    name: &str,
) {
    let conflict = PiExtensionConflict {
        kind: kind.to_string(),
        name: name.to_string(),
        other_extension_id: other.id.clone(),
        other_extension_name: other.name.clone(),
        other_extension_path: other.path.clone(),
        other_extension_scope: other.scope,
    };
    if !extension.conflicts.contains(&conflict) {
        extension.conflicts.push(conflict);
    }
}

pub async fn search_packages(
    query: String,
    offset: Option<u32>,
    limit: Option<u32>,
    project_dir: Option<String>,
) -> Result<PiPackageSearchResult, String> {
    let query = query.trim().to_string();
    let offset = offset.unwrap_or(0);
    let limit = limit.unwrap_or(20).clamp(1, 50);
    let cache_key = npm_search_cache_key(&query, offset, limit);
    if let Some(mut result) = get_cached_npm_search(&cache_key, Instant::now()) {
        result.query = query;
        refresh_installed_status(&mut result, &get_inventory(project_dir)?);
        return Ok(result);
    }
    let response = crate::proxy::http_client::get()
        .get("https://registry.npmjs.org/-/v1/search")
        .query(&[
            ("text", format!("keywords:pi-package {query}")),
            ("from", offset.to_string()),
            ("size", limit.to_string()),
        ])
        .timeout(NPM_SEARCH_TIMEOUT)
        .send()
        .await
        .map_err(|error| format!("搜索 npm package 失败: {error}"))?
        .error_for_status()
        .map_err(|error| format!("npm registry 返回错误: {error}"))?;
    let response = read_limited_json(response, NPM_SEARCH_RESPONSE_LIMIT, "npm 搜索响应").await?;
    let raw_count = response
        .get("objects")
        .and_then(Value::as_array)
        .map_or(0, Vec::len);
    let registry_total = response.get("total").and_then(Value::as_u64);
    let candidates = map_npm_search_candidates(&response);
    let client = crate::proxy::http_client::get();
    let mut enriched = stream::iter(candidates.into_iter().enumerate().map(
        |(index, candidate)| {
            let client = client.clone();
            async move {
                let latest = fetch_npm_latest(&client, candidate.item.name.as_deref()).await;
                (index, apply_latest_manifest(candidate, latest))
            }
        },
    ))
    .buffer_unordered(NPM_LATEST_CONCURRENCY);
    let mut indexed_items = Vec::new();
    while let Some((index, item)) = enriched.next().await {
        if let Some(item) = item {
            indexed_items.push((index, item));
        }
    }
    indexed_items.sort_by_key(|(index, _)| *index);
    let items = indexed_items
        .into_iter()
        .map(|(_, item)| item)
        .collect::<Vec<_>>();
    let has_more = registry_total
        .map(|total| total > offset as u64 + raw_count as u64)
        .unwrap_or(raw_count >= limit as usize);
    let total = filtered_page_total(offset, limit, items.len(), has_more);
    let mut result = PiPackageSearchResult {
        items,
        total,
        query,
        offset,
        limit,
    };
    put_cached_npm_search(cache_key, result.clone(), Instant::now());
    refresh_installed_status(&mut result, &get_inventory(project_dir)?);
    Ok(result)
}

async fn read_limited_json(
    response: reqwest::Response,
    max_bytes: usize,
    label: &str,
) -> Result<Value, String> {
    if response
        .content_length()
        .is_some_and(|length| length > max_bytes as u64)
    {
        return Err(format!("{label}超过 {} 字节限制", max_bytes));
    }
    let mut bytes = Vec::new();
    let mut body = response.bytes_stream();
    while let Some(chunk) = body.next().await {
        let chunk = chunk.map_err(|error| format!("读取{label}失败: {error}"))?;
        if bytes.len().saturating_add(chunk.len()) > max_bytes {
            return Err(format!("{label}超过 {} 字节限制", max_bytes));
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|error| format!("解析{label}失败: {error}"))
}

async fn fetch_npm_latest(client: &reqwest::Client, name: Option<&str>) -> Result<Value, String> {
    let name = name.ok_or_else(|| "npm package 缺少名称".to_string())?;
    let url = npm_latest_url(name)?;
    let response = client
        .get(url)
        .timeout(NPM_LATEST_TIMEOUT)
        .send()
        .await
        .map_err(|error| format!("读取 npm latest 失败: {error}"))?
        .error_for_status()
        .map_err(|error| format!("npm latest 返回错误: {error}"))?;
    read_limited_json(response, NPM_LATEST_RESPONSE_LIMIT, "npm latest 响应").await
}

fn npm_latest_url(name: &str) -> Result<url::Url, String> {
    let mut url = url::Url::parse("https://registry.npmjs.org/")
        .map_err(|error| format!("构造 npm latest URL 失败: {error}"))?;
    url.path_segments_mut()
        .map_err(|_| "构造 npm latest URL 失败".to_string())?
        .push(name)
        .push("latest");
    Ok(url)
}

fn map_npm_search_candidates(response: &Value) -> Vec<NpmSearchCandidate> {
    let mut candidates = Vec::new();
    for object in response
        .get("objects")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let Some(package) = object.get("package") else {
            continue;
        };
        let keywords = normalized_keywords(package.get("keywords"));
        if !has_exact_pi_package_keyword(&keywords) {
            continue;
        }
        let name = package
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_string);
        let source = format!("npm:{}", name.clone().unwrap_or_default());
        let resource_types = resource_types_from_keywords(&keywords);
        candidates.push(NpmSearchCandidate {
            item: PiPackageCatalogItem {
                name,
                version: string_field(package, "version"),
                description: string_field(package, "description"),
                publisher: package
                    .get("publisher")
                    .and_then(|value| value.get("username").or_else(|| value.get("name")))
                    .and_then(Value::as_str)
                    .map(str::to_string),
                license: string_field(package, "license"),
                published_at: string_field(package, "date"),
                npm_url: package
                    .get("links")
                    .and_then(|value| value.get("npm"))
                    .and_then(Value::as_str)
                    .map(str::to_string),
                repository_url: package
                    .get("links")
                    .and_then(|value| value.get("repository"))
                    .and_then(Value::as_str)
                    .map(str::to_string),
                homepage_url: package
                    .get("links")
                    .and_then(|value| value.get("homepage"))
                    .and_then(Value::as_str)
                    .map(str::to_string),
                source,
                downloads: object
                    .get("downloads")
                    .and_then(|value| value.get("weekly"))
                    .and_then(Value::as_u64),
                resource_types,
                manifest_status: "unavailable".to_string(),
                installed: false,
            },
        });
    }
    candidates
}

fn apply_latest_manifest(
    mut candidate: NpmSearchCandidate,
    latest: Result<Value, String>,
) -> Option<PiPackageCatalogItem> {
    let latest = match latest {
        Ok(latest) => latest,
        Err(_) => return Some(candidate.item),
    };
    let keywords = normalized_keywords(latest.get("keywords"));
    if !has_exact_pi_package_keyword(&keywords) {
        return None;
    }
    candidate.item.resource_types = resource_types_from_manifest(&latest);
    candidate.item.manifest_status = "available".to_string();
    replace_if_present(
        &mut candidate.item.version,
        string_field(&latest, "version"),
    );
    replace_if_present(
        &mut candidate.item.description,
        string_field(&latest, "description"),
    );
    replace_if_present(
        &mut candidate.item.license,
        string_field(&latest, "license"),
    );
    replace_if_present(
        &mut candidate.item.repository_url,
        latest
            .get("repository")
            .and_then(repository_string)
            .map(str::to_string),
    );
    replace_if_present(
        &mut candidate.item.homepage_url,
        string_field(&latest, "homepage"),
    );
    Some(candidate.item)
}

fn resource_types_from_manifest(manifest: &Value) -> Vec<String> {
    let pi = manifest.get("pi").and_then(Value::as_object);
    ["extensions", "skills", "prompts", "themes"]
        .into_iter()
        .filter(|field| {
            pi.and_then(|value| value.get(*field))
                .is_some_and(|value| matches!(value, Value::String(_) | Value::Array(_)))
        })
        .map(str::to_string)
        .collect()
}

fn normalized_keywords(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::String(value)) => value
            .split(|character: char| character == ',' || character.is_whitespace())
            .filter(|value| !value.is_empty())
            .map(str::to_ascii_lowercase)
            .collect(),
        Some(Value::Array(values)) => values
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_ascii_lowercase)
            .collect(),
        _ => Vec::new(),
    }
}

fn has_exact_pi_package_keyword(keywords: &[String]) -> bool {
    keywords.iter().any(|keyword| keyword == "pi-package")
}

fn string_field(value: &Value, field: &str) -> Option<String> {
    value.get(field).and_then(Value::as_str).map(str::to_string)
}

fn replace_if_present(target: &mut Option<String>, value: Option<String>) {
    if value.is_some() {
        *target = value;
    }
}

fn filtered_page_total(offset: u32, limit: u32, item_count: usize, has_more: bool) -> u64 {
    if has_more {
        offset as u64 + limit as u64 + 1
    } else {
        offset as u64 + item_count as u64
    }
}

fn npm_search_cache_key(query: &str, offset: u32, limit: u32) -> NpmSearchCacheKey {
    NpmSearchCacheKey {
        query: query
            .split_whitespace()
            .map(str::to_ascii_lowercase)
            .collect::<Vec<_>>()
            .join(" "),
        offset,
        limit,
    }
}

fn npm_search_cache_entry_is_fresh(inserted_at: Instant, now: Instant) -> bool {
    now.checked_duration_since(inserted_at)
        .is_none_or(|age| age <= NPM_SEARCH_CACHE_TTL)
}

fn get_cached_npm_search(key: &NpmSearchCacheKey, now: Instant) -> Option<PiPackageSearchResult> {
    let mut cache = npm_search_cache().lock().ok()?;
    cache.retain(|_, entry| npm_search_cache_entry_is_fresh(entry.inserted_at, now));
    cache.get(key).map(|entry| entry.result.clone())
}

fn put_cached_npm_search(key: NpmSearchCacheKey, result: PiPackageSearchResult, now: Instant) {
    if let Ok(mut cache) = npm_search_cache().lock() {
        cache.retain(|_, entry| npm_search_cache_entry_is_fresh(entry.inserted_at, now));
        cache.insert(
            key,
            NpmSearchCacheEntry {
                inserted_at: now,
                result,
            },
        );
    }
}

fn refresh_installed_status(result: &mut PiPackageSearchResult, inventory: &PiInventory) {
    let installed: HashSet<String> = inventory
        .packages
        .iter()
        .map(|package| normalize_source(&package.source))
        .collect();
    for item in &mut result.items {
        item.installed = installed.contains(&normalize_source(&item.source));
    }
}

fn resource_types_from_keywords(keywords: &[String]) -> Vec<String> {
    ["extensions", "skills", "prompts", "themes"]
        .into_iter()
        .filter(|kind| {
            keywords.iter().any(|keyword| {
                keyword == *kind
                    || keyword == &kind[..kind.len() - 1]
                    || keyword == &format!("pi-{kind}")
            })
        })
        .map(str::to_string)
        .collect()
}

pub fn register_local_extension(
    path: String,
    scope: PiExtensionScope,
    project_dir: Option<String>,
) -> Result<PiInventory, String> {
    let (pi_dir, project) = scope_dir(scope, project_dir.as_deref())?;
    if let Some(project) = &project {
        validate_project_pi_dir(project, &pi_dir)?;
    }
    let registered = validate_local_extension_path(&path, &pi_dir)?;
    let expected_target = canonical_extension_target(&registered)?;
    mutate_settings_in_dir(&pi_dir, |pi_dir, root, _state| {
        let current_target = canonical_extension_target(&registered)?;
        if !same_path(&current_target, &expected_target) {
            return Err("本地扩展路径在注册期间发生变化".to_string());
        }
        let entries = extensions_array_mut(root)?;
        let exists = entries.iter().any(|entry| {
            entry
                .as_str()
                .map(|value| value.strip_prefix(['+', '-']).unwrap_or(value))
                .is_some_and(|value| {
                    same_path(&resolve_extension_path(pi_dir, value), &expected_target)
                })
        });
        if !exists {
            entries.push(Value::String(path_string(&registered)));
        }
        Ok(())
    })?;
    Ok(get_scoped_inventory(project.as_deref()))
}

pub fn unregister_local_extension(
    resource_key: String,
    scope: PiExtensionScope,
    project_dir: Option<String>,
) -> Result<PiInventory, String> {
    let (pi_dir, project) = scope_dir(scope, project_dir.as_deref())?;
    if let Some(project) = &project {
        validate_project_pi_dir(project, &pi_dir)?;
    }
    let inventory = get_scoped_inventory(project.as_deref());
    let extension = inventory
        .extensions
        .into_iter()
        .find(|extension| {
            extension.resource_key == resource_key
                && extension.scope == scope
                && extension.origin == "local"
        })
        .ok_or_else(|| "未找到可取消注册的 Pi extension".to_string())?;
    let registered = PathBuf::from(extension.path);
    let target = canonical_extension_target(&registered).ok();
    mutate_settings_in_dir(&pi_dir, |pi_dir, root, _state| {
        let Some(entries) = root.get_mut("extensions").and_then(Value::as_array_mut) else {
            return Ok(());
        };
        entries.retain(|entry| {
            let Some(value) = entry.as_str() else {
                return true;
            };
            let value = value.strip_prefix(['+', '-']).unwrap_or(value);
            let stored = resolve_extension_path(pi_dir, value);
            !same_path(&stored, &registered)
                && target
                    .as_ref()
                    .is_none_or(|target| !same_path(&stored, target))
        });
        Ok(())
    })?;
    Ok(get_scoped_inventory(project.as_deref()))
}

pub fn set_extension_enabled(
    resource_key: String,
    enabled: bool,
    scope: PiExtensionScope,
    project_dir: Option<String>,
) -> Result<PiInventory, String> {
    let (pi_dir, project) = scope_dir(scope, project_dir.as_deref())?;
    if let Some(project) = &project {
        validate_project_pi_dir(project, &pi_dir)?;
    }
    set_extension_enabled_in_dir(&pi_dir, scope, project.as_deref(), resource_key, enabled)
}

fn set_extension_enabled_in_dir(
    pi_dir: &Path,
    scope: PiExtensionScope,
    project_dir: Option<&Path>,
    resource_key: String,
    enabled: bool,
) -> Result<PiInventory, String> {
    let inventory = get_inventory_for_target(pi_dir, project_dir);
    if !inventory.runtime.mutable {
        return Err(inventory
            .runtime
            .error
            .unwrap_or_else(|| "Pi settings.json 不可修改".to_string()));
    }
    let extension = inventory
        .extensions
        .into_iter()
        .find(|extension| extension.resource_key == resource_key && extension.scope == scope)
        .ok_or_else(|| "未找到 Pi extension".to_string())?;
    if enabled && !extension.conflicts.is_empty() {
        let conflicts = extension
            .conflicts
            .iter()
            .map(|conflict| {
                format!(
                    "{} \"{}\" ({})",
                    conflict.kind, conflict.name, conflict.other_extension_name
                )
            })
            .collect::<Vec<_>>()
            .join(", ");
        return Err(format!("启用会产生 Pi 扩展注册冲突: {conflicts}"));
    }
    if extension.origin == "package" {
        toggle_package_extension_in_dir(pi_dir, &extension, enabled)?;
    } else {
        toggle_standalone_extension_in_dir(pi_dir, &extension, enabled)?;
    }
    Ok(get_inventory_for_target(pi_dir, project_dir))
}

fn toggle_standalone_extension_in_dir(
    pi_dir: &Path,
    extension: &PiExtensionResource,
    enabled: bool,
) -> Result<(), String> {
    let target = extension.path.clone();
    mutate_settings_in_dir(pi_dir, |pi_dir, root, _state| {
        let target_path = PathBuf::from(&target);
        let entries = extensions_array_mut(root)?;
        entries.retain(|entry| {
            let Some(raw) = entry.as_str() else {
                return true;
            };
            let value = raw.strip_prefix(['+', '-']).unwrap_or(raw);
            !same_path(&resolve_pi_path(pi_dir, value), &target_path)
        });
        entries.push(Value::String(format!(
            "{}{}",
            if enabled { "+" } else { "-" },
            path_for_settings(pi_dir, &target_path)
        )));
        Ok(())
    })
}

fn toggle_package_extension_in_dir(
    pi_dir: &Path,
    extension: &PiExtensionResource,
    enabled: bool,
) -> Result<(), String> {
    let source = extension
        .package_source
        .clone()
        .ok_or_else(|| "package extension 缺少 package source".to_string())?;
    if is_mcp_adapter_source(&source) {
        return Err("Pi MCP adapter 由 MCP 配置管理，禁止逐扩展启用或禁用".to_string());
    }
    let extension_path = extension.path.clone();
    mutate_settings_in_dir(pi_dir, |pi_dir, root, state| {
        let packages = root
            .get_mut("packages")
            .and_then(Value::as_array_mut)
            .ok_or_else(|| "Pi settings packages 必须是数组".to_string())?;
        let records: Vec<PackageRecord> = packages
            .iter()
            .enumerate()
            .filter_map(|(index, entry)| {
                package_source(entry).map(|value| PackageRecord {
                    index,
                    source: value.to_string(),
                    entry: entry.clone(),
                })
            })
            .filter(|record| normalize_source(&record.source) == normalize_source(&source))
            .collect();
        if records.len() != 1 {
            return Err("目标 package entry 不唯一或不存在".to_string());
        }
        let record = &records[0];
        let state_key = stable_id("package-entry", &record.source, &record.index.to_string());
        ensure_managed_entry_unchanged(state, &state_key, &record.entry)?;
        let installed = find_installed_package(pi_dir, &source)
            .ok_or_else(|| "目标 package 未安装".to_string())?;
        let canonical_installed = fs::canonicalize(&installed)
            .map_err(|error| format!("解析 package 根失败: {error}"))?;
        let target = PathBuf::from(&extension_path);
        let canonical_target = fs::canonicalize(&target)
            .map_err(|error| format!("解析 extension 路径失败: {error}"))?;
        let relative = canonical_target
            .strip_prefix(&canonical_installed)
            .map_err(|_| "extension 路径不属于目标 package".to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        let before = state
            .package_entries
            .get(&state_key)
            .map(|managed| managed.before.clone())
            .unwrap_or_else(|| record.entry.clone());
        let entry = &mut packages[record.index];
        if entry.is_string() {
            *entry = serde_json::json!({"source": source});
        }
        let object = entry
            .as_object_mut()
            .ok_or_else(|| "目标 package entry 必须是字符串或对象".to_string())?;
        let patterns = object
            .entry("extensions".to_string())
            .or_insert_with(|| Value::Array(Vec::new()))
            .as_array_mut()
            .ok_or_else(|| "package extensions filter 必须是数组".to_string())?;
        patterns.retain(|value| {
            value.as_str().is_none_or(|value| {
                value.strip_prefix(['!', '-', '+']).unwrap_or(value) != relative
            })
        });
        if enabled {
            patterns.push(Value::String(relative));
        } else {
            patterns.push(Value::String(format!("!{relative}")));
        }
        let manifest = read_json_object(&canonical_installed.join("package.json")).ok();
        let resources = package_resources(&canonical_installed, manifest.as_ref());
        let before_filters = before.as_object();
        let current_filters = entry.as_object();
        let restored = resources.extensions.iter().all(|resource| {
            package_extension_enabled(before_filters, &resource.relative)
                == package_extension_enabled(current_filters, &resource.relative)
        });
        if restored {
            *entry = before;
            state.package_entries.remove(&state_key);
        } else {
            state
                .package_entries
                .entry(state_key)
                .and_modify(|managed| managed.last_hash = value_hash(entry))
                .or_insert_with(|| ManagedPackageEntry {
                    before,
                    last_hash: value_hash(entry),
                });
        }
        Ok(())
    })
}

fn mutate_settings_in_dir(
    pi_dir: &Path,
    mutation: impl FnOnce(&Path, &mut Map<String, Value>, &mut ManagedState) -> Result<(), String>,
) -> Result<(), String> {
    mutate_settings_in_dir_with_writer(pi_dir, mutation, &mut FsSettingsWriter)
}

fn mutate_settings_in_dir_with_writer(
    pi_dir: &Path,
    mutation: impl FnOnce(&Path, &mut Map<String, Value>, &mut ManagedState) -> Result<(), String>,
    writer: &mut dyn SettingsWriter,
) -> Result<(), String> {
    let _process_guard = process_lock()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let _file_guard = PiWriteLock::acquire(pi_dir)?;
    let settings_path = pi_dir.join("settings.json");
    let state_path = pi_dir.join(STATE_FILE);
    let settings_snapshot = read_settings(&settings_path);
    let mut root = settings_snapshot.root?;
    let state_snapshot = snapshot_file(&state_path)?;
    let mut state = read_state_snapshot(&state_path, &state_snapshot)?;
    mutation(pi_dir, &mut root, &mut state)?;
    ensure_bytes_unchanged(&settings_path, settings_snapshot.bytes.as_deref())?;
    ensure_bytes_unchanged(&state_path, state_snapshot.bytes.as_deref())?;
    let settings_file_snapshot = FileSnapshot {
        bytes: settings_snapshot.bytes,
        permissions: settings_snapshot.permissions,
    };
    let mut written: Vec<(&Path, &FileSnapshot)> = Vec::new();
    let result = (|| {
        writer.write_json(&settings_path, &Value::Object(root))?;
        written.push((&settings_path, &settings_file_snapshot));
        if state.package_entries.is_empty() {
            if state_snapshot.bytes.is_some() {
                writer.remove(&state_path)?;
                written.push((&state_path, &state_snapshot));
            }
        } else {
            writer.write_json(
                &state_path,
                &serde_json::to_value(&state)
                    .map_err(|error| format!("序列化 Pi extension state 失败: {error}"))?,
            )?;
            written.push((&state_path, &state_snapshot));
        }
        Ok(())
    })();
    if let Err(error) = result {
        let mut rollback_error = None;
        for (path, snapshot) in written.into_iter().rev() {
            if let Err(restore_error) = restore_snapshot(path, snapshot) {
                rollback_error = Some(restore_error);
            }
        }
        return match rollback_error {
            Some(rollback_error) => Err(format!(
                "Pi extension 配置更新失败 ({error}); 回滚也失败 ({rollback_error})"
            )),
            None => Err(error),
        };
    }
    Ok(())
}

fn read_state_snapshot(path: &Path, snapshot: &FileSnapshot) -> Result<ManagedState, String> {
    let Some(bytes) = &snapshot.bytes else {
        return Ok(ManagedState {
            version: STATE_VERSION,
            ..ManagedState::default()
        });
    };
    let state: ManagedState = serde_json::from_slice(bytes)
        .map_err(|error| format!("Pi extension state JSON 无效 {}: {error}", path.display()))?;
    if state.version != STATE_VERSION {
        return Err(format!(
            "不支持的 Pi extension state 版本 {}",
            state.version
        ));
    }
    Ok(state)
}

#[cfg(test)]
fn read_state(path: &Path) -> Result<ManagedState, String> {
    let snapshot = snapshot_file(path)?;
    read_state_snapshot(path, &snapshot)
}

fn snapshot_file(path: &Path) -> Result<FileSnapshot, String> {
    match fs::read(path) {
        Ok(bytes) => {
            let permissions = fs::metadata(path)
                .map_err(|error| format!("读取 {} 权限失败: {error}", path.display()))?
                .permissions();
            Ok(FileSnapshot {
                bytes: Some(bytes),
                permissions: Some(permissions),
            })
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(FileSnapshot {
            bytes: None,
            permissions: None,
        }),
        Err(error) => Err(format!("读取 {} 失败: {error}", path.display())),
    }
}

fn restore_snapshot(path: &Path, snapshot: &FileSnapshot) -> Result<(), String> {
    match &snapshot.bytes {
        Some(bytes) => {
            atomic_write(path, bytes).map_err(|error| error.to_string())?;
            if let Some(permissions) = &snapshot.permissions {
                fs::set_permissions(path, permissions.clone())
                    .map_err(|error| format!("恢复 {} 权限失败: {error}", path.display()))?;
            }
            Ok(())
        }
        None => match fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("回滚删除 {} 失败: {error}", path.display())),
        },
    }
}

fn ensure_managed_entry_unchanged(
    state: &ManagedState,
    state_key: &str,
    entry: &Value,
) -> Result<(), String> {
    if state
        .package_entries
        .get(state_key)
        .is_some_and(|managed| value_hash(entry) != managed.last_hash)
    {
        return Err("目标 package entry 已在 StackFerry 外部修改，拒绝覆盖".to_string());
    }
    Ok(())
}

fn ensure_bytes_unchanged(path: &Path, expected: Option<&[u8]>) -> Result<(), String> {
    let current = match fs::read(path) {
        Ok(bytes) => Some(bytes),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(format!("重新读取 {} 失败: {error}", path.display())),
    };
    if current.as_deref() != expected {
        return Err(format!("Pi 配置并发修改冲突: {}", path.display()));
    }
    Ok(())
}

pub async fn install_package(
    source: String,
    scope: PiExtensionScope,
    project_dir: Option<String>,
) -> Result<PiPackageInstallResult, String> {
    reject_mcp_adapter_source(&source)?;
    let (pi_dir, project) = scope_dir(scope, project_dir.as_deref())?;
    if let Some(project) = &project {
        validate_project_pi_dir(project, &pi_dir)?;
    }
    let inventory =
        run_package_cli_in_scope(&pi_dir, project.as_deref(), "install", source.clone()).await?;
    isolate_new_package_conflicts_in_dir(&pi_dir, scope, project.as_deref(), &source, inventory)
}

pub async fn remove_package(
    resource_key: String,
    scope: PiExtensionScope,
    project_dir: Option<String>,
) -> Result<PiInventory, String> {
    let (pi_dir, project) = scope_dir(scope, project_dir.as_deref())?;
    if let Some(project) = &project {
        validate_project_pi_dir(project, &pi_dir)?;
    }
    let inventory = get_scoped_inventory(project.as_deref());
    let package = inventory
        .packages
        .into_iter()
        .find(|package| package.resource_key == resource_key && package.scope == scope)
        .ok_or_else(|| "未找到 Pi package".to_string())?;
    reject_mcp_adapter_source(&package.source)?;
    run_package_cli_in_scope(&pi_dir, project.as_deref(), "remove", package.source).await
}

pub(crate) async fn install_mcp_adapter() -> Result<PiInventory, String> {
    let pi_dir = crate::pi_config::get_pi_dir();
    let cli = locate_pi_cli().ok_or_else(|| "未找到可用的 Pi CLI".to_string())?;
    install_mcp_adapter_with(&pi_dir, &cli, CLI_TIMEOUT).await
}

fn isolate_new_package_conflicts_in_dir(
    pi_dir: &Path,
    scope: PiExtensionScope,
    project_dir: Option<&Path>,
    source: &str,
    inventory: PiInventory,
) -> Result<PiPackageInstallResult, String> {
    let conflicting = inventory
        .packages
        .iter()
        .find(|package| package.scope == scope && package_sources_match(&package.source, source))
        .map(|package| {
            package
                .extensions
                .iter()
                .filter(|extension| extension.enabled && extension.status == "conflict")
                .cloned()
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if conflicting.is_empty() {
        return Ok(PiPackageInstallResult {
            inventory,
            isolated_extensions: Vec::new(),
        });
    }
    for extension in &conflicting {
        toggle_package_extension_in_dir(pi_dir, extension, false)?;
    }
    let inventory = get_inventory_for_target(pi_dir, project_dir);
    let isolated_extensions = conflicting
        .iter()
        .filter_map(|isolated| {
            inventory
                .extensions
                .iter()
                .find(|extension| extension.id == isolated.id)
                .cloned()
        })
        .collect();
    Ok(PiPackageInstallResult {
        inventory,
        isolated_extensions,
    })
}

async fn install_mcp_adapter_with(
    pi_dir: &Path,
    cli: &PiCli,
    timeout: Duration,
) -> Result<PiInventory, String> {
    run_package_cli_with(
        pi_dir,
        cli,
        "install",
        crate::mcp::PI_MCP_ADAPTER_PACKAGE.to_string(),
        false,
        None,
        timeout,
    )
    .await
}

async fn run_package_cli_in_scope(
    pi_dir: &Path,
    project_dir: Option<&Path>,
    action: &str,
    source: String,
) -> Result<PiInventory, String> {
    validate_package_source(&source)?;
    let cli = locate_pi_cli().ok_or_else(|| "未找到可用的 Pi CLI".to_string())?;
    run_package_cli_with(
        pi_dir,
        &cli,
        action,
        source,
        project_dir.is_some(),
        project_dir,
        CLI_TIMEOUT,
    )
    .await
}

async fn run_package_cli_with(
    pi_dir: &Path,
    cli: &PiCli,
    action: &str,
    source: String,
    local: bool,
    project_dir: Option<&Path>,
    timeout: Duration,
) -> Result<PiInventory, String> {
    let pi_dir = pi_dir.to_path_buf();
    let cli = cli.clone();
    let action = action.to_string();
    let project_dir = project_dir.map(Path::to_path_buf);
    tokio::task::spawn_blocking(move || {
        run_package_cli_blocking(
            &pi_dir,
            &cli,
            &action,
            source,
            local,
            project_dir.as_deref(),
            timeout,
        )
    })
    .await
    .map_err(|error| format!("Pi CLI 任务失败: {error}"))?
}

fn run_package_cli_blocking(
    pi_dir: &Path,
    cli: &PiCli,
    action: &str,
    source: String,
    local: bool,
    project_dir: Option<&Path>,
    timeout: Duration,
) -> Result<PiInventory, String> {
    let _process_guard = process_lock()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let _file_guard = PiWriteLock::acquire(pi_dir)?;
    let before = get_inventory_for_target(pi_dir, project_dir);
    if !before.runtime.mutable {
        return Err(before
            .runtime
            .error
            .clone()
            .unwrap_or_else(|| "Pi settings.json 不可修改".to_string()));
    }
    let before_package = before
        .packages
        .iter()
        .find(|package| package_sources_match(&package.source, &source));
    if action == "install" && before_package.is_some() {
        return Err("目标 Pi package 已存在，install 无需执行".to_string());
    }
    if action == "remove" && before_package.is_none() {
        return Err("目标 Pi package 不存在，remove 无需执行".to_string());
    }
    let args = if local {
        vec![action, &source, "-l", "--approve"]
    } else {
        vec![action, &source]
    };
    let mut command = build_pi_command(cli, &args)?;
    command
        .env("PI_CODING_AGENT_DIR", pi_dir)
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(project_dir) = project_dir {
        command.current_dir(project_dir);
    }
    let output = run_bounded_command(command, timeout)?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Err(if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("Pi CLI 执行失败，exit code: {:?}", output.status.code())
        });
    }
    let after = get_inventory_for_target(pi_dir, project_dir);
    if !after.runtime.mutable {
        return Err(after
            .runtime
            .error
            .clone()
            .unwrap_or_else(|| "Pi CLI 修改后 settings.json 无效".to_string()));
    }
    let after_package = after
        .packages
        .iter()
        .find(|package| package_sources_match(&package.source, &source));
    let verified = match action {
        "install" => after_package.is_some_and(|package| {
            package.status == "installed" && package.installed_path.is_some()
        }),
        "remove" => after_package.is_none(),
        _ => false,
    };
    if !verified {
        return Err(format!(
            "Pi {action} 已退出 0，但目标 package 配置未发生预期变化"
        ));
    }
    Ok(after)
}

#[derive(Debug)]
struct BoundedOutput {
    status: ExitStatus,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
}

enum ReaderMessage {
    Chunk(bool, Vec<u8>),
    Done,
    Error(String),
}

fn run_bounded_command(mut command: Command, timeout: Duration) -> Result<BoundedOutput, String> {
    let mut child = command
        .spawn()
        .map_err(|error| format!("执行 Pi CLI 失败: {error}"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Pi CLI stdout 未连接".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Pi CLI stderr 未连接".to_string())?;
    let (sender, receiver) = mpsc::channel();
    spawn_output_reader(stdout, true, sender.clone());
    spawn_output_reader(stderr, false, sender);
    let deadline = Instant::now() + timeout;
    let mut stdout_bytes = Vec::new();
    let mut stderr_bytes = Vec::new();
    let mut readers_done = 0;
    loop {
        while let Ok(message) = receiver.try_recv() {
            match message {
                ReaderMessage::Chunk(is_stdout, bytes) => {
                    if stdout_bytes
                        .len()
                        .saturating_add(stderr_bytes.len())
                        .saturating_add(bytes.len())
                        > CLI_OUTPUT_LIMIT
                    {
                        kill_and_wait(&mut child);
                        return Err(format!("Pi CLI 输出超过 {CLI_OUTPUT_LIMIT} 字节限制"));
                    }
                    if is_stdout {
                        stdout_bytes.extend_from_slice(&bytes);
                    } else {
                        stderr_bytes.extend_from_slice(&bytes);
                    }
                }
                ReaderMessage::Done => readers_done += 1,
                ReaderMessage::Error(error) => {
                    kill_and_wait(&mut child);
                    return Err(error);
                }
            }
        }
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("等待 Pi CLI 失败: {error}"))?
        {
            while readers_done < 2 {
                if Instant::now() >= deadline {
                    return Ok(BoundedOutput {
                        status,
                        stdout: stdout_bytes,
                        stderr: stderr_bytes,
                    });
                }
                match receiver.recv_timeout(Duration::from_millis(50)) {
                    Ok(ReaderMessage::Chunk(is_stdout, bytes)) => {
                        if stdout_bytes
                            .len()
                            .saturating_add(stderr_bytes.len())
                            .saturating_add(bytes.len())
                            > CLI_OUTPUT_LIMIT
                        {
                            return Err(format!("Pi CLI 输出超过 {CLI_OUTPUT_LIMIT} 字节限制"));
                        }
                        if is_stdout {
                            stdout_bytes.extend_from_slice(&bytes);
                        } else {
                            stderr_bytes.extend_from_slice(&bytes);
                        }
                    }
                    Ok(ReaderMessage::Done) => readers_done += 1,
                    Ok(ReaderMessage::Error(error)) => return Err(error),
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                }
            }
            return Ok(BoundedOutput {
                status,
                stdout: stdout_bytes,
                stderr: stderr_bytes,
            });
        }
        if Instant::now() >= deadline {
            kill_and_wait(&mut child);
            return Err("Pi CLI 执行超时".to_string());
        }
        thread::sleep(Duration::from_millis(10));
    }
}

fn spawn_output_reader(
    mut reader: impl Read + Send + 'static,
    is_stdout: bool,
    sender: mpsc::Sender<ReaderMessage>,
) {
    thread::spawn(move || {
        let mut buffer = [0u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    let _ = sender.send(ReaderMessage::Done);
                    return;
                }
                Ok(length) => {
                    if sender
                        .send(ReaderMessage::Chunk(is_stdout, buffer[..length].to_vec()))
                        .is_err()
                    {
                        return;
                    }
                }
                Err(error) => {
                    let _ = sender.send(ReaderMessage::Error(format!(
                        "读取 Pi CLI 输出失败: {error}"
                    )));
                    return;
                }
            }
        }
    });
}

fn kill_and_wait(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

fn build_pi_command(cli: &PiCli, args: &[&str]) -> Result<Command, String> {
    match &cli.kind {
        PiCliKind::Direct => {
            let mut command = Command::new(&cli.path);
            command.args(args);
            configure_windows_command(&mut command);
            Ok(command)
        }
        #[cfg(target_os = "windows")]
        PiCliKind::NodeScript(script) => {
            let mut command = Command::new("node");
            command.arg(script).args(args);
            configure_windows_command(&mut command);
            Ok(command)
        }
        #[cfg(target_os = "windows")]
        PiCliKind::WindowsCmd => build_windows_cmd_command(&cli.path, args),
    }
}

#[cfg(target_os = "windows")]
fn configure_windows_command(command: &mut Command) {
    command.creation_flags(0x08000000);
}

#[cfg(not(target_os = "windows"))]
fn configure_windows_command(_command: &mut Command) {}

#[cfg(target_os = "windows")]
fn build_windows_cmd_command(cli: &Path, args: &[&str]) -> Result<Command, String> {
    for value in std::iter::once(cli.to_string_lossy().as_ref()).chain(args.iter().copied()) {
        if value.contains(['&', '|', '<', '>', '^', '%', '\r', '\n', '\0', '"']) {
            return Err("Pi CLI 参数包含无法安全传递给 cmd.exe 的控制字符".to_string());
        }
    }
    let mut invocation = windows_cmd_quote(&cli.to_string_lossy());
    for arg in args {
        invocation.push(' ');
        invocation.push_str(&windows_cmd_quote(arg));
    }
    let mut command = Command::new("cmd.exe");
    command.args(["/D", "/S", "/C"]);
    command.raw_arg(format!(" \"{invocation}\""));
    command.creation_flags(0x08000000);
    Ok(command)
}

#[cfg(target_os = "windows")]
fn windows_cmd_quote(value: &str) -> String {
    format!("\"{value}\"")
}

fn locate_pi_cli() -> Option<PiCli> {
    locate_pi_cli_in_dirs(cli_search_dirs())
}

fn cli_search_dirs() -> Vec<PathBuf> {
    let mut search_dirs = Vec::new();
    if let Some(path) = std::env::var_os("PATH") {
        search_dirs.extend(std::env::split_paths(&path));
    }
    if let Some(home) = dirs::home_dir() {
        search_dirs.extend([
            home.join(".local/bin"),
            home.join(".npm-global/bin"),
            home.join(".volta/bin"),
            home.join(".bun/bin"),
        ]);
    }
    #[cfg(target_os = "macos")]
    search_dirs.extend([
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
    ]);
    #[cfg(target_os = "windows")]
    {
        if let Some(appdata) = dirs::data_dir() {
            search_dirs.push(appdata.join("npm"));
        }
        if let Some(value) = std::env::var_os("PNPM_HOME") {
            search_dirs.push(PathBuf::from(value));
        }
    }
    search_dirs
}

fn locate_pi_cli_in_dirs(search_dirs: Vec<PathBuf>) -> Option<PiCli> {
    for dir in search_dirs {
        #[cfg(target_os = "windows")]
        let candidates = vec![dir.join("pi.cmd"), dir.join("pi.exe")];
        #[cfg(not(target_os = "windows"))]
        let candidates = vec![dir.join("pi")];
        for path in candidates {
            if !path.is_file() {
                continue;
            }
            let kind = resolve_cli_kind(&path);
            let candidate = PiCli {
                path,
                kind,
                version: String::new(),
            };
            if let Some(version) = cli_version(&candidate) {
                return Some(PiCli {
                    version,
                    ..candidate
                });
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn resolve_cli_kind(path: &Path) -> PiCliKind {
    if path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("cmd") || value.eq_ignore_ascii_case("bat"))
    {
        let script = path
            .parent()
            .map(|parent| parent.join("node_modules/@earendil-works/pi-coding-agent/dist/cli.js"))
            .filter(|script| script.is_file());
        return script.map_or(PiCliKind::WindowsCmd, PiCliKind::NodeScript);
    }
    PiCliKind::Direct
}

#[cfg(not(target_os = "windows"))]
fn resolve_cli_kind(_path: &Path) -> PiCliKind {
    PiCliKind::Direct
}

fn cli_version(cli: &PiCli) -> Option<String> {
    let mut command = build_pi_command(cli, &["--version"]).ok()?;
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let output = run_bounded_command(command, CLI_PROBE_TIMEOUT).ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let version = if stdout.is_empty() { stderr } else { stdout };
    (!version.is_empty()).then_some(version)
}

fn validate_package_source(source: &str) -> Result<(), String> {
    if source.trim().is_empty() || source.contains(['\n', '\r', '\0']) || source != source.trim() {
        return Err("Pi package source 无效".to_string());
    }
    #[cfg(target_os = "windows")]
    if source.contains(['&', '|', '<', '>', '^', '"']) {
        return Err("Pi package source 包含 Windows 命令控制字符".to_string());
    }
    if source
        .strip_prefix("local:")
        .is_some_and(|path| !path.trim().is_empty())
    {
        return Ok(());
    }
    let path_source = source;
    if Path::new(path_source).is_absolute()
        || path_source == "~"
        || path_source.starts_with("~/")
        || path_source.starts_with("~\\")
        || path_source.starts_with("./")
        || path_source.starts_with(".\\")
        || path_source.starts_with("../")
        || path_source.starts_with("..\\")
    {
        return Ok(());
    }
    if source.starts_with("npm:")
        || source.starts_with("git:")
        || source.starts_with("https://")
        || source.starts_with("http://")
        || source.starts_with("ssh://")
        || source.starts_with("git@")
    {
        return Ok(());
    }
    Err("Pi package source 仅支持 npm、git、https/ssh 或本地路径".to_string())
}

fn resolve_input_path(path: &str, base_dir: &Path) -> Result<PathBuf, String> {
    if path.trim().is_empty() || path.contains(['\n', '\r', '\0']) || path != path.trim() {
        return Err("Pi extension path 无效".to_string());
    }
    let path = expand_home_path(path);
    Ok(if path.is_absolute() {
        path
    } else {
        base_dir.join(path)
    })
}

fn validate_local_extension_path(path: &str, base_dir: &Path) -> Result<PathBuf, String> {
    let path = resolve_input_path(path, base_dir)?;
    let metadata =
        fs::symlink_metadata(&path).map_err(|error| format!("读取本地扩展路径失败: {error}"))?;
    if metadata.file_type().is_symlink() {
        return Err("本地扩展不允许使用 symlink 文件或目录".to_string());
    }
    if metadata.is_file() {
        if !is_script_extension(&path) {
            return Err("本地扩展文件必须是 .ts 或 .js".to_string());
        }
    } else if metadata.is_dir() {
        let index = ["index.ts", "index.js"]
            .into_iter()
            .map(|name| path.join(name))
            .find(|candidate| {
                fs::symlink_metadata(candidate)
                    .is_ok_and(|metadata| metadata.is_file() && !metadata.file_type().is_symlink())
            })
            .ok_or_else(|| "本地扩展目录必须包含非 symlink 的 index.ts 或 index.js".to_string())?;
        let canonical_dir =
            fs::canonicalize(&path).map_err(|error| format!("解析本地扩展目录失败: {error}"))?;
        let canonical_index =
            fs::canonicalize(index).map_err(|error| format!("解析本地扩展入口失败: {error}"))?;
        if !canonical_index.starts_with(&canonical_dir) {
            return Err("本地扩展入口逃逸目录".to_string());
        }
    } else {
        return Err("本地扩展必须是文件或目录".to_string());
    }
    fs::canonicalize(&path).map_err(|error| format!("解析本地扩展路径失败: {error}"))
}

fn canonical_extension_target(registered: &Path) -> Result<PathBuf, String> {
    let metadata = fs::symlink_metadata(registered)
        .map_err(|error| format!("复核本地扩展路径失败: {error}"))?;
    if metadata.file_type().is_symlink() {
        return Err("本地扩展不允许使用 symlink 文件或目录".to_string());
    }
    if metadata.is_file() {
        if !is_script_extension(registered) {
            return Err("本地扩展文件必须是 .ts 或 .js".to_string());
        }
        return fs::canonicalize(registered)
            .map_err(|error| format!("解析本地扩展文件失败: {error}"));
    }
    if metadata.is_dir() {
        let canonical_dir = fs::canonicalize(registered)
            .map_err(|error| format!("解析本地扩展目录失败: {error}"))?;
        for name in ["index.ts", "index.js"] {
            let index = registered.join(name);
            let Ok(metadata) = fs::symlink_metadata(&index) else {
                continue;
            };
            if metadata.is_file() && !metadata.file_type().is_symlink() {
                let canonical = fs::canonicalize(&index)
                    .map_err(|error| format!("解析本地扩展入口失败: {error}"))?;
                if canonical.starts_with(&canonical_dir) {
                    return Ok(canonical);
                }
            }
        }
    }
    Err("本地扩展必须是存在的 .ts/.js 文件或包含 index.ts/index.js 的目录".to_string())
}

fn extensions_array_mut(root: &mut Map<String, Value>) -> Result<&mut Vec<Value>, String> {
    root.entry("extensions".to_string())
        .or_insert_with(|| Value::Array(Vec::new()))
        .as_array_mut()
        .ok_or_else(|| "Pi settings extensions 必须是数组".to_string())
}

fn package_source(entry: &Value) -> Option<&str> {
    entry
        .as_str()
        .or_else(|| entry.get("source").and_then(Value::as_str))
}

fn package_source_type(source: &str) -> &'static str {
    if source.starts_with("npm:") {
        "npm"
    } else if source.starts_with("git:")
        || source.starts_with("http://")
        || source.starts_with("https://")
        || source.starts_with("ssh://")
        || source.starts_with("git@")
    {
        "git"
    } else {
        "local"
    }
}

fn npm_package_name(source: &str) -> Option<String> {
    let source = source.strip_prefix("npm:")?;
    if let Some(scoped) = source.strip_prefix('@') {
        let slash = scoped.find('/')?;
        let tail = &scoped[slash + 1..];
        let version = tail.rfind('@').unwrap_or(tail.len());
        return Some(format!("@{}/{}", &scoped[..slash], &tail[..version]));
    }
    Some(source.split('@').next().unwrap_or(source).to_string())
}

fn package_display_name(source: &str) -> String {
    npm_package_name(source).unwrap_or_else(|| {
        source
            .trim_end_matches(['/', '\\'])
            .rsplit(['/', '\\'])
            .next()
            .unwrap_or(source)
            .trim_end_matches(".git")
            .to_string()
    })
}

fn package_identity(pi_dir: &Path, source: &str) -> String {
    if let Some(name) = npm_package_name(source) {
        return format!("npm:{}", name.to_ascii_lowercase());
    }
    if package_source_type(source) == "git" {
        let normalized = normalize_source(source);
        let without_ref = normalized
            .rsplit_once('@')
            .map_or(normalized.as_str(), |(url, tail)| {
                if tail.contains('/') || url.ends_with("git") {
                    normalized.as_str()
                } else {
                    url
                }
            });
        return format!("git:{without_ref}");
    }
    let raw = source.strip_prefix("local:").unwrap_or(source);
    let path = resolve_pi_path(pi_dir, raw);
    let resolved = fs::canonicalize(&path).unwrap_or(path);
    format!("local:{}", normalized_path(&path_string(&resolved)))
}

fn scoped_id(scope: PiExtensionScope, resource_key: &str) -> String {
    stable_id(
        match scope {
            PiExtensionScope::Global => "global",
            PiExtensionScope::Project => "project",
        },
        resource_key,
        resource_key,
    )
}

fn apply_package_scope_precedence(
    extensions: &mut Vec<PiExtensionResource>,
    packages: &mut Vec<PiInstalledPackage>,
) {
    let global: HashMap<String, PiInstalledPackage> = packages
        .iter()
        .filter(|package| package.scope == PiExtensionScope::Global)
        .map(|package| (package.resource_key.clone(), package.clone()))
        .collect();
    for package in packages
        .iter_mut()
        .filter(|package| package.scope == PiExtensionScope::Project && !package.autoload)
    {
        let Some(base) = global.get(&package.resource_key) else {
            continue;
        };
        package.version = base.version.clone();
        package.installed_path = base.installed_path.clone();
        package.status = base.status.clone();
        package.extension_count = base.extension_count;
        package.skill_count = base.skill_count;
        package.prompt_count = base.prompt_count;
        package.theme_count = base.theme_count;
        package.extensions = base
            .extensions
            .iter()
            .cloned()
            .map(|mut extension| {
                let relative = base
                    .installed_path
                    .as_ref()
                    .and_then(|root| Path::new(&extension.path).strip_prefix(root).ok())
                    .map(|path| path.to_string_lossy().replace('\\', "/"))
                    .unwrap_or_else(|| extension.path.clone());
                extension.scope = PiExtensionScope::Project;
                extension.project_dir = package.project_dir.clone();
                extension.package_id = Some(package.id.clone());
                extension.enabled = package_extension_enabled(package.entry.as_object(), &relative);
                extension.status = if extension.enabled {
                    "active".to_string()
                } else {
                    "disabled".to_string()
                };
                extension.id = scoped_id(PiExtensionScope::Project, &extension.resource_key);
                extension.conflicts.clear();
                extension
            })
            .collect();
    }
    let overridden: HashSet<String> = packages
        .iter()
        .filter(|package| {
            package.scope == PiExtensionScope::Project
                && global.contains_key(&package.resource_key)
                && package.autoload
        })
        .map(|package| package.resource_key.clone())
        .collect();
    let deltas: HashSet<String> = packages
        .iter()
        .filter(|package| {
            package.scope == PiExtensionScope::Project
                && global.contains_key(&package.resource_key)
                && !package.autoload
        })
        .map(|package| package.resource_key.clone())
        .collect();
    packages.retain(|package| {
        package.scope != PiExtensionScope::Global
            || !overridden.contains(&package.resource_key)
                && !deltas.contains(&package.resource_key)
    });
    let package_ids: HashSet<String> = packages.iter().map(|package| package.id.clone()).collect();
    extensions.retain(|extension| {
        extension.scope != PiExtensionScope::Global
            || extension
                .package_id
                .as_ref()
                .is_none_or(|package_id| package_ids.contains(package_id))
    });
    extensions.extend(
        packages
            .iter()
            .filter(|package| package.scope == PiExtensionScope::Project)
            .flat_map(|package| package.extensions.clone()),
    );
    let mut seen = HashSet::new();
    extensions.retain(|extension| seen.insert(extension.id.clone()));
}

fn sync_package_extensions(
    extensions: &[PiExtensionResource],
    packages: &mut [PiInstalledPackage],
) {
    let by_id: HashMap<&str, &PiExtensionResource> = extensions
        .iter()
        .map(|extension| (extension.id.as_str(), extension))
        .collect();
    for package in packages {
        for extension in &mut package.extensions {
            if let Some(current) = by_id.get(extension.id.as_str()) {
                *extension = (*current).clone();
            }
        }
        if package
            .extensions
            .iter()
            .any(|extension| extension.enabled && extension.status == "conflict")
        {
            package.status = "conflict".to_string();
        }
    }
}

fn package_extension_enabled(filters: Option<&Map<String, Value>>, relative: &str) -> bool {
    let Some(patterns) = filters
        .and_then(|object| object.get("extensions"))
        .and_then(Value::as_array)
    else {
        return filters
            .and_then(|object| object.get("autoload"))
            .and_then(Value::as_bool)
            .unwrap_or(true);
    };
    if patterns.is_empty() {
        return false;
    }
    let values: Vec<&str> = patterns.iter().filter_map(Value::as_str).collect();
    let includes: Vec<&str> = values
        .iter()
        .copied()
        .filter(|value| !value.starts_with(['!', '+', '-']))
        .collect();
    let excludes: Vec<&str> = values
        .iter()
        .filter_map(|value| value.strip_prefix('!'))
        .collect();
    let force_includes: HashSet<&str> = values
        .iter()
        .filter_map(|value| value.strip_prefix('+'))
        .collect();
    let force_excludes: HashSet<&str> = values
        .iter()
        .filter_map(|value| value.strip_prefix('-'))
        .collect();
    let mut enabled = if includes.is_empty() {
        true
    } else {
        includes
            .iter()
            .any(|pattern| glob_matches(pattern, relative))
    };
    if excludes
        .iter()
        .any(|pattern| glob_matches(pattern, relative))
    {
        enabled = false;
    }
    if force_includes.contains(relative) {
        enabled = true;
    }
    if force_excludes.contains(relative) {
        enabled = false;
    }
    enabled
}

fn glob_matches(pattern: &str, path: &str) -> bool {
    let pattern = normalize_filter_path(pattern);
    let path = normalize_filter_path(path);
    let pattern = pattern.as_bytes();
    let path = path.as_bytes();
    let mut memo = HashMap::new();
    glob_matches_at(pattern, path, 0, 0, &mut memo)
}

fn glob_matches_at(
    pattern: &[u8],
    path: &[u8],
    pattern_index: usize,
    path_index: usize,
    memo: &mut HashMap<(usize, usize), bool>,
) -> bool {
    if let Some(result) = memo.get(&(pattern_index, path_index)) {
        return *result;
    }
    let result = if pattern_index == pattern.len() {
        path_index == path.len()
    } else if pattern[pattern_index] == b'*' {
        let double = pattern.get(pattern_index + 1) == Some(&b'*');
        let next_pattern = pattern_index + if double { 2 } else { 1 };
        let skip_directory_separator = double
            && pattern.get(next_pattern) == Some(&b'/')
            && glob_matches_at(pattern, path, next_pattern + 1, path_index, memo);
        skip_directory_separator
            || glob_matches_at(pattern, path, next_pattern, path_index, memo)
            || path_index < path.len()
                && (double || path[path_index] != b'/')
                && glob_matches_at(pattern, path, pattern_index, path_index + 1, memo)
    } else {
        path_index < path.len()
            && pattern[pattern_index] == path[path_index]
            && glob_matches_at(pattern, path, pattern_index + 1, path_index + 1, memo)
    };
    memo.insert((pattern_index, path_index), result);
    result
}

fn normalize_filter_path(value: &str) -> String {
    value
        .replace('\\', "/")
        .split('/')
        .filter(|component| !component.is_empty() && *component != ".")
        .collect::<Vec<_>>()
        .join("/")
}

fn extension_enabled(
    entries: Option<&Vec<Value>>,
    pi_dir: &Path,
    path: &Path,
    default: bool,
) -> bool {
    let mut enabled = default;
    for raw in entries.into_iter().flatten().filter_map(Value::as_str) {
        let (value, next) = if let Some(value) = raw.strip_prefix('-') {
            (value, false)
        } else if let Some(value) = raw.strip_prefix('+') {
            (value, true)
        } else {
            (raw, true)
        };
        if same_path(&resolve_extension_path(pi_dir, value), path) {
            enabled = next;
        }
    }
    enabled
}

fn resolve_pi_path(pi_dir: &Path, value: &str) -> PathBuf {
    let path = expand_home_path(value);
    if path.is_absolute() {
        path
    } else {
        pi_dir.join(path)
    }
}

fn resolve_extension_path(pi_dir: &Path, value: &str) -> PathBuf {
    let path = resolve_pi_path(pi_dir, value);
    if path.is_dir() {
        for name in ["index.ts", "index.js"] {
            let candidate = path.join(name);
            if candidate.is_file() {
                return candidate;
            }
        }
    }
    path
}

fn path_for_settings(pi_dir: &Path, path: &Path) -> String {
    path.strip_prefix(pi_dir)
        .map(|value| value.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| path_string(path))
}

fn is_script_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("ts") || value.eq_ignore_ascii_case("js"))
}

fn extension_name(path: &Path) -> String {
    path.parent()
        .filter(|_| {
            path.file_stem()
                .and_then(|value| value.to_str())
                .is_some_and(|value| value == "index")
        })
        .and_then(Path::file_name)
        .or_else(|| path.file_stem())
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| path_string(path))
}

fn stable_id(origin: &str, source: &str, path: &str) -> String {
    format!(
        "{:x}",
        Sha256::digest(format!("{origin}\0{source}\0{path}").as_bytes())
    )
}

fn value_hash(value: &Value) -> String {
    fn canonical(value: &Value) -> Value {
        match value {
            Value::Object(object) => {
                let sorted: BTreeMap<_, _> = object.iter().collect();
                Value::Object(
                    sorted
                        .into_iter()
                        .map(|(key, value)| (key.clone(), canonical(value)))
                        .collect(),
                )
            }
            Value::Array(array) => Value::Array(array.iter().map(canonical).collect()),
            _ => value.clone(),
        }
    }
    format!(
        "{:x}",
        Sha256::digest(canonical(value).to_string().as_bytes())
    )
}

fn normalize_source(source: &str) -> String {
    source
        .trim()
        .trim_end_matches('/')
        .trim_end_matches(".git")
        .to_ascii_lowercase()
}

fn is_mcp_adapter_source(source: &str) -> bool {
    let source = normalize_source(source);
    source == "npm:pi-mcp-adapter" || source.starts_with("npm:pi-mcp-adapter@")
}

fn package_sources_match(left: &str, right: &str) -> bool {
    if is_mcp_adapter_source(left) && is_mcp_adapter_source(right) {
        return true;
    }
    normalize_source(left) == normalize_source(right)
}

fn reject_mcp_adapter_source(source: &str) -> Result<(), String> {
    if is_mcp_adapter_source(source) {
        return Err("Pi MCP adapter 必须在 MCP 页面安装或管理".to_string());
    }
    Ok(())
}

fn normalized_path(path: &str) -> String {
    if cfg!(windows) {
        path.replace('/', "\\").to_ascii_lowercase()
    } else {
        path.to_string()
    }
}

fn same_path(left: &Path, right: &Path) -> bool {
    normalized_path(&path_string(left)) == normalized_path(&path_string(right))
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn read_json_object(path: &Path) -> Result<Map<String, Value>, String> {
    let value: Value = serde_json::from_slice(
        &fs::read(path).map_err(|error| format!("读取 {} 失败: {error}", path.display()))?,
    )
    .map_err(|error| format!("解析 {} 失败: {error}", path.display()))?;
    value
        .as_object()
        .cloned()
        .ok_or_else(|| format!("{} 根节点必须是对象", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::tempdir;

    struct FailingWriter {
        writes: usize,
        fail_on: usize,
    }

    impl SettingsWriter for FailingWriter {
        fn write_json(&mut self, path: &Path, value: &Value) -> Result<(), String> {
            self.writes += 1;
            if self.writes == self.fail_on {
                return Err("injected write failure".to_string());
            }
            FsSettingsWriter.write_json(path, value)
        }

        fn remove(&mut self, path: &Path) -> Result<(), String> {
            self.writes += 1;
            if self.writes == self.fail_on {
                return Err("injected remove failure".to_string());
            }
            FsSettingsWriter.remove(path)
        }
    }

    fn write(path: &Path, value: &Value) {
        write_json_file(path, value).unwrap();
    }

    fn test_inventory(pi_dir: &Path) -> PiInventory {
        get_inventory_in_dir(pi_dir, PiExtensionScope::Global, None)
    }

    fn npm_candidate(keywords: &[&str]) -> NpmSearchCandidate {
        NpmSearchCandidate {
            item: PiPackageCatalogItem {
                name: Some("pi-test".to_string()),
                version: Some("1.0.0".to_string()),
                description: Some("search description".to_string()),
                publisher: Some("publisher".to_string()),
                license: None,
                published_at: Some("2026-01-01T00:00:00.000Z".to_string()),
                npm_url: Some("https://www.npmjs.com/package/pi-test".to_string()),
                repository_url: None,
                homepage_url: None,
                source: "npm:pi-test".to_string(),
                downloads: Some(42),
                resource_types: resource_types_from_keywords(
                    &keywords
                        .iter()
                        .map(|value| value.to_string())
                        .collect::<Vec<_>>(),
                ),
                manifest_status: "unavailable".to_string(),
                installed: false,
            },
        }
    }

    #[test]
    fn bad_settings_returns_runtime_error_and_rejects_mutation() {
        let temp = tempdir().unwrap();
        fs::write(temp.path().join("settings.json"), b"{bad").unwrap();
        let inventory = test_inventory(temp.path());
        assert!(!inventory.runtime.mutable);
        assert!(inventory.runtime.error.is_some());
        let result = mutate_settings_in_dir(temp.path(), |_, _, _| Ok(()));
        assert!(result.is_err());
    }

    #[test]
    fn settings_schema_errors_are_not_silently_defaulted() {
        for value in [
            json!({"extensions": {}}),
            json!({"extensions": [1]}),
            json!({"packages": {}}),
            json!({"packages": [1]}),
            json!({"packages": [{}]}),
            json!({"packages": [{"source": 1}]}),
        ] {
            let temp = tempdir().unwrap();
            write(&temp.path().join("settings.json"), &value);
            let inventory = test_inventory(temp.path());
            assert!(!inventory.runtime.mutable);
            assert!(inventory.runtime.error.is_some());
            assert!(mutate_settings_in_dir(temp.path(), |_, _, _| Ok(())).is_err());
        }
    }

    #[test]
    fn second_file_write_failure_restores_settings_and_state() {
        let temp = tempdir().unwrap();
        let settings_path = temp.path().join("settings.json");
        let state_path = temp.path().join(STATE_FILE);
        write(&settings_path, &json!({"packages": ["npm:pkg"]}));
        write(
            &state_path,
            &serde_json::to_value(ManagedState {
                version: STATE_VERSION,
                package_entries: BTreeMap::from([(
                    "old".to_string(),
                    ManagedPackageEntry {
                        before: json!("npm:old"),
                        last_hash: "hash".to_string(),
                    },
                )]),
            })
            .unwrap(),
        );
        let settings_before = fs::read(&settings_path).unwrap();
        let state_before = fs::read(&state_path).unwrap();
        let mut writer = FailingWriter {
            writes: 0,
            fail_on: 2,
        };
        let error = mutate_settings_in_dir_with_writer(
            temp.path(),
            |_, root, state| {
                root.insert("changed".to_string(), json!(true));
                state.package_entries.insert(
                    "new".to_string(),
                    ManagedPackageEntry {
                        before: json!("npm:new"),
                        last_hash: "new".to_string(),
                    },
                );
                Ok(())
            },
            &mut writer,
        )
        .unwrap_err();
        assert!(error.contains("injected write failure"));
        assert_eq!(fs::read(settings_path).unwrap(), settings_before);
        assert_eq!(fs::read(state_path).unwrap(), state_before);
    }

    #[test]
    fn scans_auto_and_local_extensions_with_exact_overrides() {
        let temp = tempdir().unwrap();
        fs::create_dir_all(temp.path().join("extensions/nested")).unwrap();
        fs::write(temp.path().join("extensions/auto.ts"), b"").unwrap();
        fs::write(temp.path().join("extensions/nested/index.js"), b"").unwrap();
        fs::write(temp.path().join("local.js"), b"").unwrap();
        fs::create_dir_all(temp.path().join("local-dir")).unwrap();
        fs::write(temp.path().join("local-dir/index.ts"), b"").unwrap();
        write(
            &temp.path().join("settings.json"),
            &json!({
                "extensions": ["-extensions/auto.ts", "+local.js", "local-dir"]
            }),
        );
        let inventory = test_inventory(temp.path());
        assert_eq!(inventory.extensions.len(), 4);
        assert!(inventory
            .extensions
            .iter()
            .any(|value| value.name == "auto" && !value.enabled));
        assert!(inventory
            .extensions
            .iter()
            .any(|value| value.name == "local" && value.origin == "local"));
        assert!(inventory
            .extensions
            .iter()
            .any(|value| value.name == "nested" && value.origin == "auto"));
        assert!(inventory.extensions.iter().any(|value| {
            value.name == "local-dir" && value.origin == "local" && value.status == "active"
        }));
    }

    #[test]
    fn scans_static_tool_command_and_flag_registrations() {
        let temp = tempdir().unwrap();
        let path = temp.path().join("extension.ts");
        fs::write(
            &path,
            r#"
                const label = "中文扩展";
                pi.registerTool({
                    description: "search",
                    name: "web_search",
                });
                pi.registerCommand("search", { handler() {} });
                pi.registerFlag(`search-provider`, { type: "string" });
                pi.registerTool({ name: makeToolName() });
                // pi.registerCommand("ignored", {});
            "#,
        )
        .unwrap();
        let analysis = analyze_extension(&path);
        assert_eq!(
            analysis.registrations,
            vec![
                PiExtensionRegistration {
                    kind: "command".to_string(),
                    name: "search".to_string(),
                },
                PiExtensionRegistration {
                    kind: "flag".to_string(),
                    name: "search-provider".to_string(),
                },
                PiExtensionRegistration {
                    kind: "tool".to_string(),
                    name: "web_search".to_string(),
                },
            ]
        );
        assert!(!analysis.complete);
    }

    #[test]
    fn inventory_reports_pi_registration_conflicts_and_disabled_candidates() {
        let temp = tempdir().unwrap();
        fs::create_dir_all(temp.path().join("extensions")).unwrap();
        fs::write(
            temp.path().join("extensions/first.ts"),
            r#"pi.registerTool({ name: "web_search" });"#,
        )
        .unwrap();
        fs::write(
            temp.path().join("extensions/second.ts"),
            r#"pi.registerTool({ name: "web_search" });"#,
        )
        .unwrap();
        fs::write(
            temp.path().join("disabled.ts"),
            r#"pi.registerTool({ name: "web_search" });"#,
        )
        .unwrap();
        write(
            &temp.path().join("settings.json"),
            &json!({"extensions": ["-disabled.ts"]}),
        );

        let inventory = test_inventory(temp.path());
        let first = inventory
            .extensions
            .iter()
            .find(|extension| extension.name == "first")
            .unwrap();
        let disabled = inventory
            .extensions
            .iter()
            .find(|extension| extension.name == "disabled")
            .unwrap();
        assert_eq!(first.status, "conflict");
        assert_eq!(first.conflicts[0].kind, "tool");
        assert_eq!(first.conflicts[0].name, "web_search");
        assert_eq!(disabled.status, "disabled");
        assert!(!disabled.conflicts.is_empty());
    }

    #[test]
    fn enabling_a_known_conflict_is_rejected() {
        let temp = tempdir().unwrap();
        fs::create_dir_all(temp.path().join("extensions")).unwrap();
        fs::write(
            temp.path().join("extensions/active.ts"),
            r#"pi.registerTool({ name: "web_search" });"#,
        )
        .unwrap();
        fs::write(
            temp.path().join("disabled.ts"),
            r#"pi.registerTool({ name: "web_search" });"#,
        )
        .unwrap();
        write(
            &temp.path().join("settings.json"),
            &json!({"extensions": ["-disabled.ts"]}),
        );
        let inventory = test_inventory(temp.path());
        let disabled = inventory
            .extensions
            .iter()
            .find(|extension| extension.name == "disabled")
            .unwrap();
        assert!(!disabled.conflicts.is_empty());
        let error = set_extension_enabled_in_dir(
            temp.path(),
            PiExtensionScope::Global,
            None,
            disabled.resource_key.clone(),
            true,
        )
        .unwrap_err();
        assert!(error.contains("web_search"));
    }

    #[test]
    fn newly_installed_package_conflicts_are_isolated_without_removing_other_resources() {
        let temp = tempdir().unwrap();
        fs::create_dir_all(temp.path().join("extensions")).unwrap();
        fs::write(
            temp.path().join("extensions/existing.ts"),
            r#"pi.registerTool({ name: "web_search" });"#,
        )
        .unwrap();
        let package_dir = temp.path().join("npm/node_modules/new-package");
        fs::create_dir_all(package_dir.join("extensions")).unwrap();
        fs::create_dir_all(package_dir.join("skills/search")).unwrap();
        fs::write(package_dir.join("skills/search/SKILL.md"), b"").unwrap();
        fs::write(
            package_dir.join("extensions/index.ts"),
            r#"pi.registerTool({ name: "web_search" });"#,
        )
        .unwrap();
        write(
            &package_dir.join("package.json"),
            &json!({
                "name": "new-package",
                "pi": {
                    "extensions": ["extensions/index.ts"],
                    "skills": ["skills/search"]
                }
            }),
        );
        write(
            &temp.path().join("settings.json"),
            &json!({"packages": ["npm:new-package"]}),
        );
        let inventory = test_inventory(temp.path());
        let result = isolate_new_package_conflicts_in_dir(
            temp.path(),
            PiExtensionScope::Global,
            None,
            "npm:new-package",
            inventory,
        )
        .unwrap();
        assert_eq!(result.isolated_extensions.len(), 1);
        assert!(!result.isolated_extensions[0].enabled);
        let settings = read_json_object(&temp.path().join("settings.json")).unwrap();
        assert!(settings["packages"][0].is_object());
        assert_eq!(settings["packages"][0]["source"], "npm:new-package");
        assert!(settings["packages"][0]["extensions"][0]
            .as_str()
            .unwrap()
            .starts_with('!'));
        assert_eq!(result.inventory.packages[0].skill_count, 1);
        assert_eq!(result.inventory.packages[0].status, "installed");
    }

    #[test]
    fn register_and_unregister_preserve_unknown_fields_and_order() {
        let temp = tempdir().unwrap();
        fs::write(temp.path().join("local.ts"), b"").unwrap();
        write(
            &temp.path().join("settings.json"),
            &json!({
                "unknown": {"keep": true},
                "extensions": ["first.js", "last.js"],
                "packages": ["npm:pi-mcp-adapter@2.19.0"]
            }),
        );
        mutate_settings_in_dir(temp.path(), |pi_dir, root, _| {
            let path = "local.ts".to_string();
            let resolved = resolve_pi_path(pi_dir, &path);
            assert!(resolved.is_file());
            extensions_array_mut(root)?.push(Value::String(path));
            Ok(())
        })
        .unwrap();
        mutate_settings_in_dir(temp.path(), |pi_dir, root, _| {
            let target = pi_dir.join("local.ts");
            root.get_mut("extensions")
                .unwrap()
                .as_array_mut()
                .unwrap()
                .retain(|entry| {
                    entry
                        .as_str()
                        .is_none_or(|value| !same_path(&resolve_pi_path(pi_dir, value), &target))
                });
            Ok(())
        })
        .unwrap();
        let root = read_json_object(&temp.path().join("settings.json")).unwrap();
        assert_eq!(root["unknown"], json!({"keep": true}));
        assert_eq!(root["extensions"], json!(["first.js", "last.js"]));
        assert_eq!(root["packages"], json!(["npm:pi-mcp-adapter@2.19.0"]));
    }

    #[test]
    fn parses_package_string_and_object_entries() {
        let temp = tempdir().unwrap();
        for name in ["one", "two"] {
            let dir = temp.path().join("npm/node_modules").join(name);
            fs::create_dir_all(dir.join("extensions")).unwrap();
            fs::write(dir.join("extensions/main.ts"), b"").unwrap();
            write(
                &dir.join("package.json"),
                &json!({"name": name, "version": "1.0.0"}),
            );
        }
        write(
            &temp.path().join("settings.json"),
            &json!({
                "packages": [
                    "npm:one",
                    {"source": "npm:two", "extensions": []}
                ]
            }),
        );
        let inventory = test_inventory(temp.path());
        assert_eq!(inventory.packages.len(), 2);
        assert_eq!(inventory.packages[0].extension_count, 1);
        assert!(inventory.packages[0].extensions[0].enabled);
        assert!(!inventory.packages[1].extensions[0].enabled);
    }

    #[test]
    fn package_toggle_preserves_other_resource_filters_and_mcp_adapter() {
        let temp = tempdir().unwrap();
        let dir = temp.path().join("npm/node_modules/pkg");
        fs::create_dir_all(dir.join("extensions")).unwrap();
        fs::write(dir.join("extensions/main.ts"), b"").unwrap();
        write(
            &dir.join("package.json"),
            &json!({"name": "pkg", "pi": {"extensions": ["extensions/main.ts"]}}),
        );
        write(
            &temp.path().join("settings.json"),
            &json!({
                "packages": [
                    {"source": "npm:pkg", "skills": ["skills/**"], "prompts": [], "themes": ["themes/**"]},
                    "npm:pi-mcp-adapter@2.19.0"
                ]
            }),
        );
        let inventory = test_inventory(temp.path());
        let extension = inventory.packages[0].extensions[0].clone();
        let source = extension.package_source.clone().unwrap();
        let extension_path = extension.path.clone();
        mutate_settings_in_dir(temp.path(), |pi_dir, root, state| {
            let packages = root["packages"].as_array_mut().unwrap();
            let entry = &mut packages[0];
            let original = entry.clone();
            let installed =
                fs::canonicalize(find_installed_package(pi_dir, &source).unwrap()).unwrap();
            let relative = PathBuf::from(&extension_path)
                .strip_prefix(installed)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            entry
                .as_object_mut()
                .unwrap()
                .insert("extensions".to_string(), json!([format!("!{relative}")]));
            state.package_entries.insert(
                stable_id("package-entry", &source, "0"),
                ManagedPackageEntry {
                    before: original,
                    last_hash: value_hash(entry),
                },
            );
            Ok(())
        })
        .unwrap();
        let root = read_json_object(&temp.path().join("settings.json")).unwrap();
        assert_eq!(root["packages"][0]["skills"], json!(["skills/**"]));
        assert_eq!(root["packages"][0]["prompts"], json!([]));
        assert_eq!(root["packages"][0]["themes"], json!(["themes/**"]));
        assert_eq!(root["packages"][1], json!("npm:pi-mcp-adapter@2.19.0"));
    }

    #[test]
    fn package_filter_glob_is_ordered_and_roundtrips_string_entry() {
        assert!(glob_matches("extensions/**", "extensions/nested/main.ts"));
        assert!(!glob_matches("extensions/*", "extensions/nested/main.ts"));
        let filters = json!({
            "autoload": false,
            "extensions": ["extensions/**", "!extensions/private/**", "+extensions/private/main.ts"]
        });
        let object = filters.as_object().unwrap();
        assert!(package_extension_enabled(
            Some(object),
            "extensions/main.ts"
        ));
        assert!(!package_extension_enabled(
            Some(object),
            "extensions/private/other.ts"
        ));
        assert!(package_extension_enabled(
            Some(object),
            "extensions/private/main.ts"
        ));

        let temp = tempdir().unwrap();
        let package_dir = temp.path().join("npm/node_modules/pkg");
        fs::create_dir_all(package_dir.join("extensions")).unwrap();
        fs::write(package_dir.join("extensions/main.ts"), b"").unwrap();
        write(
            &package_dir.join("package.json"),
            &json!({"name": "pkg", "pi": {"extensions": ["extensions/main.ts"]}}),
        );
        write(
            &temp.path().join("settings.json"),
            &json!({"packages": ["npm:pkg"]}),
        );
        let extension = test_inventory(temp.path()).packages[0].extensions[0].clone();
        toggle_package_extension_in_dir(temp.path(), &extension, false).unwrap();
        let disabled = read_json_object(&temp.path().join("settings.json")).unwrap();
        assert!(disabled["packages"][0].is_object());
        toggle_package_extension_in_dir(temp.path(), &extension, true).unwrap();
        let restored = read_json_object(&temp.path().join("settings.json")).unwrap();
        assert_eq!(restored["packages"][0], json!("npm:pkg"));
        assert!(!temp.path().join(STATE_FILE).exists());
    }

    #[test]
    fn mcp_adapter_extension_toggle_is_rejected() {
        let extension = PiExtensionResource {
            id: String::new(),
            resource_key: String::new(),
            scope: PiExtensionScope::Global,
            project_dir: None,
            name: "adapter".to_string(),
            path: "adapter.ts".to_string(),
            enabled: true,
            origin: "package".to_string(),
            source_type: "npm".to_string(),
            package_id: None,
            package_source: Some("npm:pi-mcp-adapter@2.19.0".to_string()),
            version: None,
            status: "active".to_string(),
            error: None,
            registrations: Vec::new(),
            analysis_complete: true,
            conflicts: Vec::new(),
        };
        let temp = tempdir().unwrap();
        let error = toggle_package_extension_in_dir(temp.path(), &extension, false).unwrap_err();
        assert!(error.contains("MCP adapter"));
    }

    #[tokio::test]
    async fn mcp_adapter_install_and_remove_are_rejected_by_general_api() {
        for source in [
            "npm:pi-mcp-adapter",
            "npm:pi-mcp-adapter@latest",
            "npm:pi-mcp-adapter@2.19.0",
        ] {
            assert!(
                install_package(source.to_string(), PiExtensionScope::Global, None)
                    .await
                    .unwrap_err()
                    .contains("MCP 页面")
            );
        }
    }

    #[test]
    fn adapter_sources_match_across_latest_and_versioned_forms() {
        assert!(package_sources_match(
            "npm:pi-mcp-adapter",
            "npm:pi-mcp-adapter@2.20.0"
        ));
        assert!(package_sources_match(
            "npm:pi-mcp-adapter@latest",
            "npm:pi-mcp-adapter"
        ));
        assert!(!package_sources_match("npm:other", "npm:other@1.0.0"));
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn dedicated_adapter_install_uses_latest_source_and_accepts_versioned_entry() {
        let temp = tempdir().unwrap();
        let cli_path = temp.path().join("fake-pi.cmd");
        fs::write(
            &cli_path,
            r#"@echo off
if "%~1"=="--version" (
  echo 1.0.0
  exit /b 0
)
if not "%~1"=="install" exit /b 2
if not "%~2"=="npm:pi-mcp-adapter" exit /b 3
mkdir "%PI_CODING_AGENT_DIR%\npm\node_modules\pi-mcp-adapter" >nul 2>&1
if errorlevel 1 exit /b 4
> "%PI_CODING_AGENT_DIR%\settings.json" echo {"packages":["npm:pi-mcp-adapter@2.20.0"]}
if errorlevel 1 exit /b 5
> "%PI_CODING_AGENT_DIR%\npm\node_modules\pi-mcp-adapter\package.json" echo {"name":"pi-mcp-adapter","version":"2.20.0"}
exit /b %errorlevel%
"#,
        )
        .unwrap();
        let cli = PiCli {
            path: cli_path,
            kind: PiCliKind::WindowsCmd,
            version: "1.0.0".to_string(),
        };

        let inventory = install_mcp_adapter_with(temp.path(), &cli, Duration::from_secs(10))
            .await
            .unwrap();

        let package = inventory
            .packages
            .iter()
            .find(|package| is_mcp_adapter_source(&package.source))
            .unwrap();
        assert_eq!(package.source, "npm:pi-mcp-adapter@2.20.0");
        assert_eq!(package.version.as_deref(), Some("2.20.0"));
        assert_eq!(package.status, "installed");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn dedicated_adapter_install_uses_latest_source_on_unix() {
        use std::os::unix::fs::PermissionsExt;

        let temp = tempdir().unwrap();
        let cli_path = temp.path().join("fake-pi");
        fs::write(
            &cli_path,
            r#"#!/bin/sh
if [ "$1" = "--version" ]; then
  printf '1.0.0'
  exit 0
fi
if [ "$1" != "install" ]; then
  exit 2
fi
if [ "$2" != "npm:pi-mcp-adapter" ]; then
  exit 3
fi
package_dir="$PI_CODING_AGENT_DIR/npm/node_modules/pi-mcp-adapter"
mkdir -p "$package_dir"
printf '{"packages":["npm:pi-mcp-adapter@2.20.0"]}' > "$PI_CODING_AGENT_DIR/settings.json"
printf '{"name":"pi-mcp-adapter","version":"2.20.0"}' > "$package_dir/package.json"
"#,
        )
        .unwrap();
        fs::set_permissions(&cli_path, fs::Permissions::from_mode(0o755)).unwrap();
        let cli = PiCli {
            path: cli_path,
            kind: PiCliKind::Direct,
            version: "1.0.0".to_string(),
        };

        let inventory = install_mcp_adapter_with(temp.path(), &cli, Duration::from_secs(10))
            .await
            .unwrap();

        let package = inventory
            .packages
            .iter()
            .find(|package| is_mcp_adapter_source(&package.source))
            .unwrap();
        assert_eq!(package.source, "npm:pi-mcp-adapter@2.20.0");
        assert_eq!(package.version.as_deref(), Some("2.20.0"));
        assert_eq!(package.status, "installed");
    }

    #[test]
    fn manifest_resource_rejects_traversal_and_absolute_paths() {
        let temp = tempdir().unwrap();
        let root = fs::canonicalize(temp.path()).unwrap();
        for value in ["../outside.ts", "/outside.ts"] {
            let resource = resolve_package_resource(temp.path(), &root, value);
            assert!(resource.error.is_some());
            assert!(resource.path.is_none());
        }
    }

    #[test]
    fn project_trust_uses_nearest_parent_and_validates_values() {
        let temp = tempdir().unwrap();
        let global = temp.path().join("global");
        let parent = temp.path().join("workspace");
        let project = parent.join("project");
        fs::create_dir_all(&project).unwrap();
        fs::create_dir_all(&global).unwrap();
        write(
            &global.join("trust.json"),
            &json!({
                path_string(&parent): true,
                path_string(temp.path()): false
            }),
        );
        let trust = get_project_trust_in_dir(&global, &project);
        assert!(trust.trusted);
        assert_eq!(
            trust.inherited_from.as_deref(),
            Some(path_string(&parent).as_str())
        );
        write(
            &global.join("trust.json"),
            &json!({path_string(&parent): "yes"}),
        );
        let trust = get_project_trust_in_dir(&global, &project);
        assert!(!trust.trusted);
        assert!(trust.decision.is_none());
    }

    #[test]
    fn project_dir_validation_rejects_relative_file_and_symlink() {
        let temp = tempdir().unwrap();
        assert!(validate_project_dir("relative").is_err());
        let file = temp.path().join("file");
        fs::write(&file, b"").unwrap();
        assert!(validate_project_dir(&path_string(&file)).is_err());
        assert_eq!(
            validate_project_dir(&path_string(temp.path())).unwrap(),
            fs::canonicalize(temp.path()).unwrap()
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            let link = temp.path().join("link");
            symlink(temp.path(), &link).unwrap();
            assert!(validate_project_dir(&path_string(&link)).is_err());
        }
    }

    #[test]
    fn trust_write_preserves_entries_and_explicitly_overrides_parent() {
        let temp = tempdir().unwrap();
        let global = temp.path().join("global");
        let parent = temp.path().join("workspace");
        let project = parent.join("project");
        fs::create_dir_all(&project).unwrap();
        fs::create_dir_all(&global).unwrap();
        write(
            &global.join("trust.json"),
            &json!({path_string(&parent): true}),
        );
        let _guard = process_lock()
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let _lock = PiWriteLock::acquire_named(&global, TRUST_LOCK_DIR).unwrap();
        let trust_path = global.join("trust.json");
        let mut root = read_json_object(&trust_path).unwrap();
        root.insert(path_string(&project), Value::Bool(false));
        write_json_file(&trust_path, &Value::Object(root)).unwrap();
        drop(_lock);
        drop(_guard);
        let trust = get_project_trust_in_dir(&global, &project);
        assert!(!trust.trusted);
        assert_eq!(trust.decision, Some(false));
        assert!(read_json_object(&trust_path)
            .unwrap()
            .contains_key(&path_string(&parent)));
    }

    #[test]
    fn package_manifest_disables_conventional_fallback_and_rejects_strings() {
        let temp = tempdir().unwrap();
        fs::create_dir_all(temp.path().join("extensions")).unwrap();
        fs::write(temp.path().join("extensions/main.ts"), b"").unwrap();
        let empty = json!({"name": "pkg", "pi": {}});
        let resources = package_resources(temp.path(), empty.as_object());
        assert!(resources.extensions.is_empty());
        let invalid = json!({"name": "pkg", "pi": {"extensions": "extensions"}});
        let resources = package_resources(temp.path(), invalid.as_object());
        assert!(resources.extensions[0]
            .error
            .as_deref()
            .is_some_and(|error| error.contains("字符串数组")));
    }

    #[test]
    fn package_discovery_respects_ignore_files_and_resource_boundaries() {
        let temp = tempdir().unwrap();
        for dir in [
            "extensions/nested",
            "extensions/.hidden",
            "extensions/node_modules/pkg",
            "skills/one",
            "skills/nested/two",
            "prompts/nested",
            "themes/nested",
        ] {
            fs::create_dir_all(temp.path().join(dir)).unwrap();
        }
        fs::write(temp.path().join("extensions/main.ts"), b"").unwrap();
        fs::write(temp.path().join("extensions/nested/index.js"), b"").unwrap();
        fs::write(temp.path().join("extensions/nested/ignored.ts"), b"").unwrap();
        fs::write(temp.path().join("extensions/.hidden/hidden.ts"), b"").unwrap();
        fs::write(
            temp.path().join("extensions/node_modules/pkg/index.ts"),
            b"",
        )
        .unwrap();
        fs::write(
            temp.path().join("extensions/.fdignore"),
            "nested/index.js\n",
        )
        .unwrap();
        fs::write(temp.path().join("skills/root.md"), b"").unwrap();
        fs::write(temp.path().join("skills/one/SKILL.md"), b"").unwrap();
        fs::write(temp.path().join("skills/nested/two/SKILL.md"), b"").unwrap();
        fs::write(temp.path().join("prompts/nested/review.md"), b"").unwrap();
        fs::write(temp.path().join("themes/nested/dark.json"), b"{}").unwrap();
        let resources = package_resources(temp.path(), Some(&Map::new()));
        assert_eq!(resources.extensions.len(), 1);
        assert_eq!(resources.extensions[0].relative, "extensions/main.ts");
        assert_eq!(resources.skills.len(), 3);
        assert_eq!(resources.prompts.len(), 1);
        assert_eq!(resources.themes.len(), 1);
    }

    #[test]
    fn settings_filter_uses_fixed_override_phases() {
        let filters = json!({
            "extensions": [
                "extensions/**",
                "-extensions/private/main.ts",
                "+extensions/private/main.ts",
                "!extensions/private/**"
            ]
        });
        let object = filters.as_object().unwrap();
        assert!(package_extension_enabled(
            Some(object),
            "extensions/main.ts"
        ));
        assert!(!package_extension_enabled(
            Some(object),
            "extensions/private/main.ts"
        ));
    }

    #[test]
    fn local_package_paths_resolve_from_settings_dir_and_home() {
        let temp = tempdir().unwrap();
        let local = temp.path().join("packages/local");
        fs::create_dir_all(&local).unwrap();
        assert_eq!(
            find_installed_package(temp.path(), "local:packages/local"),
            Some(local)
        );
        let home = crate::config::get_home_dir();
        let home_package = home.join("pi-local-package-test");
        fs::create_dir_all(&home_package).unwrap();
        assert_eq!(
            find_installed_package(temp.path(), "local:~/pi-local-package-test"),
            Some(home_package.clone())
        );
        let _ = fs::remove_dir_all(home_package);
    }

    #[test]
    fn project_package_overrides_global_and_autoload_false_is_delta() {
        let temp = tempdir().unwrap();
        let global = temp.path().join("global");
        let project = temp.path().join("project");
        let global_package = global.join("npm/node_modules/pkg");
        fs::create_dir_all(global_package.join("extensions")).unwrap();
        fs::create_dir_all(project.join(".pi")).unwrap();
        fs::write(
            global_package.join("extensions/main.ts"),
            r#"pi.registerTool({ name: "global_tool" });"#,
        )
        .unwrap();
        write(
            &global_package.join("package.json"),
            &json!({"name": "pkg", "pi": {"extensions": ["extensions"]}}),
        );
        write(
            &global.join("settings.json"),
            &json!({"packages": ["npm:pkg"]}),
        );
        write(
            &global.join("trust.json"),
            &json!({path_string(&project): true}),
        );
        write(
            &project.join(".pi/settings.json"),
            &json!({"packages": [{"source": "npm:pkg", "autoload": false, "extensions": ["!extensions/**", "+extensions/main.ts"]}]}),
        );
        let inventory = get_scoped_inventory_in_dirs(&global, Some(&project));
        assert_eq!(inventory.packages.len(), 1);
        assert_eq!(inventory.packages[0].scope, PiExtensionScope::Project);
        assert_eq!(inventory.packages[0].extension_count, 1);
        assert!(inventory.packages[0].extensions[0].enabled);
        assert!(inventory
            .extensions
            .iter()
            .all(|extension| extension.scope == PiExtensionScope::Project));
    }

    #[test]
    fn cli_resolver_skips_broken_candidate() {
        let temp = tempdir().unwrap();
        let broken = temp.path().join("broken");
        let working = temp.path().join("working");
        fs::create_dir_all(&broken).unwrap();
        fs::create_dir_all(&working).unwrap();
        #[cfg(windows)]
        {
            fs::write(broken.join("pi.cmd"), "@exit /b 1\r\n").unwrap();
            let node = std::env::split_paths(&std::env::var_os("PATH").unwrap())
                .map(|dir| dir.join("node.exe"))
                .find(|path| path.is_file())
                .unwrap();
            fs::copy(node, working.join("pi.exe")).unwrap();
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::write(broken.join("pi"), "#!/bin/sh\nexit 1\n").unwrap();
            fs::write(working.join("pi"), "#!/bin/sh\nprintf '1.2.3'\n").unwrap();
            fs::set_permissions(broken.join("pi"), fs::Permissions::from_mode(0o755)).unwrap();
            fs::set_permissions(working.join("pi"), fs::Permissions::from_mode(0o755)).unwrap();
        }
        let resolved = locate_pi_cli_in_dirs(vec![broken, working.clone()]).unwrap();
        assert!(!resolved.version.is_empty());
        assert!(resolved.path.starts_with(working));
    }

    #[cfg(unix)]
    #[test]
    fn local_extension_resolves_relative_path_and_rejects_symlink() {
        use std::os::unix::fs::symlink;

        let temp = tempdir().unwrap();
        let target = temp.path().join("real.ts");
        let link = temp.path().join("link.ts");
        fs::write(&target, b"").unwrap();
        symlink(&target, &link).unwrap();
        assert_eq!(
            validate_local_extension_path("real.ts", temp.path()).unwrap(),
            fs::canonicalize(&target).unwrap()
        );
        assert!(validate_local_extension_path(&path_string(&link), temp.path()).is_err());
        assert!(validate_local_extension_path(&path_string(&target), temp.path()).is_ok());
    }

    #[cfg(windows)]
    #[test]
    fn windows_cmd_argument_builder_rejects_percent_and_preserves_bang() {
        let command = build_windows_cmd_command(
            Path::new(r"C:\Program Files\pi.cmd"),
            &["install", r"local:C:\用户\bang! package"],
        )
        .unwrap();
        let debug = format!("{command:?}");
        assert!(debug.contains("bang! package"));
        assert!(build_windows_cmd_command(
            Path::new(r"C:\pi.cmd"),
            &["install", r"local:C:\100% package"]
        )
        .is_err());
        assert!(
            build_windows_cmd_command(Path::new(r"C:\pi.cmd"), &["install", "npm:x&whoami"])
                .is_err()
        );
    }

    #[cfg(unix)]
    fn write_fake_cli(path: &Path) {
        fs::write(
            path,
            r#"#!/bin/sh
if [ "$1" = "--version" ]; then
  printf '1.0.0'
  exit 0
fi
if [ "$FAKE_MODE" = "timeout" ]; then
  sleep 5
fi
if [ "$FAKE_MODE" = "output" ]; then
  yes x
fi
printf '%s\n%s\n%s\n' "$PI_CODING_AGENT_DIR" "$1" "$2" > "$PI_CODING_AGENT_DIR/argv.txt"
exit 0
"#,
        )
        .unwrap();
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o755)).unwrap();
    }

    #[cfg(unix)]
    #[test]
    #[serial_test::serial]
    fn fake_cli_receives_env_and_source_and_detects_no_change() {
        let temp = tempdir().unwrap();
        let cli_path = temp.path().join("pi");
        write_fake_cli(&cli_path);
        write(&temp.path().join("settings.json"), &json!({"packages": []}));
        let cli = PiCli {
            path: cli_path,
            kind: PiCliKind::Direct,
            version: "1.0.0".to_string(),
        };
        std::env::remove_var("FAKE_MODE");
        let error = run_package_cli_blocking(
            temp.path(),
            &cli,
            "install",
            "npm:pkg".to_string(),
            false,
            None,
            Duration::from_secs(2),
        )
        .unwrap_err();
        assert!(error.contains("未发生预期变化"));
        let argv = fs::read_to_string(temp.path().join("argv.txt")).unwrap();
        assert!(argv.contains(&path_string(temp.path())));
        assert!(argv.contains("install"));
        assert!(argv.contains("npm:pkg"));
    }

    #[cfg(unix)]
    #[test]
    #[serial_test::serial]
    fn fake_cli_timeout_and_output_limit_are_enforced() {
        let temp = tempdir().unwrap();
        let cli_path = temp.path().join("pi");
        write_fake_cli(&cli_path);
        let cli = PiCli {
            path: cli_path,
            kind: PiCliKind::Direct,
            version: "1.0.0".to_string(),
        };
        std::env::set_var("FAKE_MODE", "timeout");
        let mut command = build_pi_command(&cli, &["install", "npm:pkg"]).unwrap();
        command
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        assert!(run_bounded_command(command, Duration::from_millis(100))
            .unwrap_err()
            .contains("超时"));
        std::env::set_var("FAKE_MODE", "output");
        let mut command = build_pi_command(&cli, &["install", "npm:pkg"]).unwrap();
        command
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        assert!(run_bounded_command(command, Duration::from_secs(2))
            .unwrap_err()
            .contains("输出超过"));
        std::env::remove_var("FAKE_MODE");
    }

    #[test]
    fn package_entry_external_change_is_detected() {
        let temp = tempdir().unwrap();
        let entry = json!({"source": "npm:pkg", "extensions": ["extensions/main.ts"]});
        write(
            &temp.path().join("settings.json"),
            &json!({"packages": [entry.clone()]}),
        );
        let key = stable_id("package-entry", "npm:pkg", "0");
        write(
            &temp.path().join(STATE_FILE),
            &serde_json::to_value(ManagedState {
                version: STATE_VERSION,
                package_entries: BTreeMap::from([(
                    key.clone(),
                    ManagedPackageEntry {
                        before: json!("npm:pkg"),
                        last_hash: value_hash(&entry),
                    },
                )]),
            })
            .unwrap(),
        );
        let changed = json!({"source": "npm:pkg", "extensions": [], "external": true});
        write(
            &temp.path().join("settings.json"),
            &json!({"packages": [changed.clone()]}),
        );
        let state = read_state(&temp.path().join(STATE_FILE)).unwrap();
        let error = ensure_managed_entry_unchanged(&state, &key, &changed).unwrap_err();
        assert!(error.contains("外部修改"));
    }

    #[test]
    fn maps_npm_fixture_and_filters_exact_keyword() {
        let fixture = json!({
            "total": 2,
            "objects": [
                {
                    "downloads": {"weekly": 42},
                    "package": {
                        "name": "pi-good",
                        "version": "1.2.3",
                        "description": "good",
                        "keywords": ["pi-package", "extensions"],
                        "publisher": {"username": "author"},
                        "links": {"npm": "https://npmjs.com/package/pi-good"}
                    }
                },
                {
                    "package": {
                        "name": "pi-bad",
                        "keywords": ["pi-packages"]
                    }
                }
            ]
        });
        let candidates = map_npm_search_candidates(&fixture);
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].item.downloads, Some(42));
        assert_eq!(candidates[0].item.resource_types, vec!["extensions"]);
        assert_eq!(candidates[0].item.manifest_status, "unavailable");
    }

    #[test]
    fn latest_manifest_extracts_all_resource_types_and_metadata() {
        let item = apply_latest_manifest(
            npm_candidate(&["pi-package", "extensions"]),
            Ok(json!({
                "keywords": ["PI-PACKAGE"],
                "version": "2.0.0",
                "description": "latest description",
                "license": "MIT",
                "repository": {"url": "https://github.com/example/pi-test"},
                "homepage": "https://example.com/pi-test",
                "pi": {
                    "extensions": "extensions/main.ts",
                    "skills": ["skills/one"],
                    "prompts": "prompts/main.md",
                    "themes": []
                }
            })),
        )
        .unwrap();
        assert_eq!(
            item.resource_types,
            vec!["extensions", "skills", "prompts", "themes"]
        );
        assert_eq!(item.manifest_status, "available");
        assert_eq!(item.version.as_deref(), Some("2.0.0"));
        assert_eq!(item.description.as_deref(), Some("latest description"));
        assert_eq!(item.license.as_deref(), Some("MIT"));
        assert_eq!(
            item.repository_url.as_deref(),
            Some("https://github.com/example/pi-test")
        );
        assert_eq!(
            item.homepage_url.as_deref(),
            Some("https://example.com/pi-test")
        );
        assert_eq!(item.publisher.as_deref(), Some("publisher"));
        assert_eq!(item.downloads, Some(42));
        assert_eq!(
            item.published_at.as_deref(),
            Some("2026-01-01T00:00:00.000Z")
        );
    }

    #[test]
    fn latest_failure_keeps_search_fallback() {
        let item = apply_latest_manifest(
            npm_candidate(&["pi-package", "skills"]),
            Err("offline".to_string()),
        )
        .unwrap();
        assert_eq!(item.resource_types, vec!["skills"]);
        assert_eq!(item.manifest_status, "unavailable");
        assert_eq!(item.description.as_deref(), Some("search description"));
    }

    #[test]
    fn latest_rejects_non_exact_pi_package_keyword() {
        let item = apply_latest_manifest(
            npm_candidate(&["pi-package"]),
            Ok(json!({
                "keywords": ["pi-packages"],
                "pi": {"extensions": "extensions/main.ts"}
            })),
        );
        assert!(item.is_none());
    }

    #[test]
    fn scoped_latest_url_encodes_package_name_as_one_segment() {
        let url = npm_latest_url("@scope/pi-package").unwrap();
        assert_eq!(
            url.as_str(),
            "https://registry.npmjs.org/@scope%2Fpi-package/latest"
        );
    }

    #[test]
    fn cache_key_normalizes_query_and_expiration_uses_ttl() {
        assert_eq!(
            npm_search_cache_key("  Pi   Search  ", 20, 10),
            npm_search_cache_key("pi search", 20, 10)
        );
        assert_ne!(
            npm_search_cache_key("pi search", 0, 10),
            npm_search_cache_key("pi search", 20, 10)
        );
        let inserted_at = Instant::now();
        assert!(npm_search_cache_entry_is_fresh(
            inserted_at,
            inserted_at + NPM_SEARCH_CACHE_TTL
        ));
        assert!(!npm_search_cache_entry_is_fresh(
            inserted_at,
            inserted_at + NPM_SEARCH_CACHE_TTL + Duration::from_millis(1)
        ));
    }

    #[test]
    fn installed_status_is_refreshed_from_current_inventory() {
        let mut result = PiPackageSearchResult {
            items: vec![npm_candidate(&["pi-package"]).item],
            total: 1,
            query: String::new(),
            offset: 0,
            limit: 20,
        };
        let mut inventory = PiInventory {
            runtime: PiRuntimeStatus {
                scope: PiExtensionScope::Global,
                project_dir: None,
                pi_dir: String::new(),
                settings_path: String::new(),
                cli_available: false,
                cli_path: None,
                cli_version: None,
                mutable: true,
                error: None,
            },
            runtimes: Vec::new(),
            project_dir: None,
            project_trust: None,
            extensions: Vec::new(),
            packages: Vec::new(),
        };
        refresh_installed_status(&mut result, &inventory);
        assert!(!result.items[0].installed);
        inventory.packages.push(PiInstalledPackage {
            id: String::new(),
            resource_key: "npm:pi-test".to_string(),
            scope: PiExtensionScope::Global,
            project_dir: None,
            source: "npm:PI-TEST".to_string(),
            source_type: "npm".to_string(),
            display_name: String::new(),
            version: None,
            installed_path: None,
            status: "installed".to_string(),
            extension_count: 0,
            skill_count: 0,
            prompt_count: 0,
            theme_count: 0,
            extensions: Vec::new(),
            error: None,
            autoload: true,
            entry: json!("npm:PI-TEST"),
        });
        refresh_installed_status(&mut result, &inventory);
        assert!(result.items[0].installed);
    }

    #[test]
    fn empty_repository_does_not_match_arbitrary_source() {
        let temp = tempdir().unwrap();
        let package_dir = temp.path().join("unrelated");
        fs::create_dir_all(&package_dir).unwrap();
        write(
            &package_dir.join("package.json"),
            &json!({"name": "unrelated", "repository": ""}),
        );
        assert_eq!(
            scan_for_package_metadata(temp.path(), "npm:missing", None),
            None
        );
    }
}
