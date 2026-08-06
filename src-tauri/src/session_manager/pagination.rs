use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::Path;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};

use super::SessionMessage;

pub const MESSAGE_PAGE_MAX_ITEMS: usize = 50;
pub const MESSAGE_PAGE_MAX_BYTES: usize = 512 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMessagePreview {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ts: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_cursor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMessagePage {
    pub items: Vec<SessionMessagePreview>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
    pub has_more: bool,
}

pub(crate) enum PushOutcome {
    Added,
    PageFull,
}

pub(crate) struct MessagePageBuilder {
    items: Vec<SessionMessagePreview>,
    content_bytes: usize,
}

impl MessagePageBuilder {
    pub(crate) fn new() -> Self {
        Self {
            items: Vec::new(),
            content_bytes: 0,
        }
    }

    pub(crate) fn is_full(&self) -> bool {
        self.items.len() >= MESSAGE_PAGE_MAX_ITEMS || self.content_bytes >= MESSAGE_PAGE_MAX_BYTES
    }

    pub(crate) fn push(
        &mut self,
        message: SessionMessage,
        full_content_cursor: String,
    ) -> PushOutcome {
        let message_bytes = message.content.len();
        if !self.items.is_empty()
            && self.content_bytes.saturating_add(message_bytes) > MESSAGE_PAGE_MAX_BYTES
        {
            return PushOutcome::PageFull;
        }

        let SessionMessage {
            role,
            mut content,
            ts,
        } = message;
        let remaining_bytes = MESSAGE_PAGE_MAX_BYTES.saturating_sub(self.content_bytes);
        let (content_cursor, content_bytes) = if content.len() > remaining_bytes {
            content = truncate_utf8_bytes(&content, remaining_bytes).to_string();
            (
                Some(full_content_cursor),
                Some(u64::try_from(message_bytes).unwrap_or(u64::MAX)),
            )
        } else {
            (None, None)
        };

        self.content_bytes = self.content_bytes.saturating_add(content.len());
        self.items.push(SessionMessagePreview {
            role,
            content,
            ts,
            content_cursor,
            content_bytes,
        });
        PushOutcome::Added
    }

    pub(crate) fn finish(self, next_cursor: Option<String>) -> SessionMessagePage {
        SessionMessagePage {
            items: self.items,
            has_more: next_cursor.is_some(),
            next_cursor,
        }
    }
}

pub(crate) fn load_jsonl_page<F>(
    path: &Path,
    cursor: Option<&str>,
    parse_message: F,
) -> Result<SessionMessagePage, String>
where
    F: Fn(&Value) -> Option<SessionMessage>,
{
    let mut file = File::open(path).map_err(|error| {
        format!(
            "Failed to open session message source {}: {error}",
            path.display()
        )
    })?;
    let file_len = file
        .metadata()
        .map_err(|error| format!("Failed to inspect session message source: {error}"))?
        .len();
    let offset = decode_byte_cursor(cursor)?.unwrap_or(0);
    validate_line_offset(&mut file, offset, file_len)?;
    file.seek(SeekFrom::Start(offset))
        .map_err(|error| format!("Failed to seek session message source: {error}"))?;

    let mut reader = BufReader::new(file);
    let mut position = offset;
    let mut builder = MessagePageBuilder::new();

    loop {
        if builder.is_full() {
            let next_cursor = (position < file_len).then(|| encode_byte_cursor(position));
            return Ok(builder.finish(next_cursor));
        }

        let record_offset = position;
        let mut record = Vec::new();
        let bytes_read = reader
            .read_until(b'\n', &mut record)
            .map_err(|error| format!("Failed to read session message source: {error}"))?;
        if bytes_read == 0 {
            return Ok(builder.finish(None));
        }
        position = position.saturating_add(bytes_read as u64);

        let Ok(value) = serde_json::from_slice::<Value>(&record) else {
            continue;
        };
        let Some(message) = parse_message(&value) else {
            continue;
        };
        let content_cursor = encode_record_cursor("line", record_offset, &record);
        if matches!(builder.push(message, content_cursor), PushOutcome::PageFull) {
            return Ok(builder.finish(Some(encode_byte_cursor(record_offset))));
        }
    }
}

pub(crate) fn load_jsonl_content<F>(
    path: &Path,
    cursor: &str,
    parse_message: F,
) -> Result<String, String>
where
    F: Fn(&Value) -> Option<SessionMessage>,
{
    let (offset, expected_digest) = decode_record_cursor(cursor, "line")?;
    let mut file = File::open(path).map_err(|error| {
        format!(
            "Failed to open session message source {}: {error}",
            path.display()
        )
    })?;
    let file_len = file
        .metadata()
        .map_err(|error| format!("Failed to inspect session message source: {error}"))?
        .len();
    validate_line_offset(&mut file, offset, file_len)?;
    file.seek(SeekFrom::Start(offset))
        .map_err(|error| format!("Failed to seek session message source: {error}"))?;

    let mut record = Vec::new();
    BufReader::new(file)
        .read_until(b'\n', &mut record)
        .map_err(|error| format!("Failed to read session message record: {error}"))?;
    validate_record_digest(&record, &expected_digest)?;
    let value: Value = serde_json::from_slice(&record)
        .map_err(|error| format!("Failed to parse session message record: {error}"))?;
    parse_message(&value)
        .map(|message| message.content)
        .ok_or_else(|| "The content cursor no longer points to a visible message".to_string())
}

pub(crate) fn load_json_array_page<F>(
    path: &Path,
    array_key: &str,
    cursor: Option<&str>,
    parse_message: F,
) -> Result<SessionMessagePage, String>
where
    F: Fn(&Value) -> Option<SessionMessage>,
{
    let offset = match decode_byte_cursor(cursor)? {
        Some(offset) => offset,
        None => find_named_array_start(path, array_key)?,
    };
    let file = File::open(path)
        .map_err(|error| format!("Failed to open JSON session {}: {error}", path.display()))?;
    let file_len = file
        .metadata()
        .map_err(|error| format!("Failed to inspect JSON session: {error}"))?
        .len();
    if offset > file_len {
        return Err("Session message cursor is beyond the end of the source".to_string());
    }

    let mut reader = BufReader::new(file);
    reader
        .seek(SeekFrom::Start(offset))
        .map_err(|error| format!("Failed to seek JSON session: {error}"))?;
    let mut json = JsonCursor::new(reader, offset);
    let mut builder = MessagePageBuilder::new();

    loop {
        let Some(record_offset) = prepare_array_entry(&mut json)? else {
            return Ok(builder.finish(None));
        };
        if builder.is_full() {
            return Ok(builder.finish(Some(encode_byte_cursor(record_offset))));
        }

        let record = json.read_value(true)?;
        let Ok(value) = serde_json::from_slice::<Value>(&record) else {
            continue;
        };
        let Some(message) = parse_message(&value) else {
            continue;
        };
        let content_cursor = encode_record_cursor("array", record_offset, &record);
        if matches!(builder.push(message, content_cursor), PushOutcome::PageFull) {
            return Ok(builder.finish(Some(encode_byte_cursor(record_offset))));
        }
    }
}

pub(crate) fn load_json_array_content<F>(
    path: &Path,
    cursor: &str,
    parse_message: F,
) -> Result<String, String>
where
    F: Fn(&Value) -> Option<SessionMessage>,
{
    let (offset, expected_digest) = decode_record_cursor(cursor, "array")?;
    let file = File::open(path)
        .map_err(|error| format!("Failed to open JSON session {}: {error}", path.display()))?;
    let file_len = file
        .metadata()
        .map_err(|error| format!("Failed to inspect JSON session: {error}"))?
        .len();
    if offset >= file_len {
        return Err("Session content cursor is beyond the end of the source".to_string());
    }
    let mut reader = BufReader::new(file);
    reader
        .seek(SeekFrom::Start(offset))
        .map_err(|error| format!("Failed to seek JSON session: {error}"))?;
    let mut json = JsonCursor::new(reader, offset);
    let record = json.read_value(true)?;
    validate_record_digest(&record, &expected_digest)?;
    let value: Value = serde_json::from_slice(&record)
        .map_err(|error| format!("Failed to parse session message record: {error}"))?;
    parse_message(&value)
        .map(|message| message.content)
        .ok_or_else(|| "The content cursor no longer points to a visible message".to_string())
}

pub(crate) fn encode_index_cursor(index: usize) -> String {
    format!("index:{index}")
}

pub(crate) fn decode_index_cursor(cursor: Option<&str>) -> Result<usize, String> {
    let Some(cursor) = cursor else {
        return Ok(0);
    };
    cursor
        .strip_prefix("index:")
        .ok_or_else(|| "Invalid session message index cursor".to_string())?
        .parse::<usize>()
        .map_err(|_| "Invalid session message index cursor".to_string())
}

pub(crate) fn encode_id_cursor(kind: &str, id: &str) -> String {
    format!("{kind}:{}", URL_SAFE_NO_PAD.encode(id.as_bytes()))
}

pub(crate) fn decode_id_cursor(cursor: &str, kind: &str) -> Result<String, String> {
    let encoded = cursor
        .strip_prefix(&format!("{kind}:"))
        .ok_or_else(|| "Invalid session message content cursor".to_string())?;
    let bytes = URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|_| "Invalid session message content cursor".to_string())?;
    String::from_utf8(bytes).map_err(|_| "Invalid session message content cursor".to_string())
}

