//! SQL fragment helpers shared across usage aggregation queries.
//!
//! Anthropic reports `input_tokens` as fresh (cache reads counted
//! separately); OpenAI Responses API and Google Gemini's
//! `promptTokenCount` both include the cached portion. Any aggregation
//! summing `input_tokens` across providers must route through
//! [`fresh_input_sql`] to recover a consistent semantics.

/// Set of `app_type` values whose stored `input_tokens` already includes
/// `cache_read_tokens`. Aggregations subtract cache reads from these rows
/// to recover the fresh-input semantics used by Claude.
///
/// Why list providers explicitly: new providers default to the
/// Claude-style "input excludes cache" semantics, which is safer if the
/// caller forgets to update this list. The wrong direction (a new OpenAI-
/// style provider not added here) shows up loudly as a too-low cache hit
/// rate, which is easier to catch than the silent over-deduction that
/// would happen with the opposite default.
/// 单一语义集（SSOT）：写入侧（proxy logger/calculator）、回填侧
/// （usage_stats 成本重算）与展示侧（本文件的 SQL 归一）都必须引用这里，
/// 防止同一语义散落多处后新增 app 时漏改（grokbuild 曾在回填侧漏掉）。
/// 前端 `src/types/usage.ts` 的同名常量是跨语言的对应物，改动须同步。
pub(crate) use crate::core::usage::{
    default_input_token_semantics, fresh_input_sql, is_cache_inclusive_app,
    INPUT_TOKEN_SEMANTICS_FRESH, INPUT_TOKEN_SEMANTICS_TOTAL,
};

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE proxy_request_logs (
                request_id TEXT PRIMARY KEY,
                app_type TEXT NOT NULL,
                input_tokens INTEGER NOT NULL DEFAULT 0,
                output_tokens INTEGER NOT NULL DEFAULT 0,
                cache_read_tokens INTEGER NOT NULL DEFAULT 0,
                cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
                input_token_semantics INTEGER NOT NULL DEFAULT 0
            );",
        )
        .unwrap();
        conn
    }

    #[test]
    fn fresh_input_with_alias_emits_prefixed_columns() {
        let sql = fresh_input_sql("l");
        assert!(sql.contains("l.app_type"));
        assert!(sql.contains("l.input_tokens"));
        assert!(sql.contains("l.cache_read_tokens"));
    }

    #[test]
    fn fresh_input_without_alias_uses_bare_columns() {
        let sql = fresh_input_sql("");
        assert!(!sql.contains("."));
        assert!(sql.contains("'codex'"));
        assert!(sql.contains("'gemini'"));
        assert!(sql.contains("'grokbuild'"));
    }

    #[test]
    fn fresh_input_subtracts_cache_for_cache_inclusive_providers() {
        let conn = setup_conn();
        // Codex row: OpenAI semantics — input_tokens includes the 600 cached.
        conn.execute(
            "INSERT INTO proxy_request_logs (request_id, app_type, input_tokens, cache_read_tokens)
             VALUES ('codex-1', 'codex', 1000, 600)",
            [],
        )
        .unwrap();
        // Gemini row: Google semantics — promptTokenCount includes cachedContentTokenCount.
        conn.execute(
            "INSERT INTO proxy_request_logs (request_id, app_type, input_tokens, cache_read_tokens)
             VALUES ('gemini-1', 'gemini', 800, 300)",
            [],
        )
        .unwrap();
        // Grok Build uses OpenAI Responses semantics too.
        conn.execute(
            "INSERT INTO proxy_request_logs (request_id, app_type, input_tokens, cache_read_tokens)
             VALUES ('grok-1', 'grokbuild', 700, 250)",
            [],
        )
        .unwrap();
        // Claude row: Anthropic semantics — input_tokens already excludes cache.
        conn.execute(
            "INSERT INTO proxy_request_logs (request_id, app_type, input_tokens, cache_read_tokens)
             VALUES ('claude-1', 'claude', 200, 5000)",
            [],
        )
        .unwrap();

        let expr = fresh_input_sql("l");
        let sql = format!("SELECT COALESCE(SUM({expr}), 0) FROM proxy_request_logs l");
        let total: i64 = conn.query_row(&sql, [], |r| r.get(0)).unwrap();
        // Codex: 400; Gemini: 500; Grok Build: 450; Claude: 200 unchanged.
        assert_eq!(total, 400 + 500 + 450 + 200);
    }

    #[test]
    fn fresh_input_handles_codex_with_cache_exceeding_input() {
        // Defensive: if a malformed Codex row somehow has cache > input,
        // we keep the original value rather than producing a negative number.
        let conn = setup_conn();
        conn.execute(
            "INSERT INTO proxy_request_logs (request_id, app_type, input_tokens, cache_read_tokens)
             VALUES ('codex-broken', 'codex', 100, 999)",
            [],
        )
        .unwrap();
        let expr = fresh_input_sql("l");
        let sql = format!("SELECT {expr} FROM proxy_request_logs l");
        let value: i64 = conn.query_row(&sql, [], |r| r.get(0)).unwrap();
        assert_eq!(value, 100);
    }

    #[test]
    fn fresh_input_subtracts_cache_write_for_total_semantics() {
        let conn = setup_conn();
        conn.execute(
            "INSERT INTO proxy_request_logs (
                request_id, app_type, input_tokens, cache_read_tokens,
                cache_creation_tokens, input_token_semantics
             ) VALUES ('codex-total', 'codex', 1000, 300, 200, ?1)",
            [INPUT_TOKEN_SEMANTICS_TOTAL],
        )
        .unwrap();
        let expr = fresh_input_sql("l");
        let sql = format!("SELECT {expr} FROM proxy_request_logs l");
        let value: i64 = conn.query_row(&sql, [], |row| row.get(0)).unwrap();
        assert_eq!(value, 500);
    }

    #[test]
    fn fresh_input_keeps_normalized_rollup_value() {
        let conn = setup_conn();
        conn.execute(
            "INSERT INTO proxy_request_logs (
                request_id, app_type, input_tokens, cache_read_tokens,
                cache_creation_tokens, input_token_semantics
             ) VALUES ('codex-fresh', 'codex', 500, 300, 200, ?1)",
            [INPUT_TOKEN_SEMANTICS_FRESH],
        )
        .unwrap();
        let expr = fresh_input_sql("l");
        let sql = format!("SELECT {expr} FROM proxy_request_logs l");
        let value: i64 = conn.query_row(&sql, [], |row| row.get(0)).unwrap();
        assert_eq!(value, 500);
    }

    #[test]
    fn pi_mixed_protocol_rows_follow_explicit_semantics() {
        let conn = setup_conn();
        conn.execute(
            "INSERT INTO proxy_request_logs (
                request_id, app_type, input_tokens, cache_read_tokens,
                cache_creation_tokens, input_token_semantics
             ) VALUES ('pi-anthropic', 'pi', 200, 300, 100, ?1)",
            [INPUT_TOKEN_SEMANTICS_FRESH],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO proxy_request_logs (
                request_id, app_type, input_tokens, cache_read_tokens,
                cache_creation_tokens, input_token_semantics
             ) VALUES ('pi-openai', 'pi', 1000, 300, 200, ?1)",
            [INPUT_TOKEN_SEMANTICS_TOTAL],
        )
        .unwrap();

        let expr = fresh_input_sql("l");
        let sql =
            format!("SELECT request_id, {expr} FROM proxy_request_logs l ORDER BY request_id");
        let mut stmt = conn.prepare(&sql).unwrap();
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(
            rows,
            vec![
                ("pi-anthropic".to_string(), 200),
                ("pi-openai".to_string(), 500),
            ]
        );
    }
}
