use super::ccswitch_import::{
    read_ccswitch_candidates, CcSwitchInvalidCandidate, CcSwitchParseResult,
    CcSwitchProviderCandidate,
};
use crate::app_config::AppType;
use crate::database::{lock_conn, Database};
use crate::error::AppError;
use crate::provider::Provider;
use rusqlite::{params, Connection, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use url::{Position, Url};

const MANUAL_SOURCE: &str = "manual";
const CC_SWITCH_SOURCE: &str = "cc-switch";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CcSwitchImportAction {
    Add,
    Update,
    PreserveLocal,
    Attach,
    Invalid,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CcSwitchPreviewItem {
    pub key: String,
    pub app_type: String,
    pub source_id: String,
    pub name: String,
    pub endpoint: Option<String>,
    pub model_count: usize,
    pub credential_state: String,
    pub action: CcSwitchImportAction,
    pub selectable: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CcSwitchPreviewSummary {
    pub total: usize,
    pub selectable: usize,
    pub added: usize,
    pub updated: usize,
    pub preserved: usize,
    pub attached: usize,
    pub invalid: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CcSwitchImportPreview {
    pub token: String,
    pub source_path: String,
    pub source_version: i64,
    pub items: Vec<CcSwitchPreviewItem>,
    pub summary: CcSwitchPreviewSummary,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CcSwitchImportSelection {
    pub token: String,
    pub keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CcSwitchApplyResult {
    pub imported: usize,
    pub added: usize,
    pub updated: usize,
    pub preserved: usize,
    pub attached: usize,
    pub skipped: usize,
    pub affected_apps: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Clone)]
struct StoredProvider {
    provider: Provider,
    source: String,
    source_id: Option<String>,
    source_dirty: bool,
}

#[derive(Clone)]
struct PlannedCandidate {
    key: String,
    app_type: AppType,
    source_id: String,
    provider: Provider,
    target_id: String,
    action: CcSwitchImportAction,
    reason: Option<String>,
}

struct ReconcilePlan {
    source_path: String,
    source_version: i64,
    candidates: Vec<PlannedCandidate>,
    invalid: Vec<CcSwitchInvalidCandidate>,
    warnings: Vec<String>,
    token: String,
}

fn canonical_base_url(input: &str) -> String {
    let trimmed = input.trim();
    let Ok(mut url) = Url::parse(trimmed) else {
        return trimmed.trim_end_matches('/').to_string();
    };
    if url.host_str().is_none() {
        return trimmed.trim_end_matches('/').to_string();
    }
    url.set_fragment(None);
    if matches!(
        (url.scheme(), url.port()),
        ("http", Some(80)) | ("https", Some(443))
    ) {
        let _ = url.set_port(None);
    }
    let mut canonical = url[..Position::BeforePath].to_string();
    canonical.push_str(url.path().trim_end_matches('/'));
    if let Some(query) = url.query() {
        canonical.push('?');
        canonical.push_str(query);
    }
    canonical
}

fn normalized_name(input: &str) -> String {
    input
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_ascii_lowercase()
}

fn provider_credentials(provider: &Provider, app_type: &AppType) -> (String, String) {
    let (base_url, api_key) = provider.resolve_usage_credentials(app_type);
    (canonical_base_url(&base_url), api_key.trim().to_string())
}

fn provider_identity(provider: &Provider, app_type: &AppType) -> Option<[u8; 32]> {
    let (base_url, api_key) = provider_credentials(provider, app_type);
    if base_url.is_empty() || api_key.is_empty() {
        return None;
    }
    let mut hasher = Sha256::new();
    hasher.update(b"stackferry/cc-switch-provider-identity/v2\0");
    hasher.update(app_type.as_str().as_bytes());
    hasher.update(b"\0");
    hasher.update(base_url.as_bytes());
    hasher.update(b"\0");
    hasher.update(api_key.as_bytes());
    Some(hasher.finalize().into())
}

fn compatible_provider(left: &Provider, right: &Provider, app_type: &AppType) -> bool {
    let (left_url, left_key) = provider_credentials(left, app_type);
    let (right_url, right_key) = provider_credentials(right, app_type);
    if left_url.is_empty()
        || right_url.is_empty()
        || left_url != right_url
        || normalized_name(&left.name) != normalized_name(&right.name)
    {
        return false;
    }
    left_key.is_empty() || right_key.is_empty() || left_key == right_key
}

fn provider_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredProvider> {
    let settings_config: String = row.get(2)?;
    let raw_meta: String = row.get(10)?;
    Ok(StoredProvider {
        provider: Provider {
            id: row.get(0)?,
            name: row.get(1)?,
            settings_config: serde_json::from_str(&settings_config).unwrap_or(Value::Null),
            website_url: row.get(3)?,
            category: row.get(4)?,
            created_at: row.get(5)?,
            sort_index: row.get(6)?,
            notes: row.get(7)?,
            icon: row.get(8)?,
            icon_color: row.get(9)?,
            meta: Some(serde_json::from_str(&raw_meta).unwrap_or_default()),
            in_failover_queue: row.get(11)?,
        },
        source: row.get(12)?,
        source_id: row.get(13)?,
        source_dirty: row.get(14)?,
    })
}

fn stored_providers(
    connection: &Connection,
    app_type: &AppType,
) -> Result<Vec<StoredProvider>, AppError> {
    let mut statement = connection.prepare(
        "SELECT id, name, settings_config, website_url, category, created_at, sort_index,
                notes, icon, icon_color, meta, in_failover_queue, source, source_id, source_dirty
         FROM providers WHERE app_type = ?1
         ORDER BY COALESCE(sort_index, 999999), created_at, id",
    )?;
    let rows = statement.query_map([app_type.as_str()], provider_from_row)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn source_match<'a>(stored: &'a [StoredProvider], source_id: &str) -> Option<&'a StoredProvider> {
    stored.iter().find(|candidate| {
        candidate.source == CC_SWITCH_SOURCE && candidate.source_id.as_deref() == Some(source_id)
    })
}

fn unique_manual_match<'a>(
    stored: &'a [StoredProvider],
    incoming: &Provider,
    app_type: &AppType,
) -> Option<&'a StoredProvider> {
    let identity = provider_identity(incoming, app_type);
    let mut matches = stored
        .iter()
        .filter(|candidate| candidate.source == MANUAL_SOURCE && candidate.source_id.is_none())
        .filter(|candidate| {
            identity.is_some() && provider_identity(&candidate.provider, app_type) == identity
                || compatible_provider(&candidate.provider, incoming, app_type)
        });
    let first = matches.next()?;
    matches.next().is_none().then_some(first)
}

fn unique_provider_id(stored: &[StoredProvider], preferred: &str) -> String {
    let ids = stored
        .iter()
        .map(|candidate| candidate.provider.id.as_str())
        .collect::<HashSet<_>>();
    if !ids.contains(preferred) {
        return preferred.to_string();
    }
    for suffix in 2usize.. {
        let candidate = format!("{preferred}-{suffix}");
        if !ids.contains(candidate.as_str()) {
            return candidate;
        }
    }
    unreachable!()
}

fn plan_candidate(
    connection: &Connection,
    candidate: CcSwitchProviderCandidate,
) -> Result<PlannedCandidate, AppError> {
    let stored = stored_providers(connection, &candidate.app_type)?;
    let source_id = candidate.source_id.trim().to_string();
    let key = format!("{}:{source_id}", candidate.app_type.as_str());
    if let Some(existing) = source_match(&stored, &source_id) {
        return Ok(PlannedCandidate {
            key,
            app_type: candidate.app_type,
            source_id,
            provider: candidate.provider,
            target_id: existing.provider.id.clone(),
            action: if existing.source_dirty {
                CcSwitchImportAction::PreserveLocal
            } else {
                CcSwitchImportAction::Update
            },
            reason: existing
                .source_dirty
                .then(|| "StackFerry 中的配置已被本地修改".to_string()),
        });
    }
    if let Some(existing) = unique_manual_match(&stored, &candidate.provider, &candidate.app_type) {
        return Ok(PlannedCandidate {
            key,
            app_type: candidate.app_type,
            source_id,
            provider: candidate.provider,
            target_id: existing.provider.id.clone(),
            action: CcSwitchImportAction::Attach,
            reason: Some("匹配到现有手动供应商，将保留本地配置并建立来源关联".to_string()),
        });
    }
    let target_id = unique_provider_id(&stored, &candidate.provider.id);
    Ok(PlannedCandidate {
        key,
        app_type: candidate.app_type,
        source_id,
        provider: candidate.provider,
        target_id,
        action: CcSwitchImportAction::Add,
        reason: None,
    })
}

fn hash_plan(
    parsed: &CcSwitchParseResult,
    connection: &Connection,
    candidates: &[PlannedCandidate],
) -> Result<String, AppError> {
    let mut hasher = Sha256::new();
    hasher.update(b"stackferry/cc-switch-import-preview/v1\0");
    hasher.update(parsed.source_path.to_string_lossy().as_bytes());
    hasher.update(parsed.source_version.to_le_bytes());
    for candidate in candidates {
        hasher.update(candidate.key.as_bytes());
        hasher.update(candidate.target_id.as_bytes());
        hasher.update(format!("{:?}", candidate.action).as_bytes());
        hasher.update(
            serde_json::to_vec(&candidate.provider)
                .map_err(|error| AppError::Config(error.to_string()))?,
        );
    }
    let mut statement = connection.prepare(
        "SELECT app_type, id, name, settings_config, source, source_id, source_dirty
         FROM providers ORDER BY app_type, id",
    )?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, bool>(6)?,
        ))
    })?;
    for row in rows {
        let row = row?;
        hasher
            .update(serde_json::to_vec(&row).map_err(|error| AppError::Config(error.to_string()))?);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn build_plan(
    connection: &Connection,
    mut parsed: CcSwitchParseResult,
) -> Result<ReconcilePlan, AppError> {
    let mut candidates = Vec::with_capacity(parsed.candidates.len());
    for candidate in std::mem::take(&mut parsed.candidates) {
        candidates.push(plan_candidate(connection, candidate)?);
    }
    let token = hash_plan(&parsed, connection, &candidates)?;
    Ok(ReconcilePlan {
        source_path: parsed.source_path.display().to_string(),
        source_version: parsed.source_version,
        candidates,
        invalid: parsed.invalid,
        warnings: parsed.warnings,
        token,
    })
}

fn model_count(provider: &Provider, app_type: &AppType) -> usize {
    match app_type {
        AppType::OpenCode => provider
            .settings_config
            .get("models")
            .and_then(Value::as_object)
            .map_or(0, serde_json::Map::len),
        AppType::OpenClaw | AppType::Hermes => provider
            .settings_config
            .get("models")
            .map(|models| {
                models.as_array().map_or_else(
                    || models.as_object().map_or(0, serde_json::Map::len),
                    Vec::len,
                )
            })
            .unwrap_or(0),
        AppType::Claude | AppType::ClaudeDesktop | AppType::Gemini => provider
            .settings_config
            .get("env")
            .and_then(Value::as_object)
            .map(|env| {
                env.keys()
                    .filter(|key| key.contains("MODEL"))
                    .filter(|key| env.get(*key).is_some_and(|value| value.is_string()))
                    .count()
            })
            .unwrap_or(0),
        AppType::Codex | AppType::GrokBuild => 1,
        AppType::Pi => 0,
    }
}

fn preview_item(candidate: &PlannedCandidate) -> CcSwitchPreviewItem {
    let (endpoint, api_key) = provider_credentials(&candidate.provider, &candidate.app_type);
    CcSwitchPreviewItem {
        key: candidate.key.clone(),
        app_type: candidate.app_type.as_str().to_string(),
        source_id: candidate.source_id.clone(),
        name: candidate.provider.name.clone(),
        endpoint: (!endpoint.is_empty()).then_some(endpoint),
        model_count: model_count(&candidate.provider, &candidate.app_type),
        credential_state: if api_key.is_empty() {
            "missing".to_string()
        } else {
            "source".to_string()
        },
        action: candidate.action.clone(),
        selectable: !matches!(candidate.action, CcSwitchImportAction::PreserveLocal),
        reason: candidate.reason.clone(),
    }
}

fn invalid_preview_item(candidate: &CcSwitchInvalidCandidate) -> CcSwitchPreviewItem {
    CcSwitchPreviewItem {
        key: format!("{}:{}", candidate.app_label, candidate.source_id),
        app_type: candidate
            .app_type
            .as_ref()
            .map(|app| app.as_str().to_string())
            .unwrap_or_else(|| candidate.app_label.clone()),
        source_id: candidate.source_id.clone(),
        name: candidate.name.clone(),
        endpoint: None,
        model_count: 0,
        credential_state: "unknown".to_string(),
        action: CcSwitchImportAction::Invalid,
        selectable: false,
        reason: Some(candidate.reason.clone()),
    }
}

fn summarize(items: &[CcSwitchPreviewItem]) -> CcSwitchPreviewSummary {
    CcSwitchPreviewSummary {
        total: items.len(),
        selectable: items.iter().filter(|item| item.selectable).count(),
        added: items
            .iter()
            .filter(|item| item.action == CcSwitchImportAction::Add)
            .count(),
        updated: items
            .iter()
            .filter(|item| item.action == CcSwitchImportAction::Update)
            .count(),
        preserved: items
            .iter()
            .filter(|item| item.action == CcSwitchImportAction::PreserveLocal)
            .count(),
        attached: items
            .iter()
            .filter(|item| item.action == CcSwitchImportAction::Attach)
            .count(),
        invalid: items
            .iter()
            .filter(|item| item.action == CcSwitchImportAction::Invalid)
            .count(),
    }
}

fn plan_to_preview(plan: &ReconcilePlan) -> CcSwitchImportPreview {
    let mut items = plan.candidates.iter().map(preview_item).collect::<Vec<_>>();
    items.extend(plan.invalid.iter().map(invalid_preview_item));
    let summary = summarize(&items);
    CcSwitchImportPreview {
        token: plan.token.clone(),
        source_path: plan.source_path.clone(),
        source_version: plan.source_version,
        items,
        summary,
        warnings: plan.warnings.clone(),
    }
}

pub fn preview_ccswitch_provider_import(
    database: &Database,
    explicit_path: Option<&str>,
) -> Result<CcSwitchImportPreview, AppError> {
    let parsed = read_ccswitch_candidates(explicit_path)?;
    let connection = lock_conn!(database.conn);
    let plan = build_plan(&connection, parsed)?;
    Ok(plan_to_preview(&plan))
}

fn serialize_provider(provider: &Provider) -> Result<(String, String), AppError> {
    let settings = serde_json::to_string(&provider.settings_config)
        .map_err(|error| AppError::Database(format!("序列化导入供应商配置失败: {error}")))?;
    let meta = serde_json::to_string(&provider.meta.clone().unwrap_or_default())
        .map_err(|error| AppError::Database(format!("序列化导入供应商元数据失败: {error}")))?;
    Ok((settings, meta))
}

fn insert_provider(connection: &Connection, candidate: &PlannedCandidate) -> Result<(), AppError> {
    let (settings, meta) = serialize_provider(&candidate.provider)?;
    let sort_index: i64 = connection.query_row(
        "SELECT COALESCE(MAX(sort_index), -1) + 1 FROM providers WHERE app_type = ?1",
        [candidate.app_type.as_str()],
        |row| row.get(0),
    )?;
    connection.execute(
        "INSERT INTO providers (
            id, app_type, name, settings_config, website_url, category, created_at,
            sort_index, notes, icon, icon_color, meta, is_current, in_failover_queue,
            failover_order, source, source_id, source_dirty
         ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, strftime('%s','now'), ?7, ?8, ?9, ?10,
            ?11, 0, 0, NULL, ?12, ?13, 0
         )",
        params![
            candidate.target_id,
            candidate.app_type.as_str(),
            candidate.provider.name,
            settings,
            candidate.provider.website_url,
            candidate.provider.category,
            sort_index,
            candidate.provider.notes,
            candidate.provider.icon,
            candidate.provider.icon_color,
            meta,
            CC_SWITCH_SOURCE,
            candidate.source_id,
        ],
    )?;
    Ok(())
}