fn truncate_utf8_bytes(value: &str, max_bytes: usize) -> &str {
    if value.len() <= max_bytes {
        return value;
    }
    let mut end = max_bytes;
    while end > 0 && !value.is_char_boundary(end) {
        end -= 1;
    }
    &value[..end]
}

fn encode_byte_cursor(offset: u64) -> String {
    format!("byte:{offset}")
}

fn decode_byte_cursor(cursor: Option<&str>) -> Result<Option<u64>, String> {
    let Some(cursor) = cursor else {
        return Ok(None);
    };
    cursor
        .strip_prefix("byte:")
        .ok_or_else(|| "Invalid session message byte cursor".to_string())?
        .parse::<u64>()
        .map(Some)
        .map_err(|_| "Invalid session message byte cursor".to_string())
}

fn encode_record_cursor(kind: &str, offset: u64, record: &[u8]) -> String {
    format!("{kind}:{offset}:{}", record_digest(record))
}

fn decode_record_cursor(cursor: &str, kind: &str) -> Result<(u64, String), String> {
    let mut parts = cursor.splitn(3, ':');
    if parts.next() != Some(kind) {
        return Err("Invalid session message content cursor".to_string());
    }
    let offset = parts
        .next()
        .ok_or_else(|| "Invalid session message content cursor".to_string())?
        .parse::<u64>()
        .map_err(|_| "Invalid session message content cursor".to_string())?;
    let digest = parts
        .next()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Invalid session message content cursor".to_string())?;
    Ok((offset, digest.to_string()))
}

