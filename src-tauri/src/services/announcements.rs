use chrono::{DateTime, Utc};
use futures::StreamExt;
use semver::Version;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::OnceLock;
use std::time::Duration;
use tokio::sync::Mutex;

const ANNOUNCEMENT_URL: &str =
    "https://ninthless.github.io/StackFerry/announcements/announcements.json";
const CACHE_FILE: &str = "announcements.json";
const CACHE_TTL_SECONDS: i64 = 30 * 60;
const MAX_RESPONSE_BYTES: usize = 256 * 1024;
const MAX_ANNOUNCEMENTS: usize = 50;
const MAX_BODY_LENGTH: usize = 16 * 1024;
const BUNDLED_MANIFEST: &str =
    include_str!("../../../announcements/announcements.json");

static ANNOUNCEMENT_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnnouncementManifest {
    schema_version: u32,
    generated_at: String,
    announcements: Vec<AnnouncementRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnnouncementRecord {
    id: String,
    category: String,
    severity: String,
    published_at: String,
    #[serde(default)]
    expires_at: Option<String>,
    #[serde(default)]
    min_app_version: Option<String>,
    #[serde(default)]
    max_app_version: Option<String>,
    platforms: Vec<String>,
    channels: Vec<String>,
    #[serde(default)]
    related_version: Option<String>,
    locales: BTreeMap<String, AnnouncementLocalizedContent>,
    #[serde(default)]
    actions: Vec<AnnouncementAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnnouncementLocalizedContent {
    title: String,
    summary: String,
    body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnnouncementAction {
    #[serde(rename = "type")]
    action_type: String,
    #[serde(default)]
    url: Option<String>,
    label: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AnnouncementStore {
    schema_version: u32,
    #[serde(default)]
    manifest: Option<AnnouncementManifest>,
    #[serde(default)]
    etag: Option<String>,
    #[serde(default)]
    last_modified: Option<String>,
    #[serde(default)]
    fetched_at: Option<i64>,
    #[serde(default)]
    read_ids: BTreeSet<String>,
    #[serde(default)]
    dismissed_ids: BTreeSet<String>,
    #[serde(default)]
    acknowledged_ids: BTreeSet<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnouncementView {
    pub id: String,
    pub category: String,
    pub severity: String,
    pub published_at: String,
    pub related_version: Option<String>,
    pub title: String,
    pub summary: String,
    pub body: String,
    pub actions: Vec<AnnouncementActionView>,
    pub read: bool,
    pub dismissed: bool,
    pub acknowledged: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnouncementActionView {
    #[serde(rename = "type")]
    pub action_type: String,
    pub url: Option<String>,
    pub label: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnouncementFeed {
    pub announcements: Vec<AnnouncementView>,
    pub unread_count: usize,
    pub fetched_at: Option<i64>,
    pub stale: bool,
    pub refresh_error: Option<String>,
}

enum FetchResult {
    NotModified,
    Updated {
        manifest: AnnouncementManifest,
        etag: Option<String>,
        last_modified: Option<String>,
    },
}

pub struct AnnouncementService;

impl AnnouncementService {
    pub async fn get_feed(language: &str, force_refresh: bool) -> Result<AnnouncementFeed, String> {
        let _guard = announcement_lock()
            .lock()
            .await;
        let mut store = load_store();
        let should_refresh = force_refresh || cache_expired(store.fetched_at);
        let mut refresh_error = None;

        if should_refresh {
            match fetch_manifest(&store).await {
                Ok(FetchResult::NotModified) => {
                    store.fetched_at = Some(Utc::now().timestamp());
                    save_store(&store)?;
                }
                Ok(FetchResult::Updated {
                    manifest,
                    etag,
                    last_modified,
                }) => {
                    store.manifest = Some(manifest);
                    store.etag = etag;
                    store.last_modified = last_modified;
                    store.fetched_at = Some(Utc::now().timestamp());
                    prune_state(&mut store);
                    save_store(&store)?;
                }
                Err(error) => {
                    refresh_error = Some(error);
                }
            }
        }

        let manifest = store
            .manifest
            .clone()
            .unwrap_or_else(bundled_manifest);
        Ok(build_feed(
            &store,
            &manifest,
            language,
            refresh_error,
            should_refresh && store.manifest.is_none(),
        ))
    }

    pub async fn mark_read(id: &str) -> Result<(), String> {
        mutate_state(id, |store, id| {
            store.read_ids.insert(id.to_string());
        })
        .await
    }

    pub async fn mark_all_read() -> Result<(), String> {
        let _guard = announcement_lock()
            .lock()
            .await;
        let mut store = load_store();
        let manifest = store
            .manifest
            .clone()
            .unwrap_or_else(bundled_manifest);
        for announcement in visible_records(&manifest) {
            store.read_ids.insert(announcement.id.clone());
        }
        save_store(&store)
    }

    pub async fn dismiss(id: &str) -> Result<(), String> {
        mutate_state(id, |store, id| {
            store.dismissed_ids.insert(id.to_string());
            store.read_ids.insert(id.to_string());
        })
        .await
    }

    pub async fn acknowledge(id: &str) -> Result<(), String> {
        mutate_state(id, |store, id| {
            store.acknowledged_ids.insert(id.to_string());
            store.read_ids.insert(id.to_string());
        })
        .await
    }
}

fn announcement_lock() -> &'static Mutex<()> {
    ANNOUNCEMENT_LOCK.get_or_init(|| Mutex::new(()))
}

fn cache_path() -> std::path::PathBuf {
    crate::config::get_app_config_dir().join(CACHE_FILE)
}

fn load_store() -> AnnouncementStore {
    let path = cache_path();
    match crate::config::read_json_file::<AnnouncementStore>(&path) {
        Ok(mut store) => {
            store.schema_version = 1;
            store
        }
        Err(error) => {
            if path.exists() {
                log::warn!("公告缓存不可用，将使用内置公告: {error}");
            }
            AnnouncementStore {
                schema_version: 1,
                ..Default::default()
            }
        }
    }
}

fn save_store(store: &AnnouncementStore) -> Result<(), String> {
    crate::config::write_json_file(&cache_path(), store).map_err(|error| error.to_string())
}

fn cache_expired(fetched_at: Option<i64>) -> bool {
    fetched_at.is_none_or(|timestamp| Utc::now().timestamp() - timestamp >= CACHE_TTL_SECONDS)
}

async fn fetch_manifest(store: &AnnouncementStore) -> Result<FetchResult, String> {
    let client = crate::proxy::http_client::get();
    let mut request = client
        .get(ANNOUNCEMENT_URL)
        .timeout(Duration::from_secs(15))
        .header(reqwest::header::ACCEPT, "application/json")
        .header(reqwest::header::USER_AGENT, "StackFerry-Announcements");
    if let Some(etag) = store.etag.as_deref() {
        request = request.header(reqwest::header::IF_NONE_MATCH, etag);
    }
    if let Some(last_modified) = store.last_modified.as_deref() {
        request = request.header(reqwest::header::IF_MODIFIED_SINCE, last_modified);
    }

    let response = request
        .send()
        .await
        .map_err(|error| format!("获取公告失败: {error}"))?;
    if response.status() == reqwest::StatusCode::NOT_MODIFIED {
        return Ok(FetchResult::NotModified);
    }
    if !response.status().is_success() {
        return Err(format!("公告服务返回 HTTP {}", response.status()));
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err("公告响应超过 256 KiB".to_string());
    }

    let etag = header_string(response.headers(), reqwest::header::ETAG);
    let last_modified = header_string(response.headers(), reqwest::header::LAST_MODIFIED);
    let mut body = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("读取公告响应失败: {error}"))?;
        if body.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return Err("公告响应超过 256 KiB".to_string());
        }
        body.extend_from_slice(&chunk);
    }

    let manifest: AnnouncementManifest =
        serde_json::from_slice(&body).map_err(|error| format!("公告 JSON 无效: {error}"))?;
    validate_manifest(&manifest)?;
    Ok(FetchResult::Updated {
        manifest,
        etag,
        last_modified,
    })
}

fn header_string(headers: &reqwest::header::HeaderMap, name: reqwest::header::HeaderName) -> Option<String> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string)
}

fn bundled_manifest() -> AnnouncementManifest {
    let manifest: AnnouncementManifest =
        serde_json::from_str(BUNDLED_MANIFEST).expect("bundled announcement manifest must be valid");
    validate_manifest(&manifest).expect("bundled announcement manifest must pass validation");
    manifest
}

fn validate_manifest(manifest: &AnnouncementManifest) -> Result<(), String> {
    if manifest.schema_version != 1 {
        return Err("不支持的公告 schemaVersion".to_string());
    }
    parse_timestamp(&manifest.generated_at, "generatedAt")?;
    if manifest.announcements.len() > MAX_ANNOUNCEMENTS {
        return Err("公告数量超过限制".to_string());
    }

    let mut ids = BTreeSet::new();
    for announcement in &manifest.announcements {
        if !valid_id(&announcement.id) || !ids.insert(announcement.id.clone()) {
            return Err(format!("公告 ID 无效或重复: {}", announcement.id));
        }
        if !matches!(
            announcement.category.as_str(),
            "release" | "maintenance" | "security" | "service"
        ) {
            return Err(format!("公告分类无效: {}", announcement.id));
        }
        if !matches!(
            announcement.severity.as_str(),
            "info" | "important" | "critical"
        ) {
            return Err(format!("公告级别无效: {}", announcement.id));
        }
        parse_timestamp(&announcement.published_at, "publishedAt")?;
        if let Some(expires_at) = announcement.expires_at.as_deref() {
            parse_timestamp(expires_at, "expiresAt")?;
        }
        for value in [
            announcement.min_app_version.as_deref(),
            announcement.max_app_version.as_deref(),
            announcement.related_version.as_deref(),
        ]
        .into_iter()
        .flatten()
        {
            Version::parse(value).map_err(|_| format!("公告版本无效: {}", announcement.id))?;
        }
        if announcement.platforms.is_empty()
            || announcement
                .platforms
                .iter()
                .any(|value| !matches!(value.as_str(), "windows" | "macos" | "linux"))
        {
            return Err(format!("公告平台无效: {}", announcement.id));
        }
        if announcement.channels.is_empty()
            || announcement
                .channels
                .iter()
                .any(|value| !matches!(value.as_str(), "stable" | "prerelease"))
        {
            return Err(format!("公告渠道无效: {}", announcement.id));
        }
        for locale in ["zh", "en"] {
            if !announcement.locales.contains_key(locale) {
                return Err(format!("公告缺少 {locale} 文案: {}", announcement.id));
            }
        }
        for localized in announcement.locales.values() {
            if localized.title.trim().is_empty()
                || localized.summary.trim().is_empty()
                || localized.body.trim().is_empty()
                || localized.title.len() > 120
                || localized.summary.len() > 280
                || localized.body.len() > MAX_BODY_LENGTH
                || contains_html(&localized.body)
            {
                return Err(format!("公告正文无效: {}", announcement.id));
            }
        }
        if announcement.actions.len() > 3 {
            return Err(format!("公告操作过多: {}", announcement.id));
        }
        for action in &announcement.actions {
            if !matches!(action.action_type.as_str(), "update" | "external") {
                return Err(format!("公告操作类型无效: {}", announcement.id));
            }
            if action.action_type == "external"
                && !action
                    .url
                    .as_deref()
                    .is_some_and(|url| url.starts_with("https://"))
            {
                return Err(format!("公告外链必须使用 HTTPS: {}", announcement.id));
            }
            if action.action_type == "update" && action.url.is_some() {
                return Err(format!("更新操作不能指定 URL: {}", announcement.id));
            }
        }
    }
    Ok(())
}

fn valid_id(id: &str) -> bool {
    (3..=80).contains(&id.len())
        && id
            .chars()
            .enumerate()
            .all(|(index, character)| {
                character.is_ascii_lowercase()
                    || character.is_ascii_digit()
                    || (character == '-' && index > 0)
            })
}

fn contains_html(body: &str) -> bool {
    let bytes = body.as_bytes();
    bytes.windows(2).any(|window| {
        window[0] == b'<'
            && (window[1].is_ascii_alphabetic() || window[1] == b'/' || window[1] == b'!')
    })
}

fn parse_timestamp(value: &str, field: &str) -> Result<DateTime<Utc>, String> {
    DateTime::parse_from_rfc3339(value)
        .map(|date| date.with_timezone(&Utc))
        .map_err(|_| format!("{field} 不是有效的 RFC 3339 时间"))
}

fn current_platform() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
}