fn update_provider(connection: &Connection, candidate: &PlannedCandidate) -> Result<(), AppError> {
    let (settings, _) = serialize_provider(&candidate.provider)?;
    connection.execute(
        "UPDATE providers
         SET name = ?1, settings_config = ?2, source = ?3, source_id = ?4, source_dirty = 0
         WHERE id = ?5 AND app_type = ?6",
        params![
            candidate.provider.name,
            settings,
            CC_SWITCH_SOURCE,
            candidate.source_id,
            candidate.target_id,
            candidate.app_type.as_str(),
        ],
    )?;
    Ok(())
}

fn attach_provider(connection: &Connection, candidate: &PlannedCandidate) -> Result<(), AppError> {
    connection.execute(
        "UPDATE providers
         SET source = ?1, source_id = ?2, source_dirty = 1
         WHERE id = ?3 AND app_type = ?4",
        params![
            CC_SWITCH_SOURCE,
            candidate.source_id,
            candidate.target_id,
            candidate.app_type.as_str(),
        ],
    )?;
    Ok(())
}

pub fn apply_ccswitch_provider_import(
    database: &Database,
    explicit_path: Option<&str>,
    selection: CcSwitchImportSelection,
) -> Result<CcSwitchApplyResult, AppError> {
    let parsed = read_ccswitch_candidates(explicit_path)?;
    let mut connection = lock_conn!(database.conn);
    let plan = build_plan(&connection, parsed)?;
    if plan.token != selection.token {
        return Err(AppError::Config(
            "导入预览已过期，请重新扫描后再导入".to_string(),
        ));
    }
    let selected = selection.keys.into_iter().collect::<HashSet<_>>();
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| AppError::Database(error.to_string()))?;
    let mut result = CcSwitchApplyResult {
        imported: 0,
        added: 0,
        updated: 0,
        preserved: 0,
        attached: 0,
        skipped: plan.invalid.len(),
        affected_apps: Vec::new(),
        warnings: plan.warnings,
    };
    let mut affected_apps = HashSet::new();
    for candidate in plan.candidates {
        if !selected.contains(&candidate.key) {
            result.skipped += 1;
            continue;
        }
        match candidate.action {
            CcSwitchImportAction::Add => {
                insert_provider(&transaction, &candidate)?;
                result.added += 1;
            }
            CcSwitchImportAction::Update => {
                update_provider(&transaction, &candidate)?;
                result.updated += 1;
            }
            CcSwitchImportAction::Attach => {
                attach_provider(&transaction, &candidate)?;
                result.attached += 1;
            }
            CcSwitchImportAction::PreserveLocal => {
                result.preserved += 1;
                continue;
            }
            CcSwitchImportAction::Invalid => {
                result.skipped += 1;
                continue;
            }
        }
        result.imported += 1;
        affected_apps.insert(candidate.app_type.as_str().to_string());
    }
    transaction
        .commit()
        .map_err(|error| AppError::Database(error.to_string()))?;
    let mut affected_apps = affected_apps.into_iter().collect::<Vec<_>>();
    affected_apps.sort();
    result.affected_apps = affected_apps;
    Ok(result)
}

