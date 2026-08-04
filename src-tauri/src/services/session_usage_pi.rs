use crate::database::{lock_conn, Database, PRICING_SOURCE_REQUEST};
use crate::error::AppError;
use crate::pi_config::get_sessions_dir;
use crate::proxy::usage::calculator::CostCalculator;
use crate::proxy::usage::parser::TokenUsage;
use crate::services::session_usage::{
    get_sync_state, metadata_modified_nanos, update_sync_state, SessionSyncResult,
};
use crate::services::sql_helpers::INPUT_TOKEN_SEMANTICS_FRESH;
use crate::services::usage_stats::{find_model_pricing, should_skip_pi_session_insert, DedupKey};
use rusqlite::OptionalExtension;
use rust_decimal::Decimal;
use serde_json::Value;
use std::fs;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::time::SystemTime;

#[derive(Debug)]
struct PiAssistantUsage {
    entry_id: String,
    provider_id: String,
    api_type: String,
    model: String,
    request_model: String,
    upstream_response_id: Option<String>,
    input_tokens: u32,
    output_tokens: u32,
    cache_read_tokens: u32,
    cache_creation_tokens: u32,
    reasoning_tokens: u32,
    cache_creation_1h_tokens: u32,
    stop_reason: Option<String>,
    error_message: Option<String>,
    created_at: i64,
}

pub fn sync_pi_usage(db: &Database) -> Result<SessionSyncResult, AppError> {
    sync_pi_usage_from_dir(db, &get_sessions_dir())
}

fn sync_pi_usage_from_dir(
    db: &Database,
    sessions_dir: &Path,
) -> Result<SessionSyncResult, AppError> {
    if !sessions_dir.is_dir() {
        return Ok(SessionSyncResult::default());
    }

    let files = collect_jsonl_files(sessions_dir);
    let mut result = SessionSyncResult::default();
    for file_path in files {
        result.files_scanned = result.files_scanned.saturating_add(1);
        match sync_single_file(db, &file_path) {
            Ok(file_result) => result.merge(file_result),
            Err(error) => {
                let message = format!("{}: {error}", file_path.display());
                log::warn!("[PI-SESSION-SYNC] {message}");
                result.errors.push(message);
            }
        }
    }

    if result.imported > 0 {
        log::info!(
            "[PI-SESSION-SYNC] 同步完成: 导入 {} 条, 跳过 {} 条, 扫描 {} 个文件",
            result.imported,
            result.skipped,
            result.files_scanned
        );
    }
    Ok(result)
}

fn collect_jsonl_files(root: &Path) -> Vec<PathBuf> {
    let mut pending = vec![root.to_path_buf()];
    let mut files = Vec::new();
    while let Some(dir) = pending.pop() {
        let entries = match fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(_) => continue,
            };
            let path = entry.path();
            if file_type.is_dir() {
                pending.push(path);
            } else if file_type.is_file()
                && path.extension().and_then(|extension| extension.to_str()) == Some("jsonl")
            {
                files.push(path);
            }
        }
    }
    files.sort();
    files
}