fn current_channel() -> &'static str {
    if env!("CARGO_PKG_VERSION").contains('-') {
        "prerelease"
    } else {
        "stable"
    }
}

fn visible_records(manifest: &AnnouncementManifest) -> Vec<&AnnouncementRecord> {
    let current_version =
        Version::parse(env!("CARGO_PKG_VERSION")).expect("package version must be valid SemVer");
    let now = Utc::now();
    let mut records = manifest
        .announcements
        .iter()
        .filter(|announcement| {
            announcement.platforms.iter().any(|value| value == current_platform())
                && announcement.channels.iter().any(|value| value == current_channel())
                && announcement
                    .expires_at
                    .as_deref()
                    .and_then(|value| parse_timestamp(value, "expiresAt").ok())
                    .is_none_or(|expires_at| expires_at > now)
                && announcement
                    .min_app_version
                    .as_deref()
                    .and_then(|value| Version::parse(value).ok())
                    .is_none_or(|minimum| current_version >= minimum)
                && announcement
                    .max_app_version
                    .as_deref()
                    .and_then(|value| Version::parse(value).ok())
                    .is_none_or(|maximum| current_version < maximum)
        })
        .collect::<Vec<_>>();
    records.sort_by(|left, right| right.published_at.cmp(&left.published_at));
    records
}