#[cfg(test)]
fn supported_ccswitch_app(app: &str) -> bool {
    app.parse::<AppType>()
        .is_ok_and(|app_type| app_type != AppType::Pi)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;
    use serde_json::json;
    use tempfile::TempDir;

    fn source_database() -> (TempDir, String) {
        let temp = TempDir::new().expect("source temp");
        let path = temp.path().join("cc-switch.db");
        let connection = Connection::open(&path).expect("source database");
        connection
            .execute_batch(
                "PRAGMA user_version = 16;
                 CREATE TABLE providers (
                    id TEXT NOT NULL,
                    app_type TEXT NOT NULL,
                    name TEXT NOT NULL,
                    settings_config TEXT NOT NULL,
                    website_url TEXT,
                    category TEXT,
                    created_at INTEGER,
                    sort_index INTEGER,
                    notes TEXT,
                    icon TEXT,
                    icon_color TEXT,
                    meta TEXT NOT NULL DEFAULT '{}'
                 );",
            )
            .expect("source schema");
        for (id, app_type, settings) in [
            (
                "claude-relay",
                "claude",
                json!({
                    "env": {
                        "ANTHROPIC_BASE_URL": "https://claude.example",
                        "ANTHROPIC_AUTH_TOKEN": "claude-secret"
                    }
                }),
            ),
            (
                "opencode-relay",
                "opencode",
                json!({
                    "npm": "@ai-sdk/openai-compatible",
                    "options": {
                        "baseURL": "https://opencode.example/v1",
                        "apiKey": "opencode-secret"
                    },
                    "models": {
                        "model-a": {"name": "Model A"}
                    }
                }),
            ),
        ] {
            connection
                .execute(
                    "INSERT INTO providers
                     (id, app_type, name, settings_config, sort_index, created_at)
                     VALUES (?1, ?2, ?1, ?3, 0, 1)",
                    params![id, app_type, settings.to_string()],
                )
                .expect("source provider");
        }
        drop(connection);
        (temp, path.display().to_string())
    }

    #[test]
    fn preview_items_never_serialize_provider_secrets() {
        let candidate = PlannedCandidate {
            key: "claude:relay".into(),
            app_type: AppType::Claude,
            source_id: "relay".into(),
            provider: Provider::with_id(
                "relay".into(),
                "Relay".into(),
                json!({
                    "env": {
                        "ANTHROPIC_BASE_URL": "https://relay.example",
                        "ANTHROPIC_AUTH_TOKEN": "secret-token"
                    }
                }),
                None,
            ),
            target_id: "relay".into(),
            action: CcSwitchImportAction::Add,
            reason: None,
        };
        let value = serde_json::to_string(&preview_item(&candidate)).expect("serialize preview");
        assert!(!value.contains("secret-token"));
        assert!(value.contains("\"credentialState\":\"source\""));
    }

    #[test]
    fn pi_is_not_a_supported_ccswitch_app() {
        assert!(supported_ccswitch_app("claude"));
        assert!(supported_ccswitch_app("grok"));
        assert!(!supported_ccswitch_app("pi"));
        assert!(!supported_ccswitch_app("unknown"));
    }

    #[test]
    fn preview_is_read_only_and_apply_imports_selected_agents() {
        let (_temp, path) = source_database();
        let database = Database::memory().expect("target database");
        let preview =
            preview_ccswitch_provider_import(&database, Some(&path)).expect("preview import");
        assert_eq!(preview.summary.added, 2);
        assert!(database
            .get_all_providers("claude")
            .expect("claude providers")
            .is_empty());
        assert!(database
            .get_all_providers("opencode")
            .expect("opencode providers")
            .is_empty());
        let claude = preview
            .items
            .iter()
            .find(|item| item.app_type == "claude")
            .expect("claude preview");
        let result = apply_ccswitch_provider_import(
            &database,
            Some(&path),
            CcSwitchImportSelection {
                token: preview.token,
                keys: vec![claude.key.clone()],
            },
        )
        .expect("apply selected import");
        assert_eq!((result.imported, result.added, result.skipped), (1, 1, 1));
        assert_eq!(result.affected_apps, ["claude"]);
        assert_eq!(
            database
                .get_all_providers("claude")
                .expect("imported claude")
                .len(),
            1
        );
        assert!(database
            .get_all_providers("opencode")
            .expect("skipped opencode")
            .is_empty());
    }

    #[test]
    fn apply_rejects_a_stale_preview() {
        let (_temp, path) = source_database();
        let database = Database::memory().expect("target database");
        let preview =
            preview_ccswitch_provider_import(&database, Some(&path)).expect("preview import");
        database
            .save_provider(
                "claude",
                &Provider::with_id("local".into(), "Local".into(), json!({"env": {}}), None),
            )
            .expect("change target");
        let error = apply_ccswitch_provider_import(
            &database,
            Some(&path),
            CcSwitchImportSelection {
                token: preview.token,
                keys: preview.items.into_iter().map(|item| item.key).collect(),
            },
        )
        .expect_err("stale preview");
        assert!(error.to_string().contains("预览已过期"));
    }
}