fn record_digest(record: &[u8]) -> String {
    let digest = Sha256::digest(record);
    let mut encoded = String::with_capacity(digest.len() * 2);
    for byte in digest {
        use std::fmt::Write as _;
        let _ = write!(encoded, "{byte:02x}");
    }
    encoded
}

fn validate_record_digest(record: &[u8], expected: &str) -> Result<(), String> {
    if record_digest(record) == expected {
        Ok(())
    } else {
        Err("The session message changed after its preview was loaded".to_string())
    }
}

fn validate_line_offset(file: &mut File, offset: u64, file_len: u64) -> Result<(), String> {
    if offset > file_len {
        return Err("Session message cursor is beyond the end of the source".to_string());
    }
    if offset == 0 || offset == file_len {
        return Ok(());
    }
    file.seek(SeekFrom::Start(offset - 1))
        .map_err(|error| format!("Failed to validate session message cursor: {error}"))?;
    let mut previous = [0_u8; 1];
    file.read_exact(&mut previous)
        .map_err(|error| format!("Failed to validate session message cursor: {error}"))?;
    if previous[0] != b'\n' {
        return Err("Session message cursor is not at a record boundary".to_string());
    }
    Ok(())
}

fn find_named_array_start(path: &Path, key: &str) -> Result<u64, String> {
    let file = File::open(path)
        .map_err(|error| format!("Failed to open JSON session {}: {error}", path.display()))?;
    let mut json = JsonCursor::new(BufReader::new(file), 0);
    json.skip_whitespace()?;
    json.expect(b'{')?;

    loop {
        json.skip_whitespace()?;
        if json.peek_byte()? == Some(b'}') {
            return Err(format!("No {key} array found"));
        }
        if json.peek_byte()? == Some(b',') {
            json.read_byte()?;
            json.skip_whitespace()?;
        }

        let raw_key = json.read_value(true)?;
        let field: String = serde_json::from_slice(&raw_key)
            .map_err(|error| format!("Failed to parse JSON session field name: {error}"))?;
        json.skip_whitespace()?;
        json.expect(b':')?;
        json.skip_whitespace()?;

        if field == key {
            json.expect(b'[')?;
            return Ok(json.position());
        }
        json.read_value(false)?;
    }
}

