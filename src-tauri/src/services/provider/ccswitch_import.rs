use crate::error::AppError;
use crate::provider::Provider;
use rusqlite::{Connection, OpenFlags};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use toml_edit::{value, DocumentMut, Item, Table};

const CC_SWITCH_DB_FILE: &str = "cc-switch.db";

#[derive(Clone, Copy)]
enum HostPlatform {
    #[cfg(any(test, target_os = "linux"))]
    Linux,
    #[cfg(any(test, target_os = "windows"))]
    Windows,
    #[cfg(any(test, target_os = "macos"))]
    Macos,
}

struct CandidateRoots {
    platform: HostPlatform,
    home: PathBuf,
    cc_switch_home: Option<PathBuf>,
    data_dir: Option<PathBuf>,
    data_local_dir: Option<PathBuf>,
    #[cfg(any(test, target_os = "linux"))]
    xdg_data_home: Option<PathBuf>,
    #[cfg(any(test, target_os = "windows"))]
    appdata: Option<PathBuf>,
    #[cfg(any(test, target_os = "windows"))]
    localappdata: Option<PathBuf>,
}

#[derive(Clone)]
struct CcSwitchCodexRow {
    id: String,
    name: String,
    settings_config: String,
    category: Option<String>,
}

#[derive(Clone)]
struct CcSwitchCodexSection {
    id: String,
    name: Option<String>,
    base_url: String,
    model: Option<String>,
    wire_api: String,
    requires_openai_auth: bool,
    experimental_bearer_token: Option<String>,
}

pub(crate) struct CcSwitchProviderCandidate {
    pub source_id: String,
    pub provider: Provider,
}

pub(crate) struct CcSwitchParseResult {
    pub candidates: Vec<CcSwitchProviderCandidate>,
    pub skipped: usize,
    pub warnings: Vec<String>,
}

fn current_platform() -> HostPlatform {
    #[cfg(target_os = "linux")]
    return HostPlatform::Linux;
    #[cfg(target_os = "windows")]
    return HostPlatform::Windows;
    #[cfg(target_os = "macos")]
    return HostPlatform::Macos;
}

fn runtime_candidate_roots() -> Result<CandidateRoots, AppError> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::Config("无法确定用户目录，不能查找 cc-switch 数据库".into()))?;
    Ok(CandidateRoots {
        platform: current_platform(),
        home,
        cc_switch_home: std::env::var_os("CC_SWITCH_HOME").map(PathBuf::from),
        data_dir: dirs::data_dir(),
        data_local_dir: dirs::data_local_dir(),
        #[cfg(any(test, target_os = "linux"))]
        xdg_data_home: std::env::var_os("XDG_DATA_HOME").map(PathBuf::from),
        #[cfg(any(test, target_os = "windows"))]
        appdata: std::env::var_os("APPDATA").map(PathBuf::from),
        #[cfg(any(test, target_os = "windows"))]
        localappdata: std::env::var_os("LOCALAPPDATA").map(PathBuf::from),
    })
}

fn push_candidate(candidates: &mut Vec<PathBuf>, candidate: PathBuf) {
    if !candidates.contains(&candidate) {
        candidates.push(candidate);
    }
}

fn push_named_data_candidates(candidates: &mut Vec<PathBuf>, root: &Path) {
    for directory in ["com.ccswitch.desktop", "cc-switch", "CC Switch"] {
        push_candidate(candidates, root.join(directory).join(CC_SWITCH_DB_FILE));
    }
}

