pub(crate) const CACHE_INCLUSIVE_APP_TYPES: &[&str] = &["codex", "gemini", "grokbuild"];

pub(crate) const INPUT_TOKEN_SEMANTICS_LEGACY: i64 = 0;
pub(crate) const INPUT_TOKEN_SEMANTICS_TOTAL: i64 = 1;
pub(crate) const INPUT_TOKEN_SEMANTICS_FRESH: i64 = 2;

pub(crate) fn is_cache_inclusive_app(app_type: &str) -> bool {
    CACHE_INCLUSIVE_APP_TYPES.contains(&app_type)
}

pub(crate) fn default_input_token_semantics(app_type: &str) -> i64 {
    if is_cache_inclusive_app(app_type) {
        INPUT_TOKEN_SEMANTICS_TOTAL
    } else {
        INPUT_TOKEN_SEMANTICS_FRESH
    }
}

pub(crate) fn fresh_input_sql(alias: &str) -> String {
    let prefix = if alias.is_empty() {
        String::new()
    } else {
        format!("{alias}.")
    };
    let app_type_list = CACHE_INCLUSIVE_APP_TYPES
        .iter()
        .map(|app_type| format!("'{app_type}'"))
        .collect::<Vec<_>>()
        .join(", ");
    format!(
        "CASE \
             WHEN {prefix}input_token_semantics = {INPUT_TOKEN_SEMANTICS_FRESH} THEN {prefix}input_tokens \
             WHEN {prefix}input_token_semantics = {INPUT_TOKEN_SEMANTICS_TOTAL} \
                  AND {prefix}input_tokens >= ({prefix}cache_read_tokens + {prefix}cache_creation_tokens) \
             THEN ({prefix}input_tokens - {prefix}cache_read_tokens - {prefix}cache_creation_tokens) \
             WHEN {prefix}app_type IN ({app_type_list}) \
                  AND {prefix}input_token_semantics = {INPUT_TOKEN_SEMANTICS_LEGACY} \
                  AND {prefix}input_tokens >= {prefix}cache_read_tokens \
             THEN ({prefix}input_tokens - {prefix}cache_read_tokens) \
             ELSE {prefix}input_tokens END"
    )
}

pub(crate) fn effective_usage_log_filter(log_alias: &str) -> String {
    const SESSION_PROXY_DEDUP_WINDOW_SECONDS: i64 = 10 * 60;

    let data_source = data_source_expr(log_alias);
    let response_proxy_data_source = data_source_expr("proxy_by_response");
    let usage_proxy_data_source = data_source_expr("proxy_by_usage");

    format!(
        "NOT (
            (
                {data_source} = 'pi_session'
                AND NULLIF({log_alias}.upstream_response_id, '') IS NOT NULL
                AND EXISTS (
                    SELECT 1
                    FROM proxy_request_logs proxy_by_response
                    WHERE {response_proxy_data_source} = 'proxy'
                      AND proxy_by_response.app_type = {log_alias}.app_type
                      AND proxy_by_response.status_code >= 200
                      AND proxy_by_response.status_code < 300
                      AND proxy_by_response.provider_id = {log_alias}.provider_id
                      AND proxy_by_response.upstream_response_id = {log_alias}.upstream_response_id
                )
            )
            OR (
                {data_source} IN ('session_log', 'codex_session', 'gemini_session', 'opencode_session', 'pi_session')
                AND EXISTS (
                    SELECT 1
                    FROM proxy_request_logs proxy_by_usage
                    WHERE {usage_proxy_data_source} = 'proxy'
                      AND proxy_by_usage.app_type = {log_alias}.app_type
                      AND proxy_by_usage.status_code >= 200
                      AND proxy_by_usage.status_code < 300
                      AND proxy_by_usage.input_tokens = {log_alias}.input_tokens
                      AND proxy_by_usage.output_tokens = {log_alias}.output_tokens
                      AND proxy_by_usage.cache_read_tokens = {log_alias}.cache_read_tokens
                      AND (
                          proxy_by_usage.cache_creation_tokens = {log_alias}.cache_creation_tokens
                          OR (
                              {log_alias}.cache_creation_tokens = 0
                              AND {data_source} IN ('codex_session', 'gemini_session', 'opencode_session')
                          )
                      )
                      AND proxy_by_usage.created_at BETWEEN
                          {log_alias}.created_at - {SESSION_PROXY_DEDUP_WINDOW_SECONDS}
                          AND {log_alias}.created_at + {SESSION_PROXY_DEDUP_WINDOW_SECONDS}
                      AND (
                          LOWER(proxy_by_usage.model) = LOWER({log_alias}.model)
                          OR LOWER(proxy_by_usage.model) = 'unknown'
                          OR LOWER({log_alias}.model) = 'unknown'
                      )
                )
            )
        )"
    )
}

fn data_source_expr(alias: &str) -> String {
    format!("COALESCE({alias}.data_source, 'proxy')")
}
