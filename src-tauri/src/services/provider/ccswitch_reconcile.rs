use super::ccswitch_import::{
    read_ccswitch_codex_candidates, CcSwitchParseResult, CcSwitchProviderCandidate,
};
use crate::database::{lock_conn, Database};
use crate::error::AppError;
use crate::provider::{Provider, ProviderMeta};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use toml_edit::{value, DocumentMut, Item};
use url::{Position, Url};

const APP_TYPE: &str = "codex";
const MANUAL_SOURCE: &str = "manual";
const CC_SWITCH_SOURCE: &str = "cc-switch";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CcSwitchImportResult {
    pub imported: usize,
    pub added: usize,
    pub updated: usize,
    pub merged: usize,
    pub skipped: usize,
    pub warnings: Vec<String>,
    pub providers: Vec<Provider>,
}

#[derive(Clone, PartialEq, Eq)]
enum ProviderIdentity {
    Credential([u8; 32]),
    Unauthenticated { base_url: String, name: String },
}

struct StoredProvider {
    provider: Provider,
    source: String,
    source_id: Option<String>,
    source_dirty: bool,
    is_current: bool,
    failover_order: Option<i64>,
    raw_meta: String,
}

enum ReconcileKind {
    Added,
    Updated,
    Merged,
}

fn normalized_name(input: &str) -> String {
    input
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_ascii_lowercase()
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
    let default_port = matches!(
        (url.scheme(), url.port()),
        ("http", Some(80)) | ("https", Some(443))
    );
    if default_port {
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

fn config_document(provider: &Provider) -> Option<DocumentMut> {
    provider
        .settings_config
        .get("config")
        .and_then(serde_json::Value::as_str)
        .and_then(|config| config.parse::<DocumentMut>().ok())
}

fn active_provider_table<'a>(document: &'a DocumentMut) -> Option<&'a toml_edit::Table> {
    let id = document.get("model_provider")?.as_str()?.trim();
    document
        .get("model_providers")?
        .as_table()?
        .get(id)?
        .as_table()
}

fn provider_base_url(provider: &Provider) -> Option<String> {
    let document = config_document(provider)?;
    active_provider_table(&document)
        .and_then(|table| table.get("base_url"))
        .and_then(Item::as_str)
        .or_else(|| document.get("base_url").and_then(Item::as_str))
        .map(canonical_base_url)
        .filter(|base_url| !base_url.is_empty())
}

fn provider_api_key(provider: &Provider) -> Option<String> {
    provider
        .settings_config
        .pointer("/auth/OPENAI_API_KEY")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|key| !key.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| {
            let document = config_document(provider)?;
            active_provider_table(&document)
                .and_then(|table| table.get("experimental_bearer_token"))
                .and_then(Item::as_str)
                .or_else(|| {
                    document
                        .get("experimental_bearer_token")
                        .and_then(Item::as_str)
                })
                .map(str::trim)
                .filter(|key| !key.is_empty())
                .map(ToOwned::to_owned)
        })
}

fn provider_identity(provider: &Provider) -> Option<ProviderIdentity> {
    let base_url = provider_base_url(provider)?;
    if let Some(api_key) = provider_api_key(provider) {
        let mut hasher = Sha256::new();
        hasher.update(b"stackferry/cc-switch-provider-identity/v1\0");
        hasher.update(base_url.as_bytes());
        hasher.update(b"\0");
        hasher.update(api_key.as_bytes());
        return Some(ProviderIdentity::Credential(hasher.finalize().into()));
    }
    let name = normalized_name(&provider.name);
    (!name.is_empty()).then_some(ProviderIdentity::Unauthenticated { base_url, name })
}