fn ccswitch_db_candidates_from(roots: &CandidateRoots) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(root) = roots
        .cc_switch_home
        .as_ref()
        .filter(|path| !path.as_os_str().is_empty())
    {
        push_candidate(&mut candidates, root.join(CC_SWITCH_DB_FILE));
    }
    push_candidate(
        &mut candidates,
        roots.home.join(".cc-switch").join(CC_SWITCH_DB_FILE),
    );
    if let Some(root) = &roots.data_dir {
        push_named_data_candidates(&mut candidates, root);
    }
    if let Some(root) = &roots.data_local_dir {
        push_named_data_candidates(&mut candidates, root);
    }

    match roots.platform {
        #[cfg(any(test, target_os = "macos"))]
        HostPlatform::Macos => push_candidate(
            &mut candidates,
            roots
                .home
                .join("Library/Application Support/com.ccswitch.desktop")
                .join(CC_SWITCH_DB_FILE),
        ),
        #[cfg(any(test, target_os = "windows"))]
        HostPlatform::Windows => {
            if let Some(root) = &roots.appdata {
                push_candidate(
                    &mut candidates,
                    root.join("com.ccswitch.desktop").join(CC_SWITCH_DB_FILE),
                );
            }
            if let Some(root) = &roots.localappdata {
                push_candidate(
                    &mut candidates,
                    root.join("com.ccswitch.desktop").join(CC_SWITCH_DB_FILE),
                );
            }
        }
        #[cfg(any(test, target_os = "linux"))]
        HostPlatform::Linux => {
            if let Some(root) = &roots.xdg_data_home {
                push_candidate(
                    &mut candidates,
                    root.join("com.ccswitch.desktop").join(CC_SWITCH_DB_FILE),
                );
            }
            push_candidate(
                &mut candidates,
                roots
                    .home
                    .join(".local/share/com.ccswitch.desktop")
                    .join(CC_SWITCH_DB_FILE),
            );
        }
    }
    candidates
}

pub(crate) fn ccswitch_db_candidates() -> Result<Vec<PathBuf>, AppError> {
    Ok(ccswitch_db_candidates_from(&runtime_candidate_roots()?))
}

fn resolve_existing_ccswitch_db(
    explicit_path: Option<&str>,
    candidates: &[PathBuf],
) -> Result<PathBuf, AppError> {
    let explicit = explicit_path
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(PathBuf::from);
    let selected = explicit
        .or_else(|| candidates.iter().find(|path| path.exists()).cloned())
        .or_else(|| candidates.first().cloned())
        .ok_or_else(|| AppError::Config("无法生成 cc-switch 数据库候选路径".into()))?;
    if selected.exists() {
        return Ok(selected);
    }

    let checked = candidates
        .iter()
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>()
        .join("\n- ");
    Err(AppError::Config(format!(
        "cc-switch 数据库不存在: {}\n已检查候选路径:\n- {checked}",
        selected.display()
    )))
}

pub(crate) fn resolve_ccswitch_db_path(explicit_path: Option<&str>) -> Result<PathBuf, AppError> {
    let candidates = ccswitch_db_candidates()?;
    resolve_existing_ccswitch_db(explicit_path, &candidates)
}

