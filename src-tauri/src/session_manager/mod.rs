mod pagination;
pub mod providers;
pub mod terminal;

pub use pagination::SessionMessagePage;

use serde::{Deserialize, Serialize};
use std::collections::{hash_map::DefaultHasher, HashMap};
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::UNIX_EPOCH;

use providers::{claude, codex, gemini, grokbuild, hermes, openclaw, opencode, pi};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMeta {
    pub provider_id: String,
    pub session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instance_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_dir: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_active_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resume_command: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ts: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteSessionRequest {
    pub provider_id: String,
    pub session_id: String,
    pub instance_id: Option<String>,
    pub source_path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum SessionScope {
    Default,
    Instance { instance_id: String },
    All,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteSessionOutcome {
    pub provider_id: String,
    pub session_id: String,
    pub instance_id: Option<String>,
    pub source_path: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum SessionProvider {
    Codex,
    Claude,
    OpenCode,
    OpenClaw,
    Gemini,
    Hermes,
    GrokBuild,
    Pi,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
struct ScanFingerprint {
    file_count: u64,
    digest_xor: u64,
    digest_sum: u64,
    error_count: u64,
}

impl ScanFingerprint {
    fn record_file(&mut self, path: &Path, metadata: &std::fs::Metadata) {
        let modified = metadata
            .modified()
            .ok()
            .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        let mut hasher = DefaultHasher::new();
        path.hash(&mut hasher);
        metadata.len().hash(&mut hasher);
        modified.hash(&mut hasher);
        let digest = hasher.finish();

        self.file_count = self.file_count.saturating_add(1);
        self.digest_xor ^= digest;
        self.digest_sum = self.digest_sum.wrapping_add(digest);
    }

    fn record_error(&mut self, path: &Path) {
        let mut hasher = DefaultHasher::new();
        path.hash(&mut hasher);
        "unreadable".hash(&mut hasher);
        let digest = hasher.finish();

        self.error_count = self.error_count.saturating_add(1);
        self.digest_xor ^= digest;
        self.digest_sum = self.digest_sum.wrapping_add(digest);
    }
}

#[derive(Clone)]
struct CachedSessionScan {
    fingerprint: ScanFingerprint,
    sessions: Vec<SessionMeta>,
}

#[derive(Default)]
struct SessionScanCache {
    entries: Mutex<HashMap<(SessionProvider, Option<String>), CachedSessionScan>>,
}

impl SessionScanCache {
    fn get_or_scan<F>(
        &self,
        provider: SessionProvider,
        scope: Option<String>,
        roots: &[PathBuf],
        force_refresh: bool,
        scan: F,
    ) -> Vec<SessionMeta>
    where
        F: FnOnce() -> Vec<SessionMeta>,
    {
        let fingerprint_before = fingerprint_roots(roots);

        if !force_refresh {
            let entries = self
                .entries
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if let Some(cached) = entries.get(&(provider, scope.clone())) {
                if cached.fingerprint == fingerprint_before {
                    return cached.sessions.clone();
                }
            }
        }

        let sessions = scan();
        let fingerprint_after = fingerprint_roots(roots);
        let mut entries = self
            .entries
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        if fingerprint_before == fingerprint_after {
            entries.insert(
                (provider, scope.clone()),
                CachedSessionScan {
                    fingerprint: fingerprint_after,
                    sessions: sessions.clone(),
                },
            );
        } else {
            entries.remove(&(provider, scope));
        }

        sessions
    }
}

static SESSION_SCAN_CACHE: OnceLock<SessionScanCache> = OnceLock::new();

fn fingerprint_roots(roots: &[PathBuf]) -> ScanFingerprint {
    let mut fingerprint = ScanFingerprint::default();
    for root in roots {
        fingerprint_path(root, &mut fingerprint);
    }
    fingerprint
}

fn fingerprint_path(path: &Path, fingerprint: &mut ScanFingerprint) {
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return,
        Err(_) => {
            fingerprint.record_error(path);
            return;
        }
    };

    if !metadata.is_dir() {
        fingerprint.record_file(path, &metadata);
        return;
    }

    let entries = match std::fs::read_dir(path) {
        Ok(entries) => entries,
        Err(_) => {
            fingerprint.record_error(path);
            return;
        }
    };

    for entry in entries {
        match entry {
            Ok(entry) => fingerprint_path(&entry.path(), fingerprint),
            Err(_) => fingerprint.record_error(path),
        }
    }
}

fn scan_roots(provider: SessionProvider) -> Vec<PathBuf> {
    match provider {
        SessionProvider::Codex => {
            let mut roots = codex::session_roots();
            roots.push(crate::codex_config::get_codex_config_dir().join("session_index.jsonl"));
            roots
        }
        SessionProvider::Claude => vec![crate::config::get_claude_config_dir().join("projects")],
        SessionProvider::OpenCode => vec![opencode::get_opencode_base_dir()],
        SessionProvider::OpenClaw => {
            vec![crate::openclaw_config::get_openclaw_dir().join("agents")]
        }
        SessionProvider::Gemini => {
            vec![crate::gemini_config::get_gemini_dir().join("tmp")]
        }
        SessionProvider::Hermes => vec![crate::hermes_config::get_hermes_dir()],
        SessionProvider::GrokBuild => grokbuild::session_roots(),
        SessionProvider::Pi => vec![crate::pi_config::get_sessions_dir()],
    }
}

impl SessionProvider {
    fn parse(provider_id: &str) -> Result<Self, String> {
        match provider_id {
            "codex" => Ok(Self::Codex),
            "claude" => Ok(Self::Claude),
            "opencode" => Ok(Self::OpenCode),
            "openclaw" => Ok(Self::OpenClaw),
            "gemini" => Ok(Self::Gemini),
            "hermes" => Ok(Self::Hermes),
            "grokbuild" => Ok(Self::GrokBuild),
            "pi" => Ok(Self::Pi),
            _ => Err(format!("Unsupported session provider: {provider_id}")),
        }
    }
}

fn scan_provider(provider: SessionProvider) -> Vec<SessionMeta> {
    match provider {
        SessionProvider::Codex => codex::scan_sessions(),
        SessionProvider::Claude => claude::scan_sessions(),
        SessionProvider::OpenCode => opencode::scan_sessions(),
        SessionProvider::OpenClaw => openclaw::scan_sessions(),
        SessionProvider::Gemini => gemini::scan_sessions(),
        SessionProvider::Hermes => hermes::scan_sessions(),
        SessionProvider::GrokBuild => grokbuild::scan_sessions(),
        SessionProvider::Pi => pi::scan_sessions(),
    }
}

fn sort_sessions(sessions: &mut [SessionMeta]) {
    sessions.sort_by(|a, b| {
        let a_ts = a.last_active_at.or(a.created_at).unwrap_or(0);
        let b_ts = b.last_active_at.or(b.created_at).unwrap_or(0);
        b_ts.cmp(&a_ts)
    });
}

#[cfg(test)]
fn scan_sessions_with<F>(provider_id: &str, scan: F) -> Result<Vec<SessionMeta>, String>
where
    F: FnOnce(SessionProvider) -> Vec<SessionMeta>,
{
    let provider = SessionProvider::parse(provider_id)?;
    let mut sessions = scan(provider);
    sort_sessions(&mut sessions);
    Ok(sessions)
}

fn instance_runtime_home(
    db: &crate::database::Database,
    provider: SessionProvider,
    instance_id: &str,
) -> Result<PathBuf, String> {
    let instance = db
        .get_agent_instance(instance_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("实例 {instance_id} 不存在"))?;
    let app_type = match provider {
        SessionProvider::Codex => "codex",
        SessionProvider::Claude => "claude",
        _ => return Err("只有 Claude 和 Codex 会话支持运行环境作用域".to_string()),
    };
    if instance.app_type != app_type {
        return Err(format!("实例 {instance_id} 不属于 {app_type}"));
    }
    instance
        .runtime_home
        .or(instance.codex_home)
        .map(PathBuf::from)
        .ok_or_else(|| format!("{app_type} 实例 {instance_id} 缺少运行目录"))
}

type InstanceScanner = Box<dyn FnOnce() -> Vec<SessionMeta>>;

fn instance_scan(
    db: &crate::database::Database,
    provider: SessionProvider,
    instance_id: &str,
) -> Result<(Vec<PathBuf>, InstanceScanner), String> {
    let home = instance_runtime_home(db, provider, instance_id)?;
    let instance_id = instance_id.to_string();
    match provider {
        SessionProvider::Codex => {
            let mut roots = codex::session_roots_for_home(&home);
            roots.push(home.join("session_index.jsonl"));
            Ok((
                roots,
                Box::new(move || codex::scan_sessions_in_home(&home, Some(&instance_id))),
            ))
        }
        SessionProvider::Claude => {
            let roots = claude::session_roots_for_home(&home);
            Ok((
                roots,
                Box::new(move || claude::scan_sessions_in_home(&home, Some(&instance_id))),
            ))
        }
        _ => Err("只有 Claude 和 Codex 会话支持运行环境作用域".to_string()),
    }
}

fn list_provider_instances(
    db: &crate::database::Database,
    provider: SessionProvider,
) -> Result<Vec<crate::database::AgentInstance>, String> {
    let app_type = match provider {
        SessionProvider::Codex => "codex",
        SessionProvider::Claude => "claude",
        _ => return Ok(Vec::new()),
    };
    db.get_agent_instances_for_app(app_type)
        .map_err(|error| error.to_string())
}

pub fn scan_sessions_scoped(
    db: &crate::database::Database,
    provider_id: &str,
    scope: SessionScope,
    force_refresh: bool,
) -> Result<Vec<SessionMeta>, String> {
    let provider = SessionProvider::parse(provider_id)?;
    let cache = SESSION_SCAN_CACHE.get_or_init(SessionScanCache::default);
    let mut sessions = match scope {
        SessionScope::Default => {
            let roots = scan_roots(provider);
            cache.get_or_scan(provider, None, &roots, force_refresh, move || {
                scan_provider(provider)
            })
        }
        SessionScope::Instance { instance_id } => {
            let (roots, scan) = instance_scan(db, provider, &instance_id)?;
            cache.get_or_scan(provider, Some(instance_id), &roots, force_refresh, scan)
        }
        SessionScope::All => {
            let roots = scan_roots(provider);
            let mut sessions =
                cache.get_or_scan(provider, None, &roots, force_refresh, move || {
                    scan_provider(provider)
                });
            for instance in list_provider_instances(db, provider)? {
                let instance_id = instance.id;
                let (roots, scan) = instance_scan(db, provider, &instance_id)?;
                sessions.extend(cache.get_or_scan(
                    provider,
                    Some(instance_id),
                    &roots,
                    force_refresh,
                    scan,
                ));
            }
            sessions
        }
    };
    sort_sessions(&mut sessions);
    Ok(sessions)
}

pub fn validate_session_source(
    db: &crate::database::Database,
    provider_id: &str,
    instance_id: Option<&str>,
    session_id: &str,
    source_path: &str,
) -> Result<PathBuf, String> {
    let source = validate_scoped_source(db, provider_id, instance_id, source_path)?;
    let parsed = match provider_id {
        "codex" => codex::session_id(&source),
        "claude" => claude::session_id(&source),
        _ => return Err("只有 Claude 和 Codex 会话支持安全恢复".to_string()),
    }
    .ok_or_else(|| format!("无法读取会话元数据: {}", source.display()))?;
    if parsed != session_id {
        return Err(format!(
            "会话 ID 不匹配: expected {session_id}, found {parsed}"
        ));
    }
    Ok(source)
}

pub fn load_messages(provider_id: &str, source_path: &str) -> Result<Vec<SessionMessage>, String> {
    // SQLite sessions use a "sqlite:" prefixed source_path
    if provider_id == "opencode" && source_path.starts_with("sqlite:") {
        return opencode::load_messages_sqlite(source_path);
    }
    if provider_id == "hermes" && source_path.starts_with("sqlite:") {
        return hermes::load_messages_sqlite(source_path);
    }

    let path = Path::new(source_path);
    match provider_id {
        "codex" => codex::load_messages(path),
        "claude" => claude::load_messages(path),
        "opencode" => opencode::load_messages(path),
        "openclaw" => openclaw::load_messages(path),
        "gemini" => gemini::load_messages(path),
        "grokbuild" => grokbuild::load_messages(path),
        "hermes" => hermes::load_messages(path),
        "pi" => pi::load_messages(path),
        _ => Err(format!("Unsupported provider: {provider_id}")),
    }
}

pub fn load_messages_scoped(
    db: &crate::database::Database,
    provider_id: &str,
    instance_id: Option<&str>,
    source_path: &str,
) -> Result<Vec<SessionMessage>, String> {
    let source = validate_scoped_source(db, provider_id, instance_id, source_path)?;
    load_messages(provider_id, &source.to_string_lossy())
}

fn validate_scoped_source(
    db: &crate::database::Database,
    provider_id: &str,
    instance_id: Option<&str>,
    source_path: &str,
) -> Result<PathBuf, String> {
    let roots = if provider_id == "codex" {
        match instance_id {
            Some(instance_id) => codex::session_roots_for_home(&instance_runtime_home(
                db,
                SessionProvider::Codex,
                instance_id,
            )?),
            None => codex::session_roots(),
        }
    } else if provider_id == "claude" {
        match instance_id {
            Some(instance_id) => claude::session_roots_for_home(&instance_runtime_home(
                db,
                SessionProvider::Claude,
                instance_id,
            )?),
            None => claude::session_roots_for_home(&crate::config::get_claude_config_dir()),
        }
    } else {
        if instance_id.is_some() {
            return Err("只有 Claude 和 Codex 会话支持运行环境作用域".to_string());
        }
        provider_roots(provider_id)?
    };
    let source = canonicalize_existing_path(Path::new(source_path), "session source")?;
    for root in roots {
        if root.exists() && source.starts_with(canonicalize_existing_path(&root, "session root")?) {
            return Ok(source);
        }
    }
    Err(format!(
        "Session source path is outside provider roots: {}",
        source.display()
    ))
}

pub fn load_message_page_scoped(
    db: &crate::database::Database,
    provider_id: &str,
    instance_id: Option<&str>,
    source_path: &str,
    cursor: Option<&str>,
) -> Result<SessionMessagePage, String> {
    let source = validate_scoped_source(db, provider_id, instance_id, source_path)?;
    load_message_page(provider_id, &source.to_string_lossy(), cursor)
}

pub fn load_message_content_scoped(
    db: &crate::database::Database,
    provider_id: &str,
    instance_id: Option<&str>,
    source_path: &str,
    content_cursor: &str,
) -> Result<String, String> {
    let source = validate_scoped_source(db, provider_id, instance_id, source_path)?;
    load_message_content(provider_id, &source.to_string_lossy(), content_cursor)
}

pub fn load_message_page(
    provider_id: &str,
    source_path: &str,
    cursor: Option<&str>,
) -> Result<SessionMessagePage, String> {
    if provider_id == "opencode" && source_path.starts_with("sqlite:") {
        return opencode::load_messages_sqlite_page(source_path, cursor);
    }
    if provider_id == "hermes" && source_path.starts_with("sqlite:") {
        return hermes::load_messages_sqlite_page(source_path, cursor);
    }

    let path = Path::new(source_path);
    match provider_id {
        "codex" => codex::load_message_page(path, cursor),
        "claude" => claude::load_message_page(path, cursor),
        "opencode" => opencode::load_message_page(path, cursor),
        "openclaw" => openclaw::load_message_page(path, cursor),
        "gemini" => gemini::load_message_page(path, cursor),
        "grokbuild" => grokbuild::load_message_page(path, cursor),
        "hermes" => hermes::load_message_page(path, cursor),
        "pi" => pi::load_message_page(path, cursor),
        _ => Err(format!("Unsupported provider: {provider_id}")),
    }
}

pub fn load_message_content(
    provider_id: &str,
    source_path: &str,
    content_cursor: &str,
) -> Result<String, String> {
    if provider_id == "opencode" && source_path.starts_with("sqlite:") {
        return opencode::load_message_content_sqlite(source_path, content_cursor);
    }
    if provider_id == "hermes" && source_path.starts_with("sqlite:") {
        return hermes::load_message_content_sqlite(source_path, content_cursor);
    }

    let path = Path::new(source_path);
    match provider_id {
        "codex" => codex::load_message_content(path, content_cursor),
        "claude" => claude::load_message_content(path, content_cursor),
        "opencode" => opencode::load_message_content(path, content_cursor),
        "openclaw" => openclaw::load_message_content(path, content_cursor),
        "gemini" => gemini::load_message_content(path, content_cursor),
        "grokbuild" => grokbuild::load_message_content(path, content_cursor),
        "hermes" => hermes::load_message_content(path, content_cursor),
        "pi" => pi::load_message_content(path, content_cursor),
        _ => Err(format!("Unsupported provider: {provider_id}")),
    }
}

pub fn delete_session(
    provider_id: &str,
    session_id: &str,
    source_path: &str,
) -> Result<bool, String> {
    // SQLite sessions bypass the file-based deletion path
    if provider_id == "opencode" && source_path.starts_with("sqlite:") {
        return opencode::delete_session_sqlite(session_id, source_path);
    }
    if provider_id == "hermes" && source_path.starts_with("sqlite:") {
        return hermes::delete_session_sqlite(session_id, source_path);
    }

    let roots = provider_roots(provider_id)?;
    delete_session_with_roots(provider_id, session_id, Path::new(source_path), &roots)
}

pub fn delete_session_scoped(
    db: &crate::database::Database,
    provider_id: &str,
    instance_id: Option<&str>,
    session_id: &str,
    source_path: &str,
) -> Result<bool, String> {
    let Some(instance_id) = instance_id else {
        return delete_session(provider_id, session_id, source_path);
    };
    let provider = SessionProvider::parse(provider_id)?;
    let home = instance_runtime_home(db, provider, instance_id)?;
    let roots = match provider {
        SessionProvider::Codex => codex::session_roots_for_home(&home),
        SessionProvider::Claude => claude::session_roots_for_home(&home),
        _ => return Err("只有 Claude 和 Codex 会话支持运行环境作用域".to_string()),
    };
    delete_session_with_roots(provider_id, session_id, Path::new(source_path), &roots)
}

pub fn delete_sessions_scoped(
    db: &crate::database::Database,
    requests: &[DeleteSessionRequest],
) -> Vec<DeleteSessionOutcome> {
    collect_delete_session_outcomes(requests, |request| {
        delete_session_scoped(
            db,
            &request.provider_id,
            request.instance_id.as_deref(),
            &request.session_id,
            &request.source_path,
        )
    })
}

fn delete_session_with_roots(
    provider_id: &str,
    session_id: &str,
    source_path: &Path,
    roots: &[PathBuf],
) -> Result<bool, String> {
    let validated_source = canonicalize_existing_path(source_path, "session source")?;

    let mut saw_existing_root = false;
    for root in roots {
        if !root.exists() {
            continue;
        }

        saw_existing_root = true;
        let validated_root = canonicalize_existing_path(root, "session root")?;
        if validated_source.starts_with(&validated_root) {
            return match provider_id {
                "codex" => codex::delete_session(&validated_root, &validated_source, session_id),
                "claude" => claude::delete_session(&validated_root, &validated_source, session_id),
                "opencode" => {
                    opencode::delete_session(&validated_root, &validated_source, session_id)
                }
                "openclaw" => {
                    openclaw::delete_session(&validated_root, &validated_source, session_id)
                }
                "gemini" => gemini::delete_session(&validated_root, &validated_source, session_id),
                "grokbuild" => {
                    grokbuild::delete_session(&validated_root, &validated_source, session_id)
                }
                "hermes" => hermes::delete_session(&validated_root, &validated_source, session_id),
                "pi" => pi::delete_session(&validated_root, &validated_source, session_id),
                _ => Err(format!("Unsupported provider: {provider_id}")),
            };
        }
    }

    if !saw_existing_root {
        return Err(format!(
            "Session root not found for provider {provider_id}: {}",
            roots
                .first()
                .map(|root| root.display().to_string())
                .unwrap_or_else(|| "<none>".to_string())
        ));
    }

    Err(format!(
        "Session source path is outside provider roots: {}",
        source_path.display()
    ))
}

fn provider_roots(provider_id: &str) -> Result<Vec<PathBuf>, String> {
    let roots = match provider_id {
        "codex" => codex::session_roots(),
        "claude" => vec![crate::config::get_claude_config_dir().join("projects")],
        "opencode" => vec![opencode::get_opencode_data_dir()],
        "openclaw" => vec![crate::openclaw_config::get_openclaw_dir().join("agents")],
        "gemini" => vec![crate::gemini_config::get_gemini_dir().join("tmp")],
        "grokbuild" => grokbuild::session_roots(),
        "hermes" => vec![crate::hermes_config::get_hermes_dir().join("sessions")],
        "pi" => vec![crate::pi_config::get_sessions_dir()],
        _ => return Err(format!("Unsupported provider: {provider_id}")),
    };

    Ok(roots)
}

fn canonicalize_existing_path(path: &Path, label: &str) -> Result<PathBuf, String> {
    if !path.exists() {
        return Err(format!("{label} not found: {}", path.display()));
    }

    path.canonicalize()
        .map_err(|e| format!("Failed to resolve {label} {}: {e}", path.display()))
}

fn collect_delete_session_outcomes<F>(
    requests: &[DeleteSessionRequest],
    mut deleter: F,
) -> Vec<DeleteSessionOutcome>
where
    F: FnMut(&DeleteSessionRequest) -> Result<bool, String>,
{
    requests
        .iter()
        .map(|request| match deleter(request) {
            Ok(true) => DeleteSessionOutcome {
                provider_id: request.provider_id.clone(),
                session_id: request.session_id.clone(),
                instance_id: request.instance_id.clone(),
                source_path: request.source_path.clone(),
                success: true,
                error: None,
            },
            Ok(false) => DeleteSessionOutcome {
                provider_id: request.provider_id.clone(),
                session_id: request.session_id.clone(),
                instance_id: request.instance_id.clone(),
                source_path: request.source_path.clone(),
                success: false,
                error: Some("Session was not deleted".to_string()),
            },
            Err(error) => DeleteSessionOutcome {
                provider_id: request.provider_id.clone(),
                session_id: request.session_id.clone(),
                instance_id: request.instance_id.clone(),
                source_path: request.source_path.clone(),
                success: false,
                error: Some(error),
            },
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    use tempfile::tempdir;

    #[test]
    fn dispatches_one_selected_provider() {
        let mut dispatched = None;
        let sessions = scan_sessions_with("claude", |provider| {
            dispatched = Some(provider);
            vec![SessionMeta {
                provider_id: "claude".to_string(),
                session_id: "session-1".to_string(),
                instance_id: None,
                title: None,
                summary: None,
                project_dir: None,
                created_at: Some(1),
                last_active_at: None,
                source_path: None,
                resume_command: None,
            }]
        })
        .expect("selected provider should dispatch");

        assert_eq!(dispatched, Some(SessionProvider::Claude));
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].provider_id, "claude");
    }

    #[test]
    fn rejects_aggregate_and_unknown_provider_ids() {
        for provider_id in ["all", "invalid"] {
            let error = scan_sessions_with(provider_id, |_| unreachable!())
                .expect_err("invalid provider should not scan");
            assert!(error.contains("Unsupported session provider"));
        }
    }

    #[test]
    fn metadata_cache_reuses_unchanged_and_refreshes_changed_or_missing_files() {
        let root = tempdir().expect("session root");
        let source = root.path().join("session.jsonl");
        std::fs::write(&source, "first").expect("write initial source");
        let cache = SessionScanCache::default();
        let scan_count = Cell::new(0);
        let roots = [root.path().to_path_buf()];

        let scan = || {
            scan_count.set(scan_count.get() + 1);
            if !source.exists() {
                return Vec::new();
            }
            vec![SessionMeta {
                provider_id: "codex".to_string(),
                session_id: "session-1".to_string(),
                instance_id: None,
                title: std::fs::read_to_string(&source).ok(),
                summary: None,
                project_dir: None,
                created_at: None,
                last_active_at: None,
                source_path: Some(source.display().to_string()),
                resume_command: None,
            }]
        };

        let first = cache.get_or_scan(SessionProvider::Codex, None, &roots, false, scan);
        let unchanged = cache.get_or_scan(SessionProvider::Codex, None, &roots, false, scan);
        assert_eq!(scan_count.get(), 1);
        assert_eq!(first[0].title.as_deref(), Some("first"));
        assert_eq!(unchanged[0].title.as_deref(), Some("first"));

        let forced = cache.get_or_scan(SessionProvider::Codex, None, &roots, true, scan);
        assert_eq!(scan_count.get(), 2);
        assert_eq!(forced[0].title.as_deref(), Some("first"));

        std::fs::write(&source, "changed and longer").expect("change source");
        let changed = cache.get_or_scan(SessionProvider::Codex, None, &roots, false, scan);
        assert_eq!(scan_count.get(), 3);
        assert_eq!(changed[0].title.as_deref(), Some("changed and longer"));

        std::fs::remove_file(&source).expect("remove source");
        let missing = cache.get_or_scan(SessionProvider::Codex, None, &roots, false, scan);
        assert_eq!(scan_count.get(), 4);
        assert!(missing.is_empty());
    }

    fn write_codex_session(path: &Path, session_id: &str) {
        std::fs::write(
            path,
            format!(
                "{{\"timestamp\":\"2026-03-06T21:50:12Z\",\"type\":\"session_meta\",\"payload\":{{\"id\":\"{session_id}\",\"cwd\":\"/tmp/project\"}}}}\n\
                 {{\"timestamp\":\"2026-03-06T21:50:13Z\",\"type\":\"response_item\",\"payload\":{{\"type\":\"message\",\"role\":\"user\",\"content\":\"hello\"}}}}\n",
            ),
        )
        .expect("write source");
    }

    #[test]
    fn accepts_source_path_under_any_allowed_provider_root() {
        let active_root = tempdir().expect("active root");
        let archived_root = tempdir().expect("archived root");
        let source = archived_root.path().join("session.jsonl");
        write_codex_session(&source, "archived-session");

        let deleted = delete_session_with_roots(
            "codex",
            "archived-session",
            &source,
            &[
                active_root.path().to_path_buf(),
                archived_root.path().to_path_buf(),
            ],
        )
        .expect("delete archived session");

        assert!(deleted);
        assert!(!source.exists());
    }

    #[test]
    fn rejects_source_path_outside_provider_root() {
        let root = tempdir().expect("tempdir");
        let outside = tempdir().expect("tempdir");
        let source = outside.path().join("session.jsonl");
        std::fs::write(&source, "{}").expect("write source");

        let err =
            delete_session_with_roots("codex", "session-1", &source, &[root.path().to_path_buf()])
                .expect_err("expected outside-root path to be rejected");

        assert!(err.contains("outside provider roots"));
    }

    #[test]
    fn rejects_missing_source_path() {
        let root = tempdir().expect("tempdir");
        let missing = root.path().join("missing.jsonl");

        let err =
            delete_session_with_roots("codex", "session-1", &missing, &[root.path().to_path_buf()])
                .expect_err("expected missing source path to fail");

        assert!(err.contains("session source not found"));
    }

    #[test]
    fn batch_delete_collects_successes_and_failures_in_order() {
        let requests = vec![
            DeleteSessionRequest {
                provider_id: "codex".to_string(),
                session_id: "s1".to_string(),
                instance_id: None,
                source_path: "/tmp/s1".to_string(),
            },
            DeleteSessionRequest {
                provider_id: "claude".to_string(),
                session_id: "s2".to_string(),
                instance_id: None,
                source_path: "/tmp/s2".to_string(),
            },
            DeleteSessionRequest {
                provider_id: "gemini".to_string(),
                session_id: "s3".to_string(),
                instance_id: None,
                source_path: "/tmp/s3".to_string(),
            },
        ];

        let outcomes = collect_delete_session_outcomes(&requests, |request| {
            match request.session_id.as_str() {
                "s1" => Ok(true),
                "s2" => Err("boom".to_string()),
                _ => Ok(false),
            }
        });

        assert_eq!(outcomes.len(), 3);
        assert!(outcomes[0].success);
        assert_eq!(outcomes[0].error, None);
        assert!(!outcomes[1].success);
        assert_eq!(outcomes[1].error.as_deref(), Some("boom"));
        assert!(!outcomes[2].success);
        assert_eq!(
            outcomes[2].error.as_deref(),
            Some("Session was not deleted")
        );
    }

    #[test]
    fn claude_instance_scopes_keep_duplicate_session_ids_independent() {
        let first = tempdir().expect("first runtime");
        let second = tempdir().expect("second runtime");
        let first_projects = first.path().join("projects/project-a");
        let second_projects = second.path().join("projects/project-b");
        std::fs::create_dir_all(&first_projects).expect("first projects");
        std::fs::create_dir_all(&second_projects).expect("second projects");
        let first_source = first_projects.join("shared.jsonl");
        let second_source = second_projects.join("shared.jsonl");
        let write = |path: &Path, title: &str| {
            std::fs::write(
                path,
                format!(
                    "{{\"sessionId\":\"shared\",\"cwd\":\"/tmp/project\",\"timestamp\":\"2026-03-06T10:00:00Z\"}}\n\
                     {{\"type\":\"user\",\"message\":{{\"role\":\"user\",\"content\":\"{title}\"}},\"sessionId\":\"shared\",\"timestamp\":\"2026-03-06T10:01:00Z\"}}\n"
                ),
            )
            .expect("write session");
        };
        write(&first_source, "first");
        write(&second_source, "second");

        let first_sessions = claude::scan_sessions_in_home(first.path(), Some("instance-a"));
        let second_sessions = claude::scan_sessions_in_home(second.path(), Some("instance-b"));

        assert_eq!(first_sessions[0].session_id, second_sessions[0].session_id);
        assert_eq!(first_sessions[0].instance_id.as_deref(), Some("instance-a"));
        assert_eq!(
            second_sessions[0].instance_id.as_deref(),
            Some("instance-b")
        );
        delete_session_with_roots(
            "claude",
            "shared",
            &first_source,
            &claude::session_roots_for_home(first.path()),
        )
        .expect("delete first");
        assert!(!first_source.exists());
        assert!(second_source.exists());
    }
}