fn normalize_imported_provider(mut provider: Provider) -> Result<Provider, AppError> {
    provider.name = provider.name.trim().to_string();
    let config = provider
        .settings_config
        .get("config")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| AppError::Config("导入的 Codex 供应商缺少 config".into()))?;
    let mut document = config
        .parse::<DocumentMut>()
        .map_err(|error| AppError::Config(format!("导入的 Codex 供应商 TOML 无效: {error}")))?;
    let active_id = document
        .get("model_provider")
        .and_then(Item::as_str)
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| AppError::Config("导入的 Codex 供应商缺少 model_provider".into()))?;
    let table = document
        .get_mut("model_providers")
        .and_then(Item::as_table_mut)
        .and_then(|providers| providers.get_mut(&active_id))
        .and_then(Item::as_table_mut)
        .ok_or_else(|| {
            AppError::Config(format!(
                "导入的 Codex 供应商缺少 [model_providers.{active_id}]"
            ))
        })?;
    let base_url = table
        .get("base_url")
        .and_then(Item::as_str)
        .map(canonical_base_url)
        .filter(|base_url| !base_url.is_empty())
        .ok_or_else(|| AppError::Config("导入的 Codex 供应商缺少 base_url".into()))?;
    table["base_url"] = value(base_url);
    provider.settings_config["config"] = serde_json::Value::String(document.to_string());
    Ok(provider)
}

fn same_endpoint_and_name(left: &Provider, right: &Provider) -> bool {
    provider_base_url(left).is_some_and(|left_url| {
        provider_base_url(right).is_some_and(|right_url| left_url == right_url)
    }) && normalized_name(&left.name) == normalized_name(&right.name)
}

fn compatible_provider(left: &Provider, right: &Provider) -> bool {
    if !same_endpoint_and_name(left, right) {
        return false;
    }
    match (provider_api_key(left), provider_api_key(right)) {
        (Some(left), Some(right)) => left == right,
        _ => true,
    }
}