fn localized_value<'a, T>(
    values: &'a BTreeMap<String, T>,
    language: &str,
) -> Option<&'a T> {
    let normalized = match language {
        "zh-CN" | "zh-Hans" => "zh",
        "zh-TW" | "zh-Hant" => "zh-TW",
        value => value,
    };
    values
        .get(normalized)
        .or_else(|| values.get("en"))
        .or_else(|| values.get("zh"))
        .or_else(|| values.values().next())
}

fn build_feed(
    store: &AnnouncementStore,
    manifest: &AnnouncementManifest,
    language: &str,
    refresh_error: Option<String>,
    stale: bool,
) -> AnnouncementFeed {
    let announcements = visible_records(manifest)
        .into_iter()
        .filter_map(|announcement| {
            let content = localized_value(&announcement.locales, language)?;
            let actions = announcement
                .actions
                .iter()
                .filter_map(|action| {
                    let label = localized_value(&action.label, language)?;
                    Some(AnnouncementActionView {
                        action_type: action.action_type.clone(),
                        url: action.url.clone(),
                        label: label.clone(),
                    })
                })
                .collect();
            Some(AnnouncementView {
                id: announcement.id.clone(),
                category: announcement.category.clone(),
                severity: announcement.severity.clone(),
                published_at: announcement.published_at.clone(),
                related_version: announcement.related_version.clone(),
                title: content.title.clone(),
                summary: content.summary.clone(),
                body: content.body.clone(),
                actions,
                read: store.read_ids.contains(&announcement.id),
                dismissed: store.dismissed_ids.contains(&announcement.id),
                acknowledged: store.acknowledged_ids.contains(&announcement.id),
            })
        })
        .collect::<Vec<_>>();
    let unread_count = announcements.iter().filter(|item| !item.read).count();
    AnnouncementFeed {
        announcements,
        unread_count,
        fetched_at: store.fetched_at,
        stale,
        refresh_error,
    }
}