fn sync_single_file(db: &Database, file_path: &Path) -> Result<SessionSyncResult, AppError> {
    let metadata = fs::metadata(file_path).map_err(|error| AppError::io(file_path, error))?;
    let file_len = metadata.len().min(i64::MAX as u64) as i64;
    let file_modified = metadata_modified_nanos(&metadata);
    let header_session_id = read_header_session_id(file_path)?;
    let fallback_session_id = file_path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("unknown");
    let session_id = header_session_id.as_deref().unwrap_or(fallback_session_id);
    let state_key = format!("pi:{}:{session_id}", file_path.to_string_lossy());
    let (last_modified, stored_offset) = get_sync_state(db, &state_key)?;
    let start_offset = if stored_offset < 0 || stored_offset > file_len {
        0
    } else {
        stored_offset
    };

    if start_offset == file_len && file_modified <= last_modified {
        return Ok(SessionSyncResult::default());
    }
    if start_offset == file_len {
        update_sync_state(db, &state_key, file_modified, start_offset)?;
        return Ok(SessionSyncResult::default());
    }

    let file = fs::File::open(file_path).map_err(|error| AppError::io(file_path, error))?;
    let mut reader = BufReader::new(file);
    reader
        .seek(SeekFrom::Start(start_offset as u64))
        .map_err(|error| AppError::io(file_path, error))?;

    let mut result = SessionSyncResult::default();
    let mut cursor = start_offset;
    let mut insertion_failed = false;
    loop {
        let line_start = cursor;
        let mut line = Vec::new();
        let bytes_read = reader
            .read_until(b'\n', &mut line)
            .map_err(|error| AppError::io(file_path, error))?;
        if bytes_read == 0 {
            break;
        }
        if line.last() != Some(&b'\n') {
            result.deferred_files = 1;
            break;
        }
        cursor = cursor.saturating_add(bytes_read as i64);

        let value: Value = match serde_json::from_slice(&line) {
            Ok(value) => value,
            Err(error) => {
                result.skipped = result.skipped.saturating_add(1);
                result.errors.push(format!(
                    "{}:{line_start}: JSONL 条目无效: {error}",
                    file_path.display()
                ));
                continue;
            }
        };
        let Some(usage) = parse_assistant_usage(&value) else {
            continue;
        };
        if !has_billable_tokens(&usage) {
            continue;
        }

        match insert_pi_session_entry(db, session_id, &usage) {
            Ok(true) => result.imported = result.imported.saturating_add(1),
            Ok(false) => result.skipped = result.skipped.saturating_add(1),
            Err(error) => {
                insertion_failed = true;
                result.skipped = result.skipped.saturating_add(1);
                result.errors.push(format!(
                    "{}:{}: Pi assistant 用量写入失败: {error}",
                    file_path.display(),
                    usage.entry_id
                ));
            }
        }
    }

    if !insertion_failed {
        update_sync_state(db, &state_key, file_modified, cursor)?;
    }
    Ok(result)
}

fn read_header_session_id(file_path: &Path) -> Result<Option<String>, AppError> {
    let file = fs::File::open(file_path).map_err(|error| AppError::io(file_path, error))?;
    let mut reader = BufReader::new(file);
    let mut line = Vec::new();
    let bytes_read = reader
        .read_until(b'\n', &mut line)
        .map_err(|error| AppError::io(file_path, error))?;
    if bytes_read == 0 || line.last() != Some(&b'\n') {
        return Ok(None);
    }
    let value: Value = match serde_json::from_slice(&line) {
        Ok(value) => value,
        Err(_) => return Ok(None),
    };
    if value.get("type").and_then(Value::as_str) != Some("session") {
        return Ok(None);
    }
    Ok(value
        .get("id")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_string))
}

fn parse_assistant_usage(entry: &Value) -> Option<PiAssistantUsage> {
    if entry.get("type").and_then(Value::as_str) != Some("message") {
        return None;
    }
    let entry_id = entry
        .get("id")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())?
        .to_string();
    let message = entry.get("message")?;
    if message.get("role").and_then(Value::as_str) != Some("assistant") {
        return None;
    }
    let usage = message.get("usage")?;
    let request_model = string_field(message, "model").unwrap_or_else(|| "unknown".to_string());
    let model = string_field(message, "responseModel").unwrap_or_else(|| request_model.clone());
    let stop_reason = string_field(message, "stopReason");
    let created_at = message
        .get("timestamp")
        .and_then(Value::as_i64)
        .map(|timestamp| timestamp / 1000)
        .or_else(|| {
            entry
                .get("timestamp")
                .and_then(Value::as_str)
                .and_then(|timestamp| chrono::DateTime::parse_from_rfc3339(timestamp).ok())
                .map(|timestamp| timestamp.timestamp())
        })
        .unwrap_or_else(current_epoch_seconds);

    Some(PiAssistantUsage {
        entry_id,
        provider_id: string_field(message, "provider").unwrap_or_else(|| "unknown".to_string()),
        api_type: string_field(message, "api").unwrap_or_default(),
        model,
        request_model,
        upstream_response_id: string_field(message, "responseId"),
        input_tokens: usage_u32(usage, "input"),
        output_tokens: usage_u32(usage, "output"),
        cache_read_tokens: usage_u32(usage, "cacheRead"),
        cache_creation_tokens: usage_u32(usage, "cacheWrite"),
        reasoning_tokens: usage_u32(usage, "reasoning"),
        cache_creation_1h_tokens: usage_u32(usage, "cacheWrite1h"),
        stop_reason,
        error_message: string_field(message, "errorMessage"),
        created_at,
    })
}

