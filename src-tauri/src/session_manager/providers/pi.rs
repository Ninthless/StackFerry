use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::session_manager::{SessionMessage, SessionMeta};

use super::utils::{parse_timestamp_to_ms, path_basename, truncate_summary, TITLE_MAX_CHARS};

const PROVIDER_ID: &str = "pi";

pub fn scan_sessions() -> Vec<SessionMeta> {
    let mut files = Vec::new();
    collect_session_files(&crate::pi_config::get_sessions_dir(), &mut files);
    files
        .into_iter()
        .filter_map(|path| parse_session(&path))
        .collect()
}

pub fn load_messages(path: &Path) -> Result<Vec<SessionMessage>, String> {
    let file = File::open(path).map_err(|error| format!("Failed to open Pi session: {error}"))?;
    let reader = BufReader::new(file);
    let mut messages = Vec::new();

    for line in reader.lines().map_while(Result::ok) {
        let Ok(entry) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if let Some(message) = entry_to_message(&entry) {
            messages.push(message);
        }
    }

    Ok(messages)
}

pub fn delete_session(_root: &Path, path: &Path, session_id: &str) -> Result<bool, String> {
    if path.extension().and_then(|extension| extension.to_str()) != Some("jsonl") {
        return Err(format!("Unexpected Pi session source: {}", path.display()));
    }
    let meta = parse_session(path)
        .ok_or_else(|| format!("Failed to parse Pi session metadata: {}", path.display()))?;
    if meta.session_id != session_id {
        return Err(format!(
            "Pi session ID mismatch: expected {session_id}, found {}",
            meta.session_id
        ));
    }
    std::fs::remove_file(path)
        .map_err(|error| format!("Failed to delete Pi session {}: {error}", path.display()))?;
    Ok(true)
}

fn collect_session_files(root: &Path, files: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_session_files(&path, files);
        } else if path.extension().and_then(|extension| extension.to_str()) == Some("jsonl") {
            files.push(path);
        }
    }
}

fn parse_session(path: &Path) -> Option<SessionMeta> {
    let file = File::open(path).ok()?;
    let reader = BufReader::new(file);
    let mut session_id = None;
    let mut project_dir = None;
    let mut created_at = None;
    let mut last_active_at = None;
    let mut first_user_message = None;
    let mut session_name = None;

    for line in reader.lines().map_while(Result::ok) {
        let Ok(entry) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let entry_type = entry.get("type").and_then(Value::as_str).unwrap_or("");
        if entry_type == "session" {
            session_id = entry.get("id").and_then(Value::as_str).map(str::to_string);
            project_dir = entry.get("cwd").and_then(Value::as_str).map(str::to_string);
            created_at = entry.get("timestamp").and_then(parse_timestamp_to_ms);
        } else if entry_type == "session_info" {
            session_name = entry
                .get("name")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|name| !name.is_empty())
                .map(str::to_string);
        } else if entry_type == "message" && first_user_message.is_none() {
            let message = entry.get("message")?;
            if message.get("role").and_then(Value::as_str) == Some("user") {
                let content = message
                    .get("content")
                    .map(extract_content)
                    .unwrap_or_default();
                if !content.trim().is_empty() {
                    first_user_message = Some(content);
                }
            }
        }
        if let Some(timestamp) = entry.get("timestamp").and_then(parse_timestamp_to_ms) {
            last_active_at =
                Some(last_active_at.map_or(timestamp, |current: i64| current.max(timestamp)));
        }
    }

    let session_id = session_id?;
    let fallback_title = first_user_message
        .as_deref()
        .map(|message| truncate_summary(message, TITLE_MAX_CHARS))
        .or_else(|| project_dir.as_deref().and_then(path_basename));
    let title = session_name
        .map(|name| truncate_summary(&name, TITLE_MAX_CHARS))
        .or(fallback_title);
    let summary = first_user_message
        .as_deref()
        .map(|message| truncate_summary(message, 160));
    let source_path = path.to_string_lossy().to_string();
    let resume_command = format!("pi --session {}", shell_quote(&source_path));

    Some(SessionMeta {
        provider_id: PROVIDER_ID.to_string(),
        session_id,
        title,
        summary,
        project_dir,
        created_at,
        last_active_at: last_active_at.or(created_at),
        source_path: Some(source_path),
        resume_command: Some(resume_command),
    })
}

fn entry_to_message(entry: &Value) -> Option<SessionMessage> {
    let entry_type = entry.get("type").and_then(Value::as_str)?;
    let ts = entry.get("timestamp").and_then(parse_timestamp_to_ms);
    let (role, content) = match entry_type {
        "message" => message_content(entry.get("message")?)?,
        "custom_message" if entry.get("display").and_then(Value::as_bool) != Some(false) => {
            ("system".to_string(), extract_content(entry.get("content")?))
        }
        "compaction" => (
            "system".to_string(),
            entry.get("summary").and_then(Value::as_str)?.to_string(),
        ),
        "branch_summary" => (
            "system".to_string(),
            entry.get("summary").and_then(Value::as_str)?.to_string(),
        ),
        _ => return None,
    };
    if content.trim().is_empty() {
        return None;
    }
    Some(SessionMessage { role, content, ts })
}