fn provider_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredProvider> {
    let settings_config: String = row.get(2)?;
    let raw_meta: String = row.get(10)?;
    Ok(StoredProvider {
        provider: Provider {
            id: row.get(0)?,
            name: row.get(1)?,
            settings_config: serde_json::from_str(&settings_config)
                .unwrap_or(serde_json::Value::Null),
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
        is_current: row.get(15)?,
        failover_order: row.get(16)?,
        raw_meta,
    })
}

fn stored_codex_providers(connection: &Connection) -> Result<Vec<StoredProvider>, AppError> {
    let mut statement = connection.prepare(
        "SELECT id, name, settings_config, website_url, category, created_at, sort_index,
                notes, icon, icon_color, meta, in_failover_queue,
                source, source_id, source_dirty, is_current, failover_order
         FROM providers WHERE app_type = ?1
         ORDER BY COALESCE(sort_index, 999999), created_at, id",
    )?;
    let rows = statement.query_map([APP_TYPE], provider_from_row)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn source_matches(provider: &StoredProvider, source_id: &str) -> bool {
    provider.source == CC_SWITCH_SOURCE && provider.source_id.as_deref() == Some(source_id)
}

fn source_can_merge(provider: &StoredProvider, source_id: &str) -> bool {
    provider.source == MANUAL_SOURCE || source_matches(provider, source_id)
}

fn unique_compatible_index(
    stored: &[StoredProvider],
    incoming: &Provider,
    source_id: &str,
) -> Option<usize> {
    let mut matches = stored
        .iter()
        .enumerate()
        .filter(|(_, candidate)| source_can_merge(candidate, source_id))
        .filter(|(_, candidate)| compatible_provider(&candidate.provider, incoming));
    let (index, _) = matches.next()?;
    matches.next().is_none().then_some(index)
}

fn unique_identity_index(
    stored: &[StoredProvider],
    identity: &ProviderIdentity,
    source_id: &str,
) -> Option<usize> {
    let mut matches = stored
        .iter()
        .enumerate()
        .filter(|(_, candidate)| source_can_merge(candidate, source_id))
        .filter(|(_, candidate)| provider_identity(&candidate.provider).as_ref() == Some(identity));
    let (index, _) = matches.next()?;
    matches.next().is_none().then_some(index)
}

fn unique_provider_id(connection: &Connection, preferred: &str) -> Result<String, AppError> {
    let exists = |id: &str| -> Result<bool, AppError> {
        Ok(connection
            .query_row(
                "SELECT 1 FROM providers WHERE id = ?1 AND app_type = ?2",
                params![id, APP_TYPE],
                |_| Ok(()),
            )
            .optional()?
            .is_some())
    };
    if !exists(preferred)? {
        return Ok(preferred.to_string());
    }
    for suffix in 2usize.. {
        let candidate = format!("{preferred}-{suffix}");
        if !exists(&candidate)? {
            return Ok(candidate);
        }
    }
    unreachable!()
}

fn insert_imported_provider(
    connection: &Connection,
    provider: &Provider,
    source_id: &str,
) -> Result<(), AppError> {
    let settings_config = serde_json::to_string(&provider.settings_config)
        .map_err(|error| AppError::Database(format!("序列化导入供应商配置失败: {error}")))?;
    let meta = serde_json::to_string(&provider.meta.clone().unwrap_or_default())
        .map_err(|error| AppError::Database(format!("序列化导入供应商元数据失败: {error}")))?;
    let sort_index: i64 = connection.query_row(
        "SELECT COALESCE(MAX(sort_index), -1) + 1 FROM providers WHERE app_type = ?1",
        [APP_TYPE],
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
            provider.id,
            APP_TYPE,
            provider.name,
            settings_config,
            provider.website_url,
            provider.category,
            sort_index,
            provider.notes,
            provider.icon,
            provider.icon_color,
            meta,
            CC_SWITCH_SOURCE,
            source_id,
        ],
    )?;
    Ok(())
}

fn update_stable_import(
    connection: &Connection,
    existing: &StoredProvider,
    incoming: &Provider,
    source_id: &str,
) -> Result<(), AppError> {
    if existing.source_dirty {
        connection.execute(
            "UPDATE providers SET source = ?1, source_id = ?2
             WHERE id = ?3 AND app_type = ?4",
            params![CC_SWITCH_SOURCE, source_id, existing.provider.id, APP_TYPE],
        )?;
        return Ok(());
    }
    let settings_config = serde_json::to_string(&incoming.settings_config)
        .map_err(|error| AppError::Database(format!("序列化导入供应商配置失败: {error}")))?;
    connection.execute(
        "UPDATE providers
         SET name = ?1, settings_config = ?2, source = ?3, source_id = ?4, source_dirty = 0
         WHERE id = ?5 AND app_type = ?6",
        params![
            incoming.name,
            settings_config,
            CC_SWITCH_SOURCE,
            source_id,
            existing.provider.id,
            APP_TYPE,
        ],
    )?;
    Ok(())
}

fn attach_source_to_manual(
    connection: &Connection,
    existing_id: &str,
    source_id: &str,
) -> Result<(), AppError> {
    connection.execute(
        "UPDATE providers
         SET source = ?1, source_id = ?2, source_dirty = 1
         WHERE id = ?3 AND app_type = ?4",
        params![CC_SWITCH_SOURCE, source_id, existing_id, APP_TYPE],
    )?;
    Ok(())
}

fn reconcile_candidate(
    connection: &Connection,
    candidate: CcSwitchProviderCandidate,
) -> Result<ReconcileKind, AppError> {
    let source_id = candidate.source_id.trim();
    if source_id.is_empty() {
        return Err(AppError::Config("cc-switch 供应商缺少稳定来源 ID".into()));
    }
    let incoming = normalize_imported_provider(candidate.provider)?;
    let stored = stored_codex_providers(connection)?;
    if let Some(existing) = stored.iter().find(|row| source_matches(row, source_id)) {
        update_stable_import(connection, existing, &incoming, source_id)?;
        return Ok(ReconcileKind::Updated);
    }

    let identity = provider_identity(&incoming);
    let identity_match = identity
        .as_ref()
        .and_then(|identity| unique_identity_index(&stored, identity, source_id));
    let target = identity_match.or_else(|| unique_compatible_index(&stored, &incoming, source_id));
    if let Some(index) = target {
        attach_source_to_manual(connection, &stored[index].provider.id, source_id)?;
        return Ok(ReconcileKind::Merged);
    }

    let mut provider = incoming;
    provider.id = unique_provider_id(connection, &provider.id)?;
    insert_imported_provider(connection, &provider, source_id)?;
    Ok(ReconcileKind::Added)
}

fn is_historical_custom_id(id: &str) -> bool {
    id == "custom"
        || id.strip_prefix("custom-").is_some_and(|suffix| {
            !suffix.is_empty() && suffix.bytes().all(|byte| byte.is_ascii_digit())
        })
}

fn has_custom_endpoints(connection: &Connection, provider_id: &str) -> Result<bool, AppError> {
    Ok(connection
        .query_row(
            "SELECT 1 FROM provider_endpoints
             WHERE provider_id = ?1 AND app_type = ?2 LIMIT 1",
            params![provider_id, APP_TYPE],
            |_| Ok(()),
        )
        .optional()?
        .is_some())
}

fn consolidate_legacy_ghosts(connection: &Connection) -> Result<usize, AppError> {
    let stored = stored_codex_providers(connection)?;
    let mut remove = Vec::new();
    for ghost in stored.iter().filter(|row| {
        row.source == MANUAL_SOURCE
            && row.source_id.is_none()
            && is_historical_custom_id(&row.provider.id)
            && !row.is_current
            && !row.provider.in_failover_queue
            && row.failover_order.is_none()
            && row.raw_meta.trim() == "{}"
            && row.provider.website_url.is_none()
            && row.provider.notes.is_none()
            && row.provider.icon.is_none()
            && row.provider.icon_color.is_none()
    }) {
        if has_custom_endpoints(connection, &ghost.provider.id)? {
            continue;
        }
        let mut matches = stored.iter().filter(|candidate| {
            !is_historical_custom_id(&candidate.provider.id)
                && compatible_provider(&ghost.provider, &candidate.provider)
        });
        if matches.next().is_some() && matches.next().is_none() {
            remove.push(ghost.provider.id.clone());
        }
    }
    for id in &remove {
        connection.execute(
            "DELETE FROM providers WHERE id = ?1 AND app_type = ?2",
            params![id, APP_TYPE],
        )?;
    }
    Ok(remove.len())
}

fn codex_providers_with_endpoints(connection: &Connection) -> Result<Vec<Provider>, AppError> {
    let mut providers = stored_codex_providers(connection)?
        .into_iter()
        .map(|stored| stored.provider)
        .collect::<Vec<_>>();
    for provider in &mut providers {
        let mut statement = connection.prepare(
            "SELECT url, added_at FROM provider_endpoints
             WHERE provider_id = ?1 AND app_type = ?2
             ORDER BY added_at, url",
        )?;
        let rows = statement.query_map(params![provider.id, APP_TYPE], |row| {
            let url: String = row.get(0)?;
            Ok((
                url.clone(),
                crate::settings::CustomEndpoint {
                    url,
                    added_at: row.get::<_, Option<i64>>(1)?.unwrap_or(0),
                    last_used: None,
                },
            ))
        })?;
        let endpoints = rows.collect::<Result<HashMap<_, _>, _>>()?;
        provider
            .meta
            .get_or_insert_with(ProviderMeta::default)
            .custom_endpoints = endpoints;
    }
    Ok(providers)
}

fn reconcile_parsed(
    database: &Database,
    parsed: CcSwitchParseResult,
    fail_after: Option<usize>,
) -> Result<CcSwitchImportResult, AppError> {
    let mut connection = lock_conn!(database.conn);
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| AppError::Database(error.to_string()))?;
    let mut result = CcSwitchImportResult {
        imported: 0,
        added: 0,
        updated: 0,
        merged: 0,
        skipped: parsed.skipped,
        warnings: parsed.warnings,
        providers: Vec::new(),
    };
    for candidate in parsed.candidates {
        match reconcile_candidate(&transaction, candidate)? {
            ReconcileKind::Added => result.added += 1,
            ReconcileKind::Updated => result.updated += 1,
            ReconcileKind::Merged => result.merged += 1,
        }
        result.imported += 1;
        if fail_after == Some(result.imported) {
            return Err(AppError::Database("cc-switch import rollback test".into()));
        }
    }
    result.merged += consolidate_legacy_ghosts(&transaction)?;
    result.providers = codex_providers_with_endpoints(&transaction)?;
    transaction
        .commit()
        .map_err(|error| AppError::Database(error.to_string()))?;
    Ok(result)
}