fn prepare_array_entry<R: BufRead>(json: &mut JsonCursor<R>) -> Result<Option<u64>, String> {
    json.skip_whitespace()?;
    if json.peek_byte()? == Some(b',') {
        json.read_byte()?;
        json.skip_whitespace()?;
    }
    match json.peek_byte()? {
        Some(b']') => {
            json.read_byte()?;
            Ok(None)
        }
        Some(_) => Ok(Some(json.position())),
        None => Err("Unexpected end of JSON message array".to_string()),
    }
}

struct JsonCursor<R> {
    reader: R,
    offset: u64,
}

impl<R: Read> JsonCursor<R> {
    fn new(reader: R, offset: u64) -> Self {
        Self { reader, offset }
    }

    fn position(&self) -> u64 {
        self.offset
    }

    fn read_byte(&mut self) -> Result<Option<u8>, String> {
        let mut byte = [0_u8; 1];
        match self.reader.read(&mut byte) {
            Ok(0) => Ok(None),
            Ok(_) => {
                self.offset = self.offset.saturating_add(1);
                Ok(Some(byte[0]))
            }
            Err(error) => Err(format!("Failed to read JSON session: {error}")),
        }
    }

    fn peek_byte(&mut self) -> Result<Option<u8>, String>
    where
        R: BufRead,
    {
        self.reader
            .fill_buf()
            .map_err(|error| format!("Failed to read JSON session: {error}"))
            .map(|buffer| buffer.first().copied())
    }

    fn skip_whitespace(&mut self) -> Result<(), String>
    where
        R: BufRead,
    {
        while matches!(self.peek_byte()?, Some(b' ' | b'\n' | b'\r' | b'\t')) {
            self.read_byte()?;
        }
        Ok(())
    }

    fn expect(&mut self, expected: u8) -> Result<(), String> {
        match self.read_byte()? {
            Some(actual) if actual == expected => Ok(()),
            _ => Err(format!(
                "Invalid JSON session structure at byte {}",
                self.offset
            )),
        }
    }

    fn read_value(&mut self, collect: bool) -> Result<Vec<u8>, String>
    where
        R: BufRead,
    {
        self.skip_whitespace()?;
        let first = self
            .peek_byte()?
            .ok_or_else(|| "Unexpected end of JSON session".to_string())?;
        let mut output = Vec::new();

        if first == b'"' {
            self.read_string(collect, &mut output)?;
            return Ok(output);
        }
        if first == b'{' || first == b'[' {
            let mut depth = 0_usize;
            let mut in_string = false;
            let mut escaped = false;
            loop {
                let byte = self
                    .read_byte()?
                    .ok_or_else(|| "Unexpected end of JSON value".to_string())?;
                if collect {
                    output.push(byte);
                }
                if in_string {
                    if escaped {
                        escaped = false;
                    } else if byte == b'\\' {
                        escaped = true;
                    } else if byte == b'"' {
                        in_string = false;
                    }
                    continue;
                }
                match byte {
                    b'"' => in_string = true,
                    b'{' | b'[' => depth = depth.saturating_add(1),
                    b'}' | b']' => {
                        depth = depth.saturating_sub(1);
                        if depth == 0 {
                            return Ok(output);
                        }
                    }
                    _ => {}
                }
            }
        }

        while let Some(byte) = self.peek_byte()? {
            if matches!(byte, b',' | b']' | b'}' | b' ' | b'\n' | b'\r' | b'\t') {
                break;
            }
            let byte = self.read_byte()?.expect("peeked byte must remain readable");
            if collect {
                output.push(byte);
            }
        }
        if output.is_empty() && collect {
            return Err("Invalid JSON value".to_string());
        }
        Ok(output)
    }