fn message_content(message: &Value) -> Option<(String, String)> {
    let role = message.get("role").and_then(Value::as_str)?;
    let content = match role {
        "user" | "assistant" => message
            .get("content")
            .map(extract_content)
            .unwrap_or_default(),
        "toolResult" => {
            let name = message
                .get("toolName")
                .and_then(Value::as_str)
                .unwrap_or("tool");
            let output = message
                .get("content")
                .map(extract_content)
                .unwrap_or_default();
            join_heading(&format!("[Tool: {name}]"), &output)
        }
        "bashExecution" => {
            let command = message.get("command").and_then(Value::as_str).unwrap_or("");
            let output = message.get("output").and_then(Value::as_str).unwrap_or("");
            join_heading(&format!("[Shell: {command}]"), output)
        }
        "custom" if message.get("display").and_then(Value::as_bool) != Some(false) => message
            .get("content")
            .map(extract_content)
            .unwrap_or_default(),
        "branchSummary" => message
            .get("summary")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        "compactionSummary" => message
            .get("summary")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        _ => return None,
    };
    let display_role = match role {
        "user" => "user",
        "assistant" => "assistant",
        "toolResult" | "bashExecution" => "tool",
        _ => "system",
    };
    Some((display_role.to_string(), content))
}

fn extract_content(content: &Value) -> String {
    match content {
        Value::String(text) => text.to_string(),
        Value::Array(items) => items
            .iter()
            .filter_map(extract_content_item)
            .filter(|text| !text.trim().is_empty())
            .collect::<Vec<_>>()
            .join("\n"),
        Value::Object(_) => extract_content_item(content).unwrap_or_default(),
        _ => String::new(),
    }
}

fn extract_content_item(item: &Value) -> Option<String> {
    match item.get("type").and_then(Value::as_str) {
        Some("text") => item.get("text").and_then(Value::as_str).map(str::to_string),
        Some("toolCall") => Some(format!(
            "[Tool: {}]",
            item.get("name").and_then(Value::as_str).unwrap_or("tool")
        )),
        Some("image") => Some("[Image]".to_string()),
        Some("thinking") => None,
        _ => item.get("text").and_then(Value::as_str).map(str::to_string),
    }
}

fn join_heading(heading: &str, content: &str) -> String {
    if content.trim().is_empty() {
        heading.to_string()
    } else {
        format!("{heading}\n{content}")
    }
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn write_session(path: &Path) {
        std::fs::write(
            path,
            concat!(
                "{\"type\":\"session\",\"version\":3,\"id\":\"pi-session\",\"timestamp\":\"2026-07-31T10:00:00Z\",\"cwd\":\"/tmp/project\"}\n",
                "{\"type\":\"message\",\"id\":\"a1\",\"parentId\":null,\"timestamp\":\"2026-07-31T10:00:01Z\",\"message\":{\"role\":\"user\",\"content\":\"Fix authentication\",\"timestamp\":1777629601000}}\n",
                "{\"type\":\"message\",\"id\":\"a2\",\"parentId\":\"a1\",\"timestamp\":\"2026-07-31T10:00:02Z\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"thinking\",\"thinking\":\"private\"},{\"type\":\"text\",\"text\":\"Working\"},{\"type\":\"toolCall\",\"id\":\"t1\",\"name\":\"read\",\"arguments\":{}}]}}\n",
                "{\"type\":\"session_info\",\"id\":\"a3\",\"parentId\":\"a2\",\"timestamp\":\"2026-07-31T10:00:03Z\",\"name\":\"Auth repair\"}\n"
            ),
        )
        .expect("write session");
    }

    #[test]
    fn parses_named_session_and_resume_command() {
        let temp = tempdir().expect("tempdir");
        let path = temp.path().join("session.jsonl");
        write_session(&path);

        let meta = parse_session(&path).expect("session");

        assert_eq!(meta.provider_id, "pi");
        assert_eq!(meta.session_id, "pi-session");
        assert_eq!(meta.title.as_deref(), Some("Auth repair"));
        assert_eq!(meta.summary.as_deref(), Some("Fix authentication"));
        assert_eq!(meta.project_dir.as_deref(), Some("/tmp/project"));
        assert!(meta.resume_command.as_deref().is_some_and(|command| {
            command.starts_with("pi --session '") && command.ends_with("session.jsonl'")
        }));
    }

    #[test]
    fn loads_visible_messages_without_thinking_content() {
        let temp = tempdir().expect("tempdir");
        let path = temp.path().join("session.jsonl");
        write_session(&path);

        let messages = load_messages(&path).expect("messages");

        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, "user");
        assert_eq!(messages[0].content, "Fix authentication");
        assert_eq!(messages[1].role, "assistant");
        assert_eq!(messages[1].content, "Working\n[Tool: read]");
        assert!(!messages[1].content.contains("private"));
    }

    #[test]
    fn delete_rejects_mismatched_session_id() {
        let temp = tempdir().expect("tempdir");
        let path = temp.path().join("session.jsonl");
        write_session(&path);

        let error = delete_session(temp.path(), &path, "other").expect_err("mismatch");

        assert!(error.contains("session ID mismatch"));
        assert!(path.exists());
    }
}