async fn mutate_state(
    id: &str,
    mutation: impl FnOnce(&mut AnnouncementStore, &str),
) -> Result<(), String> {
    let _guard = announcement_lock()
        .lock()
        .await;
    let mut store = load_store();
    let manifest = store
        .manifest
        .clone()
        .unwrap_or_else(bundled_manifest);
    if !manifest
        .announcements
        .iter()
        .any(|announcement| announcement.id == id)
    {
        return Err("公告不存在".to_string());
    }
    mutation(&mut store, id);
    save_store(&store)
}

fn prune_state(store: &mut AnnouncementStore) {
    let Some(manifest) = store.manifest.as_ref() else {
        return;
    };
    let ids = manifest
        .announcements
        .iter()
        .map(|announcement| announcement.id.as_str())
        .collect::<BTreeSet<_>>();
    store.read_ids.retain(|id| ids.contains(id.as_str()));
    store.dismissed_ids.retain(|id| ids.contains(id.as_str()));
    store
        .acknowledged_ids
        .retain(|id| ids.contains(id.as_str()));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_manifest_is_valid_and_visible() {
        let manifest = bundled_manifest();
        let feed = build_feed(
            &AnnouncementStore::default(),
            &manifest,
            "zh",
            None,
            false,
        );
        assert!(!feed.announcements.is_empty());
        assert_eq!(feed.unread_count, feed.announcements.len());
    }

    #[test]
    fn version_platform_expiry_and_channel_filters_are_applied() {
        let mut manifest = bundled_manifest();
        let base = manifest.announcements[0].clone();
        let mut expired = base.clone();
        expired.id = "expired-announcement".to_string();
        expired.expires_at = Some("2020-01-01T00:00:00Z".to_string());
        let mut future = base.clone();
        future.id = "future-announcement".to_string();
        future.min_app_version = Some("99.0.0".to_string());
        let mut wrong_platform = base.clone();
        wrong_platform.id = "wrong-platform".to_string();
        wrong_platform.platforms = vec!["unsupported".to_string()];
        manifest.announcements = vec![base, expired, future, wrong_platform];

        let visible = visible_records(&manifest);
        assert_eq!(visible.len(), 1);
        assert_eq!(visible[0].id, "2026-08-stackferry-0-1-19");
    }

    #[test]
    fn localized_content_falls_back_to_english() {
        let manifest = bundled_manifest();
        let feed = build_feed(
            &AnnouncementStore::default(),
            &manifest,
            "fr",
            None,
            false,
        );
        assert_eq!(
            feed.announcements[0].title,
            "StackFerry v0.1.19 is available"
        );
    }

    #[test]
    fn validation_rejects_html_and_insecure_urls() {
        let mut manifest = bundled_manifest();
        manifest.announcements[0]
            .locales
            .get_mut("en")
            .unwrap()
            .body = "<script>alert(1)</script>".to_string();
        assert!(validate_manifest(&manifest).is_err());

        let mut manifest = bundled_manifest();
        manifest.announcements[0].actions[0].url =
            Some("http://example.com".to_string());
        assert!(validate_manifest(&manifest).is_err());
    }
}