pub fn import_ccswitch_codex_providers(
    database: &Database,
    explicit_path: Option<&str>,
) -> Result<CcSwitchImportResult, AppError> {
    let parsed = read_ccswitch_codex_candidates(explicit_path)?;
    reconcile_parsed(database, parsed, None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;
    use serde_json::json;
    use tempfile::TempDir;
    use toml_edit::{value, DocumentMut, Item, Table};

    fn provider(id: &str, name: &str, base_url: &str, api_key: Option<&str>) -> Provider {
        let mut table = Table::new();
        table["name"] = value(name);
        table["base_url"] = value(base_url);
        table["wire_api"] = value("responses");
        table["requires_openai_auth"] = value(false);
        let mut providers = Table::new();
        providers.insert(id, Item::Table(table));
        let mut document = DocumentMut::new();
        document["model_provider"] = value(id);
        document["model"] = value("gpt-5.5");
        document["model_providers"] = Item::Table(providers);
        Provider::with_id(
            id.into(),
            name.into(),
            json!({
                "auth": api_key.map(|key| json!({"OPENAI_API_KEY": key})).unwrap_or_else(|| json!({})),
                "config": document.to_string(),
            }),
            None,
        )
    }

    fn parsed(candidates: Vec<(&str, Provider)>) -> CcSwitchParseResult {
        CcSwitchParseResult {
            candidates: candidates
                .into_iter()
                .map(|(source_id, provider)| CcSwitchProviderCandidate {
                    source_id: source_id.into(),
                    provider,
                })
                .collect(),
            skipped: 0,
            warnings: Vec::new(),
        }
    }

    fn origin(database: &Database, id: &str) -> (String, Option<String>, bool) {
        let connection = database.conn.lock().expect("database lock");
        connection
            .query_row(
                "SELECT source, source_id, source_dirty FROM providers
                 WHERE id = ?1 AND app_type = 'codex'",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("provider origin")
    }

    #[test]
    fn stable_import_updates_until_locally_edited_and_preserves_stackferry_state() {
        let database = Database::memory().expect("database");
        let first = reconcile_parsed(
            &database,
            parsed(vec![(
                "relay",
                provider(
                    "relay",
                    "Relay",
                    "HTTPS://Relay.Example:443/v1/#fragment",
                    Some("key-a"),
                ),
            )]),
            None,
        )
        .expect("first import");
        assert_eq!((first.added, first.updated, first.merged), (1, 0, 0));
        let first_saved = database
            .get_provider_by_id("relay", APP_TYPE)
            .expect("read first import")
            .expect("first import");
        assert_eq!(
            crate::codex_config::extract_codex_base_url(
                first_saved.settings_config["config"]
                    .as_str()
                    .expect("first config"),
            )
            .as_deref(),
            Some("https://relay.example/v1")
        );

        {
            let connection = database.conn.lock().expect("database lock");
            connection
                .execute(
                    "UPDATE providers SET is_current = 1, in_failover_queue = 1,
                     failover_order = 7, notes = 'local note', meta = '{\"isPartner\":true}'
                     WHERE id = 'relay' AND app_type = 'codex'",
                    [],
                )
                .expect("set local state");
            connection
                .execute(
                    "INSERT INTO provider_endpoints (provider_id, app_type, url, added_at)
                     VALUES ('relay', 'codex', 'https://backup.example/v1', 9)",
                    [],
                )
                .expect("set local endpoint");
        }
        let second = reconcile_parsed(
            &database,
            parsed(vec![(
                "relay",
                provider(
                    "relay",
                    "Relay Updated",
                    "https://relay-v2.example/v1",
                    Some("key-b"),
                ),
            )]),
            None,
        )
        .expect("repeat import");
        assert_eq!(second.updated, 1);
        let imported = second
            .providers
            .iter()
            .find(|provider| provider.id == "relay")
            .expect("imported provider");
        assert!(imported
            .meta
            .as_ref()
            .expect("metadata")
            .custom_endpoints
            .contains_key("https://backup.example/v1"));
        let mut locally_edited = database
            .get_provider_by_id("relay", APP_TYPE)
            .expect("read provider")
            .expect("provider");
        assert_eq!(locally_edited.name, "Relay Updated");
        locally_edited.name = "My Relay".into();
        database
            .save_provider(APP_TYPE, &locally_edited)
            .expect("manual edit");

        reconcile_parsed(
            &database,
            parsed(vec![(
                "relay",
                provider(
                    "relay",
                    "Remote Again",
                    "https://relay-v3.example/v1",
                    Some("key-c"),
                ),
            )]),
            None,
        )
        .expect("import after local edit");
        let saved = database
            .get_provider_by_id("relay", APP_TYPE)
            .expect("read provider")
            .expect("provider");
        assert_eq!(saved.name, "My Relay");
        assert_eq!(saved.notes.as_deref(), Some("local note"));
        assert!(saved.in_failover_queue);
        let connection = database.conn.lock().expect("database lock");
        let state: (bool, i64) = connection
            .query_row(
                "SELECT is_current, failover_order FROM providers
                 WHERE id = 'relay' AND app_type = 'codex'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("state");
        assert_eq!(state, (true, 7));
        drop(connection);
        assert_eq!(
            origin(&database, "relay"),
            (CC_SWITCH_SOURCE.into(), Some("relay".into()), true)
        );
    }

    #[test]
    fn manual_match_is_preserved_and_conflicting_id_gets_suffix() {
        let database = Database::memory().expect("database");
        let mut manual = provider(
            "manual-relay",
            "My Relay",
            "HTTPS://Relay.Example:443/v1/",
            Some("same-key"),
        );
        manual.notes = Some("keep".into());
        database
            .save_provider(APP_TYPE, &manual)
            .expect("manual provider");
        let merged = reconcile_parsed(
            &database,
            parsed(vec![(
                "upstream-id",
                provider(
                    "upstream-id",
                    "Remote Name",
                    "https://relay.example/v1",
                    Some("same-key"),
                ),
            )]),
            None,
        )
        .expect("merge import");
        assert_eq!(merged.merged, 1);
        let saved = database
            .get_provider_by_id("manual-relay", APP_TYPE)
            .expect("read manual")
            .expect("manual");
        assert_eq!(saved.name, "My Relay");
        assert_eq!(saved.notes.as_deref(), Some("keep"));

        let conflicting = provider(
            "collision",
            "Manual Collision",
            "https://manual.example/v1",
            Some("manual-key"),
        );
        database
            .save_provider(APP_TYPE, &conflicting)
            .expect("collision provider");
        let added = reconcile_parsed(
            &database,
            parsed(vec![(
                "collision-source",
                provider(
                    "collision",
                    "Imported Collision",
                    "https://imported.example/v1",
                    Some("imported-key"),
                ),
            )]),
            None,
        )
        .expect("collision import");
        assert_eq!(added.added, 1);
        assert!(database
            .get_provider_by_id("collision-2", APP_TYPE)
            .expect("read suffixed")
            .is_some());
    }

    #[test]
    fn distinct_source_ids_and_credentials_remain_separate() {
        let database = Database::memory().expect("database");
        let result = reconcile_parsed(
            &database,
            parsed(vec![
                (
                    "first",
                    provider("same", "Same", "https://same.example/v1", Some("key-a")),
                ),
                (
                    "second",
                    provider("same", "Same", "https://same.example/v1", Some("key-a")),
                ),
                (
                    "third",
                    provider("same", "Same", "https://same.example/v1", Some("key-b")),
                ),
            ]),
            None,
        )
        .expect("import distinct sources");
        assert_eq!(result.added, 3);
        assert_eq!(result.providers.len(), 3);
        assert_eq!(origin(&database, "same").1.as_deref(), Some("first"));
        assert_eq!(origin(&database, "same-2").1.as_deref(), Some("second"));
        assert_eq!(origin(&database, "same-3").1.as_deref(), Some("third"));
    }

    #[test]
    fn ambiguous_manual_matches_are_not_merged() {
        let database = Database::memory().expect("database");
        for id in ["manual-a", "manual-b"] {
            database
                .save_provider(
                    APP_TYPE,
                    &provider(id, "Relay", "https://relay.example/v1", None),
                )
                .expect("manual provider");
        }
        let result = reconcile_parsed(
            &database,
            parsed(vec![(
                "remote",
                provider("remote", "Relay", "https://relay.example/v1", None),
            )]),
            None,
        )
        .expect("ambiguous import");
        assert_eq!((result.added, result.merged), (1, 0));
        assert_eq!(result.providers.len(), 3);
    }

    #[test]
    fn injected_failure_rolls_back_entire_batch() {
        let database = Database::memory().expect("database");
        let error = reconcile_parsed(
            &database,
            parsed(vec![
                (
                    "first",
                    provider("first", "First", "https://first.example/v1", None),
                ),
                (
                    "second",
                    provider("second", "Second", "https://second.example/v1", None),
                ),
            ]),
            Some(1),
        )
        .expect_err("injected failure");
        assert!(error.to_string().contains("rollback test"));
        assert!(database
            .get_all_providers(APP_TYPE)
            .expect("providers")
            .is_empty());
    }

    #[test]
    fn legacy_ghost_cleanup_skips_stateful_or_credential_distinct_rows() {
        let database = Database::memory().expect("database");
        for provider in [
            provider("custom", "Relay", "https://relay.example/v1", Some("same")),
            provider("relay", "Relay", "https://relay.example/v1", Some("same")),
            provider(
                "custom-2",
                "Other",
                "https://other.example/v1",
                Some("different"),
            ),
            provider("other", "Other", "https://other.example/v1", Some("kept")),
        ] {
            database
                .save_provider(APP_TYPE, &provider)
                .expect("save fixture");
        }
        let result = reconcile_parsed(&database, parsed(Vec::new()), None).expect("cleanup");
        assert_eq!(result.merged, 1);
        assert!(database
            .get_provider_by_id("custom", APP_TYPE)
            .expect("custom")
            .is_none());
        assert!(database
            .get_provider_by_id("custom-2", APP_TYPE)
            .expect("custom-2")
            .is_some());
    }

    #[test]
    fn file_import_is_read_only_idempotent_and_preserves_unrelated_target_state() {
        let source_dir = TempDir::new().expect("source temp dir");
        let source_path = source_dir.path().join("cc-switch.db");
        let source = Connection::open(&source_path).expect("source database");
        source
            .execute_batch(
                "CREATE TABLE providers (
                    id TEXT NOT NULL,
                    app_type TEXT NOT NULL,
                    name TEXT NOT NULL,
                    settings_config TEXT NOT NULL,
                    sort_index INTEGER,
                    created_at INTEGER,
                    category TEXT
                );",
            )
            .expect("source schema");
        let valid = |id: &str, name: &str, base_url: &str, key: &str| {
            json!({
                "auth": {"OPENAI_API_KEY": key},
                "config": format!(
                    "model = \"gpt-5.5\"\nmodel_provider = \"stale\"\n\n[model_providers.{id}]\nname = \"{name}\"\nbase_url = \"{base_url}\"\n"
                ),
            })
            .to_string()
        };
        for (id, app_type, name, settings, sort, category) in [
            (
                "alpha",
                "codex",
                "Alpha",
                valid("alpha", "Alpha", "https://alpha.example/v1", "alpha-key"),
                0,
                None,
            ),
            (
                "beta",
                "codex",
                "Beta",
                valid("beta", "Beta", "https://beta.example/v1", "beta-key"),
                1,
                None,
            ),
            (
                "codex-official",
                "codex",
                "Official",
                valid(
                    "codex-official",
                    "Official",
                    "https://official.example/v1",
                    "official-key",
                ),
                2,
                Some("official"),
            ),
            (
                "malformed",
                "codex",
                "Malformed",
                "{not-json".into(),
                3,
                None,
            ),
            ("ignored", "claude", "Ignored", "{not-json".into(), 0, None),
        ] {
            source
                .execute(
                    "INSERT INTO providers
                     (id, app_type, name, settings_config, sort_index, created_at, category)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6)",
                    params![id, app_type, name, settings, sort, category],
                )
                .expect("source row");
        }
        drop(source);
        let source_before = std::fs::read(&source_path).expect("source bytes before");

        let database = Database::memory().expect("target database");
        let sentinel = provider(
            "sentinel",
            "Sentinel",
            "https://sentinel.example/v1",
            Some("sentinel-key"),
        );
        database
            .save_provider(APP_TYPE, &sentinel)
            .expect("sentinel provider");
        {
            let connection = database.conn.lock().expect("database lock");
            connection
                .execute_batch(
                    "UPDATE providers
                     SET is_current = 1, in_failover_queue = 1, failover_order = 6
                     WHERE id = 'sentinel' AND app_type = 'codex';
                     INSERT INTO profiles (id, name, payload, sort_order)
                     VALUES ('profile-1', 'Profile', '{\"codex\":\"sentinel\"}', 3);
                     UPDATE proxy_config
                     SET proxy_enabled = 1, enabled = 1, auto_failover_enabled = 1
                     WHERE app_type = 'codex';",
                )
                .expect("target invariants");
        }

        let explicit_path = source_path.to_str().expect("UTF-8 source path");
        let first = import_ccswitch_codex_providers(&database, Some(explicit_path))
            .expect("first file import");
        assert_eq!(
            (first.imported, first.added, first.updated, first.skipped),
            (2, 2, 0, 2)
        );
        let second = import_ccswitch_codex_providers(&database, Some(explicit_path))
            .expect("repeat file import");
        assert_eq!(
            (
                second.imported,
                second.added,
                second.updated,
                second.skipped
            ),
            (2, 0, 2, 2)
        );
        assert_eq!(second.providers.len(), 3);
        assert_eq!(
            std::fs::read(&source_path).expect("source bytes after"),
            source_before
        );

        let connection = database.conn.lock().expect("database lock");
        let route_state: (bool, bool, i64) = connection
            .query_row(
                "SELECT is_current, in_failover_queue, failover_order
                 FROM providers WHERE id = 'sentinel' AND app_type = 'codex'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("provider state");
        assert_eq!(route_state, (true, true, 6));
        let profile: (String, i64) = connection
            .query_row(
                "SELECT payload, sort_order FROM profiles WHERE id = 'profile-1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("profile state");
        assert_eq!(profile, ("{\"codex\":\"sentinel\"}".into(), 3));
        let proxy_state: (bool, bool, bool) = connection
            .query_row(
                "SELECT proxy_enabled, enabled, auto_failover_enabled
                 FROM proxy_config WHERE app_type = 'codex'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("proxy state");
        assert_eq!(proxy_state, (true, true, true));
    }
}