    fn read_string(&mut self, collect: bool, output: &mut Vec<u8>) -> Result<(), String> {
        let opening = self
            .read_byte()?
            .ok_or_else(|| "Unexpected end of JSON string".to_string())?;
        if opening != b'"' {
            return Err("Invalid JSON string".to_string());
        }
        if collect {
            output.push(opening);
        }

        let mut escaped = false;
        loop {
            let byte = self
                .read_byte()?
                .ok_or_else(|| "Unexpected end of JSON string".to_string())?;
            if collect {
                output.push(byte);
            }
            if escaped {
                escaped = false;
            } else if byte == b'\\' {
                escaped = true;
            } else if byte == b'"' {
                return Ok(());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;

    fn parse_message(value: &Value) -> Option<SessionMessage> {
        Some(SessionMessage {
            role: value.get("role")?.as_str()?.to_string(),
            content: value.get("content")?.as_str()?.to_string(),
            ts: None,
        })
    }

    #[test]
    fn jsonl_pages_reconstruct_order_with_item_limit() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("session.jsonl");
        let mut file = File::create(&path).expect("create");
        for index in 0..55 {
            writeln!(file, r##"{{"role":"user","content":"message-{index}"}}"##).expect("write");
        }

        let mut cursor = None;
        let mut messages = Vec::new();
        loop {
            let page = load_jsonl_page(&path, cursor.as_deref(), parse_message).expect("page");
            messages.extend(page.items.into_iter().map(|item| item.content));
            if !page.has_more {
                break;
            }
            cursor = page.next_cursor;
        }

        assert_eq!(messages.len(), 55);
        assert_eq!(messages.first().map(String::as_str), Some("message-0"));
        assert_eq!(messages.last().map(String::as_str), Some("message-54"));
    }

    #[test]
    fn oversized_jsonl_message_has_bounded_preview_and_exact_content_cursor() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("session.jsonl");
        let full_content = "x".repeat(MESSAGE_PAGE_MAX_BYTES + 1024);
        let mut file = File::create(&path).expect("create");
        writeln!(
            file,
            "{}",
            serde_json::json!({"role": "assistant", "content": full_content.clone()})
        )
        .expect("write");

        let page = load_jsonl_page(&path, None, parse_message).expect("page");
        let item = page.items.first().expect("item");
        assert!(item.content.len() <= MESSAGE_PAGE_MAX_BYTES);
        let cursor = item.content_cursor.as_deref().expect("content cursor");
        assert_eq!(
            load_jsonl_content(&path, cursor, parse_message).expect("full content"),
            full_content
        );
    }

    #[test]
    fn json_array_pages_seek_to_element_boundaries() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("session.json");
        let values = (0..55)
            .map(|index| serde_json::json!({"role": "user", "content": format!("message-{index}")}))
            .collect::<Vec<_>>();
        std::fs::write(&path, serde_json::json!({"messages": values}).to_string()).expect("write");

        let mut cursor = None;
        let mut messages = Vec::new();
        loop {
            let page = load_json_array_page(&path, "messages", cursor.as_deref(), parse_message)
                .expect("page");
            messages.extend(page.items.into_iter().map(|item| item.content));
            if !page.has_more {
                break;
            }
            cursor = page.next_cursor;
        }

        assert_eq!(messages.len(), 55);
        assert_eq!(messages[50], "message-50");
    }
}