fn string_field(value: &Value, field: &str) -> Option<String> {
    value
        .get(field)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn usage_u32(usage: &Value, field: &str) -> u32 {
    usage
        .get(field)
        .and_then(Value::as_u64)
        .unwrap_or(0)
        .min(u32::MAX as u64) as u32
}

fn has_billable_tokens(usage: &PiAssistantUsage) -> bool {
    usage.input_tokens > 0
        || usage.output_tokens > 0
        || usage.cache_read_tokens > 0
        || usage.cache_creation_tokens > 0
}

fn current_epoch_seconds() -> i64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|duration| duration.as_secs().min(i64::MAX as u64) as i64)
        .unwrap_or(0)
}

fn insert_pi_session_entry(
    db: &Database,
    session_id: &str,
    message: &PiAssistantUsage,
) -> Result<bool, AppError> {
    let conn = lock_conn!(db.conn);
    let request_id = format!("pi_session:{session_id}:{}", message.entry_id);
    let dedup_key = DedupKey {
        app_type: "pi",
        model: &message.model,
        input_tokens: message.input_tokens,
        output_tokens: message.output_tokens,
        cache_read_tokens: message.cache_read_tokens,
        cache_creation_tokens: message.cache_creation_tokens,
        created_at: message.created_at,
    };
    if should_skip_pi_session_insert(
        &conn,
        &request_id,
        &message.provider_id,
        message.upstream_response_id.as_deref(),
        &dedup_key,
    )? {
        return Ok(false);
    }

    let (cost_multiplier, pricing_model) = resolve_pricing_config(
        &conn,
        &message.provider_id,
        &message.model,
        &message.request_model,
    );
    let usage = TokenUsage {
        input_tokens: message.input_tokens,
        output_tokens: message.output_tokens,
        cache_read_tokens: message.cache_read_tokens,
        cache_creation_tokens: message.cache_creation_tokens,
        reasoning_tokens: message.reasoning_tokens,
        cache_creation_1h_tokens: message.cache_creation_1h_tokens,
        model: Some(message.model.clone()),
        message_id: message.upstream_response_id.clone(),
    };
    let pricing = find_model_pricing(&conn, &pricing_model);
    let cost = CostCalculator::try_calculate_with_input_semantics(
        INPUT_TOKEN_SEMANTICS_FRESH,
        &usage,
        pricing.as_ref(),
        cost_multiplier,
    );
    let (input_cost, output_cost, cache_read_cost, cache_creation_cost, total_cost) = cost
        .map(|cost| {
            (
                cost.input_cost.to_string(),
                cost.output_cost.to_string(),
                cost.cache_read_cost.to_string(),
                cost.cache_creation_cost.to_string(),
                cost.total_cost.to_string(),
            )
        })
        .unwrap_or_else(|| {
            (
                "0".to_string(),
                "0".to_string(),
                "0".to_string(),
                "0".to_string(),
                "0".to_string(),
            )
        });
    let status_code = match message.stop_reason.as_deref() {
        Some("error") => 500i64,
        Some("aborted") => 499i64,
        _ => 200i64,
    };
    let error_message = if status_code >= 400 {
        message
            .error_message
            .clone()
            .or_else(|| message.stop_reason.clone())
    } else {
        None
    };

    let inserted = conn
        .execute(
            "INSERT OR IGNORE INTO proxy_request_logs (
                request_id, provider_id, app_type, model, request_model, pricing_model, api_type,
                upstream_response_id, stop_reason,
                input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
                reasoning_tokens, cache_creation_1h_tokens, input_token_semantics,
                input_cost_usd, output_cost_usd, cache_read_cost_usd, cache_creation_cost_usd,
                total_cost_usd, latency_ms, first_token_ms, status_code, error_message, session_id,
                provider_type, is_streaming, cost_multiplier, created_at, data_source
             ) VALUES (
                ?1, ?2, 'pi', ?3, ?4, ?5, ?6, ?7, ?8,
                ?9, ?10, ?11, ?12, ?13, ?14, ?15,
                ?16, ?17, ?18, ?19, ?20, 0, NULL, ?21, ?22, ?23,
                'pi_session', 1, ?24, ?25, 'pi_session'
             )",
            rusqlite::params![
                request_id,
                message.provider_id,
                message.model,
                message.request_model,
                pricing_model,
                message.api_type,
                message.upstream_response_id,
                message.stop_reason,
                message.input_tokens,
                message.output_tokens,
                message.cache_read_tokens,
                message.cache_creation_tokens,
                message.reasoning_tokens,
                message.cache_creation_1h_tokens,
                INPUT_TOKEN_SEMANTICS_FRESH,
                input_cost,
                output_cost,
                cache_read_cost,
                cache_creation_cost,
                total_cost,
                status_code,
                error_message,
                session_id,
                cost_multiplier.to_string(),
                message.created_at,
            ],
        )
        .map_err(|error| AppError::Database(format!("插入 Pi 会话用量失败: {error}")))?;
    Ok(inserted > 0)
}