fn table_columns(connection: &Connection, table: &str) -> Result<Vec<String>, AppError> {
    let mut statement = connection.prepare(&format!("PRAGMA table_info({table})"))?;
    let rows = statement.query_map([], |row| row.get::<_, String>(1))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn read_ccswitch_codex_rows(connection: &Connection) -> Result<Vec<CcSwitchCodexRow>, AppError> {
    let columns = table_columns(connection, "providers")?;
    let category = if columns.iter().any(|column| column == "category") {
        "category"
    } else {
        "NULL"
    };
    let sql = format!(
        "SELECT id, name, settings_config, {category} FROM providers
         WHERE app_type = 'codex' ORDER BY sort_index ASC, created_at ASC"
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map([], |row| {
        Ok(CcSwitchCodexRow {
            id: row.get(0)?,
            name: row.get(1)?,
            settings_config: row.get(2)?,
            category: row.get(3)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn is_official_row(row: &CcSwitchCodexRow) -> bool {
    row.id.trim().eq_ignore_ascii_case("codex-official")
        || row
            .category
            .as_deref()
            .is_some_and(|category| category.trim().eq_ignore_ascii_case("official"))
}

fn table_string(table: &Table, key: &str) -> Option<String> {
    table
        .get(key)
        .and_then(Item::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn top_level_string(document: &DocumentMut, key: &str) -> Option<String> {
    document
        .get(key)
        .and_then(Item::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn section_from_table(
    id: &str,
    table: &Table,
    model: Option<String>,
) -> Option<CcSwitchCodexSection> {
    let base_url = table_string(table, "base_url")?
        .trim_end_matches('/')
        .to_string();
    if base_url.is_empty() {
        return None;
    }
    Some(CcSwitchCodexSection {
        id: id.to_string(),
        name: table_string(table, "name"),
        base_url,
        model,
        wire_api: table_string(table, "wire_api").unwrap_or_else(|| "responses".into()),
        requires_openai_auth: table
            .get("requires_openai_auth")
            .and_then(Item::as_bool)
            .unwrap_or(false),
        experimental_bearer_token: table_string(table, "experimental_bearer_token"),
    })
}

fn sections_from_config(config: &str) -> Vec<CcSwitchCodexSection> {
    let Ok(document) = config.parse::<DocumentMut>() else {
        return Vec::new();
    };
    let model = top_level_string(&document, "model");
    let Some(providers) = document.get("model_providers").and_then(Item::as_table) else {
        return Vec::new();
    };
    providers
        .iter()
        .filter_map(|(id, item)| {
            item.as_table()
                .and_then(|table| section_from_table(id, table, model.clone()))
        })
        .collect()
}

fn sanitize_provider_id(input: &str) -> String {
    let mut output = String::new();
    let mut last_was_dash = false;
    for character in input.trim().to_ascii_lowercase().chars() {
        if character.is_ascii_alphanumeric() {
            output.push(character);
            last_was_dash = false;
        } else if !last_was_dash {
            output.push('-');
            last_was_dash = true;
        }
    }
    output.trim_matches('-').to_string()
}

fn imported_provider_id(source_id: &str) -> Option<String> {
    let id = sanitize_provider_id(source_id);
    if id.is_empty() {
        return None;
    }
    if matches!(
        id.as_str(),
        "openai" | "custom" | "amazon-bedrock" | "ollama" | "lmstudio" | "oss"
    ) {
        Some(format!("{id}-custom"))
    } else {
        Some(id)
    }
}

fn experimental_bearer_token(
    document: &DocumentMut,
    active_provider: Option<&str>,
) -> Option<String> {
    active_provider
        .and_then(|id| {
            document
                .get("model_providers")
                .and_then(Item::as_table)
                .and_then(|providers| providers.get(id))
                .and_then(Item::as_table)
                .and_then(|table| table_string(table, "experimental_bearer_token"))
        })
        .or_else(|| top_level_string(document, "experimental_bearer_token"))
}

fn select_section(
    row: &CcSwitchCodexRow,
    settings: &Value,
    global_sections: &HashMap<String, CcSwitchCodexSection>,
) -> Option<CcSwitchCodexSection> {
    let provider_id = imported_provider_id(&row.id)?;
    for exact_id in [provider_id.as_str(), row.id.trim()] {
        if let Some(section) = global_sections.get(exact_id) {
            return Some(section.clone());
        }
    }

    let config = settings.get("config").and_then(Value::as_str)?;
    let document = config.parse::<DocumentMut>().ok()?;
    let model = top_level_string(&document, "model");
    let active_provider = top_level_string(&document, "model_provider");
    if let Some(providers) = document.get("model_providers").and_then(Item::as_table) {
        for exact_id in [provider_id.as_str(), row.id.trim()] {
            if let Some(section) = providers
                .get(exact_id)
                .and_then(Item::as_table)
                .and_then(|table| section_from_table(exact_id, table, model.clone()))
            {
                return Some(section);
            }
        }
        if active_provider.as_deref() == Some(row.id.trim())
            || active_provider.as_deref() == Some(provider_id.as_str())
        {
            if let Some(active) = active_provider.as_deref() {
                if let Some(section) = providers
                    .get(active)
                    .and_then(Item::as_table)
                    .and_then(|table| section_from_table(active, table, model.clone()))
                {
                    return Some(section);
                }
            }
        }
        if active_provider
            .as_deref()
            .is_none_or(|active| active == "custom")
        {
            if let Some(section) = providers
                .get("custom")
                .and_then(Item::as_table)
                .and_then(|table| section_from_table("custom", table, model.clone()))
            {
                return Some(section);
            }
        }
    }

    document
        .get("base_url")
        .and_then(Item::as_str)
        .map(str::trim)
        .filter(|base_url| !base_url.is_empty())
        .map(|base_url| CcSwitchCodexSection {
            id: provider_id,
            name: None,
            base_url: base_url.trim_end_matches('/').to_string(),
            model,
            wire_api: "responses".into(),
            requires_openai_auth: false,
            experimental_bearer_token: experimental_bearer_token(
                &document,
                active_provider.as_deref(),
            ),
        })
}

fn auth_api_key(settings: &Value) -> Option<String> {
    settings
        .pointer("/auth/OPENAI_API_KEY")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn build_provider_config(
    id: &str,
    name: &str,
    section: &CcSwitchCodexSection,
    api_key: Option<&str>,
) -> Value {
    let model = section.model.as_deref().unwrap_or("gpt-5.5");
    let mut provider_table = Table::new();
    provider_table["name"] = value(name);
    provider_table["base_url"] = value(&section.base_url);
    provider_table["wire_api"] = value(&section.wire_api);
    provider_table["requires_openai_auth"] = value(section.requires_openai_auth);

    let mut providers = Table::new();
    providers.insert(id, Item::Table(provider_table));
    let mut document = DocumentMut::new();
    document["model_provider"] = value(id);
    document["model"] = value(model);
    document["model_providers"] = Item::Table(providers);

    let auth = api_key
        .map(|key| json!({"OPENAI_API_KEY": key}))
        .unwrap_or_else(|| json!({}));
    json!({"auth": auth, "config": document.to_string()})
}

fn safe_warning_label(value: &str) -> String {
    let mut output = value
        .chars()
        .filter(|character| !character.is_control())
        .take(120)
        .collect::<String>();
    if output.trim().is_empty() {
        output = "未命名".into();
    }
    output
}

fn parse_rows(rows: Vec<CcSwitchCodexRow>) -> CcSwitchParseResult {
    let mut global_sections = HashMap::new();
    for row in rows.iter().filter(|row| !is_official_row(row)) {
        let Ok(settings) = serde_json::from_str::<Value>(&row.settings_config) else {
            continue;
        };
        let Some(config) = settings.get("config").and_then(Value::as_str) else {
            continue;
        };
        for section in sections_from_config(config) {
            global_sections.entry(section.id.clone()).or_insert(section);
        }
    }

    let mut result = CcSwitchParseResult {
        candidates: Vec::new(),
        skipped: 0,
        warnings: Vec::new(),
    };
    for row in rows {
        let label = format!(
            "{} ({})",
            safe_warning_label(&row.name),
            safe_warning_label(&row.id)
        );
        if is_official_row(&row) {
            result.skipped += 1;
            result
                .warnings
                .push(format!("跳过 {label}：官方认证不作为第三方供应商导入"));
            continue;
        }
        let Some(id) = imported_provider_id(&row.id) else {
            result.skipped += 1;
            result
                .warnings
                .push(format!("跳过 {label}：供应商 ID 无效"));
            continue;
        };
        let Ok(settings) = serde_json::from_str::<Value>(&row.settings_config) else {
            result.skipped += 1;
            result
                .warnings
                .push(format!("跳过 {label}：settings_config 不是有效 JSON"));
            continue;
        };
        let Some(section) = select_section(&row, &settings, &global_sections) else {
            result.skipped += 1;
            result
                .warnings
                .push(format!("跳过 {label}：未找到可用 config/base_url"));
            continue;
        };
        let name = if row.name.trim().is_empty() {
            section
                .name
                .clone()
                .unwrap_or_else(|| row.id.trim().to_string())
        } else {
            row.name.trim().to_string()
        };
        let api_key = auth_api_key(&settings).or(section.experimental_bearer_token.clone());
        let provider = Provider::with_id(
            id.clone(),
            name.clone(),
            build_provider_config(&id, &name, &section, api_key.as_deref()),
            None,
        );
        result.candidates.push(CcSwitchProviderCandidate {
            source_id: row.id.trim().to_string(),
            provider,
        });
    }
    result
}

pub(crate) fn read_ccswitch_codex_candidates(
    explicit_path: Option<&str>,
) -> Result<CcSwitchParseResult, AppError> {
    let path = resolve_ccswitch_db_path(explicit_path)?;
    let connection = Connection::open_with_flags(
        &path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|error| {
        AppError::Database(format!(
            "打开 cc-switch 数据库失败 {}: {error}",
            path.display()
        ))
    })?;
    Ok(parse_rows(read_ccswitch_codex_rows(&connection)?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;
    use tempfile::TempDir;

    fn roots(platform: HostPlatform, root: &Path) -> CandidateRoots {
        CandidateRoots {
            platform,
            home: root.join("home"),
            cc_switch_home: Some(root.join("override")),
            data_dir: Some(root.join("data")),
            data_local_dir: Some(root.join("data-local")),
            xdg_data_home: Some(root.join("xdg")),
            appdata: Some(root.join("appdata")),
            localappdata: Some(root.join("localappdata")),
        }
    }

    fn create_source_db(path: &Path, include_category: bool) -> Connection {
        let connection = Connection::open(path).expect("create cc-switch fixture");
        let category_column = if include_category {
            ", category TEXT"
        } else {
            ""
        };
        connection
            .execute_batch(&format!(
                "CREATE TABLE providers (
                    id TEXT NOT NULL,
                    app_type TEXT NOT NULL,
                    name TEXT NOT NULL,
                    settings_config TEXT NOT NULL,
                    sort_index INTEGER,
                    created_at INTEGER
                    {category_column}
                );"
            ))
            .expect("create providers table");
        connection
    }

    fn settings(config: &str, api_key: Option<&str>) -> String {
        json!({
            "auth": api_key.map(|key| json!({"OPENAI_API_KEY": key})).unwrap_or_else(|| json!({})),
            "config": config,
        })
        .to_string()
    }

    fn config_base_url(provider: &Provider) -> String {
        crate::codex_config::extract_codex_base_url(
            provider.settings_config["config"]
                .as_str()
                .expect("candidate config"),
        )
        .expect("candidate base URL")
    }

    #[test]
    fn candidate_builder_preserves_precedence_and_platform_fallbacks() {
        let temp = TempDir::new().expect("temp dir");
        for (platform, suffix) in [
            (HostPlatform::Linux, ".local/share/com.ccswitch.desktop"),
            (
                HostPlatform::Macos,
                "Library/Application Support/com.ccswitch.desktop",
            ),
            (HostPlatform::Windows, "appdata/com.ccswitch.desktop"),
        ] {
            let candidates = ccswitch_db_candidates_from(&roots(platform, temp.path()));
            assert_eq!(
                candidates[0],
                temp.path().join("override").join(CC_SWITCH_DB_FILE)
            );
            assert_eq!(
                candidates[1],
                temp.path().join("home/.cc-switch").join(CC_SWITCH_DB_FILE)
            );
            assert!(candidates
                .iter()
                .any(|path| path.ends_with(Path::new(suffix).join(CC_SWITCH_DB_FILE))));
            let unique = candidates.iter().collect::<std::collections::HashSet<_>>();
            assert_eq!(unique.len(), candidates.len());
        }
    }

    #[test]
    fn resolver_uses_first_existing_candidate_and_reports_all_missing_paths() {
        let temp = TempDir::new().expect("temp dir");
        let first = temp.path().join("first.db");
        let second = temp.path().join("second.db");
        std::fs::write(&second, []).expect("create second candidate");
        assert_eq!(
            resolve_existing_ccswitch_db(None, &[first.clone(), second.clone()])
                .expect("resolve existing candidate"),
            second
        );

        let missing = temp.path().join("explicit.db");
        let error = resolve_existing_ccswitch_db(
            Some(missing.to_str().expect("UTF-8 path")),
            &[first.clone()],
        )
        .expect_err("missing database should fail")
        .to_string();
        assert!(error.contains(&missing.display().to_string()));
        assert!(error.contains(&first.display().to_string()));
    }

    #[test]
    fn sqlite_reader_filters_orders_and_supports_legacy_category_schema() {
        for include_category in [true, false] {
            let temp = TempDir::new().expect("temp dir");
            let path = temp.path().join(CC_SWITCH_DB_FILE);
            let connection = create_source_db(&path, include_category);
            let config = settings(
                r#"model = "gpt-5.5"
[model_providers.custom]
base_url = "https://example.com/v1"
"#,
                Some("sk-test"),
            );
            let insert = if include_category {
                "INSERT INTO providers
                 (id, app_type, name, settings_config, sort_index, created_at, category)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
            } else {
                "INSERT INTO providers
                 (id, app_type, name, settings_config, sort_index, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
            };
            for (id, app, sort, created, category) in [
                ("later", "codex", 1, 1, None),
                ("ignored", "claude", 0, 1, None),
                ("first", "codex", 0, 2, None),
                ("codex-official", "codex", 2, 1, Some("official")),
            ] {
                if include_category {
                    connection
                        .execute(
                            insert,
                            params![id, app, id, config, sort, created, category],
                        )
                        .expect("insert current row");
                } else {
                    connection
                        .execute(insert, params![id, app, id, config, sort, created])
                        .expect("insert legacy row");
                }
            }
            drop(connection);

            let result = read_ccswitch_codex_candidates(Some(path.to_str().expect("UTF-8 path")))
                .expect("read cc-switch candidates");
            assert_eq!(
                result
                    .candidates
                    .iter()
                    .map(|candidate| candidate.source_id.as_str())
                    .collect::<Vec<_>>(),
                ["first", "later"]
            );
            assert_eq!(result.skipped, 1);
        }
    }

    #[test]
    fn parser_matches_row_identity_before_stale_active_provider() {
        let rows = vec![
            CcSwitchCodexRow {
                id: "sky".into(),
                name: "Sky".into(),
                settings_config: settings(
                    r#"model = "sky-model"
model_provider = "magic"
[model_providers.magic]
base_url = "https://magic.example/v1"
"#,
                    Some("sk-sky"),
                ),
                category: None,
            },
            CcSwitchCodexRow {
                id: "magic".into(),
                name: "Magic".into(),
                settings_config: settings(
                    r#"model = "magic-model"
model_provider = "sky"
[model_providers.magic]
base_url = "https://magic.example/v1"
[model_providers.sky]
base_url = "https://sky.example/v1"
"#,
                    Some("sk-magic"),
                ),
                category: None,
            },
        ];
        let result = parse_rows(rows);
        assert_eq!(result.candidates.len(), 2);
        assert_eq!(
            config_base_url(&result.candidates[0].provider),
            "https://sky.example/v1"
        );
        assert_eq!(
            config_base_url(&result.candidates[1].provider),
            "https://magic.example/v1"
        );
    }

    #[test]
    fn parser_supports_bearer_custom_root_defaults_and_sanitized_warnings() {
        let rows = vec![
            CcSwitchCodexRow {
                id: "openai".into(),
                name: "Proxy".into(),
                settings_config: settings(
                    r#"[model_providers.custom]
base_url = "https://proxy.example/v1/"
experimental_bearer_token = "sk-bearer-secret"
"#,
                    None,
                ),
                category: None,
            },
            CcSwitchCodexRow {
                id: "root-provider".into(),
                name: "Root".into(),
                settings_config: settings(
                    r#"base_url = "https://root.example/v1/"
experimental_bearer_token = "sk-root-secret"
"#,
                    None,
                ),
                category: None,
            },
            CcSwitchCodexRow {
                id: "broken\nid".into(),
                name: "Broken\rName".into(),
                settings_config:
                    r#"{"auth":{"OPENAI_API_KEY":"sk-must-not-leak"},"config":"not toml"}"#.into(),
                category: None,
            },
        ];
        let result = parse_rows(rows);
        assert_eq!(result.candidates[0].provider.id, "openai-custom");
        assert_eq!(
            config_base_url(&result.candidates[0].provider),
            "https://proxy.example/v1"
        );
        assert_eq!(
            result.candidates[0].provider.settings_config["auth"]["OPENAI_API_KEY"],
            "sk-bearer-secret"
        );
        assert_eq!(
            config_base_url(&result.candidates[1].provider),
            "https://root.example/v1"
        );
        assert!(result.candidates[0].provider.settings_config["config"]
            .as_str()
            .expect("config")
            .contains("gpt-5.5"));
        assert_eq!(result.skipped, 1);
        assert!(result.warnings.iter().all(|warning| {
            !warning.contains('\n')
                && !warning.contains('\r')
                && !warning.contains("sk-must-not-leak")
        }));
    }
}