fn resolve_pricing_config(
    conn: &rusqlite::Connection,
    provider_id: &str,
    response_model: &str,
    request_model: &str,
) -> (Decimal, String) {
    let defaults = conn
        .query_row(
            "SELECT default_cost_multiplier, pricing_model_source
             FROM proxy_config WHERE app_type = 'pi'",
            [],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .ok()
        .flatten()
        .unwrap_or_else(|| ("1".to_string(), "response".to_string()));
    let provider_meta = conn
        .query_row(
            "SELECT meta FROM providers WHERE id = ?1 AND app_type = 'pi'",
            [provider_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .ok()
        .flatten()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok());
    let multiplier = provider_meta
        .as_ref()
        .and_then(|meta| meta.get("costMultiplier"))
        .and_then(Value::as_str)
        .unwrap_or(&defaults.0);
    let multiplier = Decimal::from_str(multiplier)
        .or_else(|_| Decimal::from_str(&defaults.0))
        .unwrap_or(Decimal::ONE);
    let pricing_source = provider_meta
        .as_ref()
        .and_then(|meta| meta.get("pricingModelSource"))
        .and_then(Value::as_str)
        .unwrap_or(&defaults.1);
    let pricing_model = if pricing_source == PRICING_SOURCE_REQUEST {
        request_model
    } else {
        response_model
    };
    (multiplier, pricing_model.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::usage_stats::effective_usage_log_filter;
    use serde_json::json;
    use std::io::Write;
    use tempfile::tempdir;

    fn header(session_id: &str) -> Value {
        json!({
            "type": "session",
            "version": 3,
            "id": session_id,
            "timestamp": "2026-08-04T00:00:00.000Z",
            "cwd": "/tmp/project"
        })
    }

    fn assistant(
        entry_id: &str,
        parent_id: Option<&str>,
        response_id: &str,
        input: u32,
        output: u32,
    ) -> Value {
        json!({
            "type": "message",
            "id": entry_id,
            "parentId": parent_id,
            "timestamp": "2026-08-04T00:00:01.000Z",
            "message": {
                "role": "assistant",
                "content": [],
                "api": "openai-responses",
                "provider": "provider-a",
                "model": "pi-request-model",
                "responseModel": "pi-response-model",
                "responseId": response_id,
                "usage": {
                    "input": input,
                    "output": output,
                    "cacheRead": 3,
                    "cacheWrite": 4,
                    "cacheWrite1h": 2,
                    "reasoning": 1,
                    "totalTokens": input + output + 7,
                    "cost": {
                        "input": 99,
                        "output": 99,
                        "cacheRead": 99,
                        "cacheWrite": 99,
                        "total": 396
                    }
                },
                "stopReason": "stop",
                "timestamp": 1785801601000i64
            }
        })
    }

    fn write_jsonl(path: &Path, entries: &[Value], final_newline: bool) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        let mut content = entries
            .iter()
            .map(Value::to_string)
            .collect::<Vec<_>>()
            .join("\n");
        if final_newline {
            content.push('\n');
        }
        fs::write(path, content).unwrap();
    }

    fn seed_pricing(db: &Database) -> Result<(), AppError> {
        let conn = lock_conn!(db.conn);
        conn.execute(
            "INSERT OR REPLACE INTO model_pricing (
                model_id, display_name, input_cost_per_million, output_cost_per_million,
                cache_read_cost_per_million, cache_creation_cost_per_million
             ) VALUES ('pi-response-model', 'Pi response', '1', '2', '0.1', '1.25')",
            [],
        )?;
        Ok(())
    }

    #[test]
    fn imports_all_v3_branches_and_ignores_compaction_estimates() -> Result<(), AppError> {
        let temp = tempdir().unwrap();
        let path = temp.path().join("--project--/session.jsonl");
        write_jsonl(
            &path,
            &[
                header("session-v3"),
                assistant("a1", None, "resp-a", 10, 5),
                json!({
                    "type": "compaction",
                    "id": "compact",
                    "parentId": "a1",
                    "timestamp": "2026-08-04T00:00:02.000Z",
                    "firstKeptEntryId": "a1",
                    "tokensBefore": 50000,
                    "summary": "summary"
                }),
                assistant("branch-a", Some("a1"), "resp-b", 20, 7),
                assistant("branch-b", Some("a1"), "resp-c", 30, 9),
            ],
            true,
        );
        let db = Database::memory()?;
        seed_pricing(&db)?;

        let result = sync_pi_usage_from_dir(&db, temp.path())?;
        assert_eq!(result.imported, 3);
        let conn = lock_conn!(db.conn);
        let totals: (i64, i64, i64, i64, i64, i64) = conn.query_row(
            "SELECT COUNT(*), SUM(input_tokens), SUM(output_tokens),
                    SUM(cache_read_tokens), SUM(cache_creation_tokens), SUM(reasoning_tokens)
             FROM proxy_request_logs WHERE data_source = 'pi_session'",
            [],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            },
        )?;
        assert_eq!(totals, (3, 60, 21, 9, 12, 3));
        let fields: (String, String, String, String, i64, String) = conn.query_row(
            "SELECT model, request_model, api_type, stop_reason,
                    cache_creation_1h_tokens, upstream_response_id
             FROM proxy_request_logs WHERE request_id = 'pi_session:session-v3:a1'",
            [],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            },
        )?;
        assert_eq!(
            fields,
            (
                "pi-response-model".to_string(),
                "pi-request-model".to_string(),
                "openai-responses".to_string(),
                "stop".to_string(),
                2,
                "resp-a".to_string(),
            )
        );
        let total_cost: f64 = conn.query_row(
            "SELECT SUM(CAST(total_cost_usd AS REAL))
             FROM proxy_request_logs WHERE data_source = 'pi_session'",
            [],
            |row| row.get(0),
        )?;
        assert!((total_cost - 0.0001179).abs() < 0.000000001);
        Ok(())
    }

    #[test]
    fn resumes_appends_and_defers_partial_final_line() -> Result<(), AppError> {
        let temp = tempdir().unwrap();
        let path = temp.path().join("session.jsonl");
        write_jsonl(
            &path,
            &[
                header("append-session"),
                assistant("a1", None, "resp-a", 10, 5),
            ],
            true,
        );
        let db = Database::memory()?;
        assert_eq!(sync_pi_usage_from_dir(&db, temp.path())?.imported, 1);

        let partial = assistant("a2", Some("a1"), "resp-b", 12, 6).to_string();
        let mut file = fs::OpenOptions::new().append(true).open(&path).unwrap();
        file.write_all(partial.as_bytes()).unwrap();
        drop(file);
        let deferred = sync_pi_usage_from_dir(&db, temp.path())?;
        assert_eq!(deferred.imported, 0);
        assert_eq!(deferred.deferred_files, 1);

        let mut file = fs::OpenOptions::new().append(true).open(&path).unwrap();
        file.write_all(b"\n").unwrap();
        drop(file);
        assert_eq!(sync_pi_usage_from_dir(&db, temp.path())?.imported, 1);
        assert_eq!(sync_pi_usage_from_dir(&db, temp.path())?.imported, 0);
        Ok(())
    }

    #[test]
    fn resets_byte_cursor_after_same_session_file_is_truncated() -> Result<(), AppError> {
        let temp = tempdir().unwrap();
        let path = temp.path().join("session.jsonl");
        write_jsonl(
            &path,
            &[
                header("truncate-session"),
                assistant("old", None, "resp-old", 10, 5),
                json!({
                    "type": "custom",
                    "id": "padding",
                    "parentId": "old",
                    "timestamp": "2026-08-04T00:00:02.000Z",
                    "customType": "padding",
                    "data": "x".repeat(4096)
                }),
            ],
            true,
        );
        let db = Database::memory()?;
        assert_eq!(sync_pi_usage_from_dir(&db, temp.path())?.imported, 1);

        write_jsonl(
            &path,
            &[
                header("truncate-session"),
                assistant("new", None, "resp-new", 8, 4),
            ],
            true,
        );
        assert_eq!(sync_pi_usage_from_dir(&db, temp.path())?.imported, 1);
        Ok(())
    }

    #[test]
    fn applies_pi_pricing_source_multiplier_and_failure_status() -> Result<(), AppError> {
        let temp = tempdir().unwrap();
        let path = temp.path().join("session.jsonl");
        let mut failed = assistant("failed", None, "resp-failed", 10, 5);
        failed["message"]["stopReason"] = json!("error");
        failed["message"]["errorMessage"] = json!("upstream failed");
        write_jsonl(&path, &[header("pricing-session"), failed], true);
        let db = Database::memory()?;
        {
            let conn = lock_conn!(db.conn);
            conn.execute(
                "INSERT OR REPLACE INTO model_pricing (
                    model_id, display_name, input_cost_per_million, output_cost_per_million,
                    cache_read_cost_per_million, cache_creation_cost_per_million
                 ) VALUES ('pi-request-model', 'Pi request', '10', '20', '1', '12.5')",
                [],
            )?;
            conn.execute(
                "INSERT INTO providers (id, app_type, name, settings_config, meta)
                 VALUES ('provider-a', 'pi', 'Provider A', '{}',
                    '{\"costMultiplier\":\"2\",\"pricingModelSource\":\"request\"}')",
                [],
            )?;
        }

        assert_eq!(sync_pi_usage_from_dir(&db, temp.path())?.imported, 1);
        let conn = lock_conn!(db.conn);
        let row: (String, String, String, i64, String, String) = conn.query_row(
            "SELECT pricing_model, total_cost_usd, cost_multiplier, status_code,
                    stop_reason, error_message
             FROM proxy_request_logs WHERE data_source = 'pi_session'",
            [],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            },
        )?;
        assert_eq!(
            row,
            (
                "pi-request-model".to_string(),
                "0.000506".to_string(),
                "2".to_string(),
                500,
                "error".to_string(),
                "upstream failed".to_string(),
            )
        );
        Ok(())
    }

    #[test]
    fn tolerates_bad_rows_and_recognizes_moved_and_rotated_files() -> Result<(), AppError> {
        let temp = tempdir().unwrap();
        let original = temp.path().join("session.jsonl");
        let valid = assistant("a1", None, "resp-a", 10, 5);
        fs::write(
            &original,
            format!("{}\n{{bad json}}\n{}\n", header("move-session"), valid),
        )
        .unwrap();
        let db = Database::memory()?;
        let first = sync_pi_usage_from_dir(&db, temp.path())?;
        assert_eq!(first.imported, 1);
        assert_eq!(first.errors.len(), 1);

        let archive = temp.path().join("archive/session.jsonl");
        fs::create_dir_all(archive.parent().unwrap()).unwrap();
        fs::rename(&original, &archive).unwrap();
        let moved = sync_pi_usage_from_dir(&db, temp.path())?;
        assert_eq!(moved.imported, 0);

        write_jsonl(
            &original,
            &[
                header("rotated-session"),
                assistant("a1", None, "resp-new", 8, 4),
            ],
            true,
        );
        let rotated = sync_pi_usage_from_dir(&db, temp.path())?;
        assert_eq!(rotated.imported, 1);
        Ok(())
    }

    #[test]
    fn proxy_overlap_is_counted_once_in_both_arrival_orders() -> Result<(), AppError> {
        let temp = tempdir().unwrap();
        let path = temp.path().join("session.jsonl");
        write_jsonl(
            &path,
            &[
                header("overlap"),
                assistant("a1", None, "resp-shared", 10, 5),
            ],
            true,
        );

        let proxy_first = Database::memory()?;
        insert_proxy_overlap(&proxy_first, "proxy-first", "resp-shared")?;
        assert_eq!(
            sync_pi_usage_from_dir(&proxy_first, temp.path())?.imported,
            0
        );

        let session_first = Database::memory()?;
        assert_eq!(
            sync_pi_usage_from_dir(&session_first, temp.path())?.imported,
            1
        );
        insert_proxy_overlap(&session_first, "proxy-second", "resp-shared")?;
        let conn = lock_conn!(session_first.conn);
        let filter = effective_usage_log_filter("l");
        let count: i64 = conn.query_row(
            &format!("SELECT COUNT(*) FROM proxy_request_logs l WHERE {filter}"),
            [],
            |row| row.get(0),
        )?;
        assert_eq!(count, 1);
        Ok(())
    }

    fn insert_proxy_overlap(
        db: &Database,
        request_id: &str,
        upstream_response_id: &str,
    ) -> Result<(), AppError> {
        let conn = lock_conn!(db.conn);
        conn.execute(
            "INSERT INTO proxy_request_logs (
                request_id, provider_id, app_type, model, request_model, api_type,
                upstream_response_id, input_tokens, output_tokens, cache_read_tokens,
                cache_creation_tokens, input_token_semantics, total_cost_usd,
                latency_ms, status_code, created_at, data_source
             ) VALUES (?1, 'provider-a', 'pi', 'pi-response-model', 'pi-request-model',
                'openai-responses', ?2, 10, 5, 3, 4, 2, '0.1', 10, 200,
                1785801601, 'proxy')",
            rusqlite::params![request_id, upstream_response_id],
        )?;
        Ok(())
    }
}
