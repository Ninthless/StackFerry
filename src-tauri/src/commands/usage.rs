//! 使用统计相关命令

use crate::error::AppError;
use crate::services::model_pricing::{ModelPricingInfo, ModelsDevSyncConfig, ModelsDevSyncState};
use crate::services::usage_stats::*;
use crate::store::AppState;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

async fn run_usage_query<T, F>(name: &'static str, query: F) -> Result<T, AppError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, AppError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(query)
        .await
        .map_err(|error| AppError::Message(format!("{name} task failed: {error}")))?
}

/// 获取使用量汇总
#[tauri::command]
pub async fn get_usage_summary(
    state: State<'_, AppState>,
    start_date: Option<i64>,
    end_date: Option<i64>,
    app_type: Option<String>,
    provider_name: Option<String>,
    model: Option<String>,
) -> Result<UsageSummary, AppError> {
    let db = state.db.clone();
    run_usage_query("get_usage_summary", move || {
        db.get_usage_summary(
            start_date,
            end_date,
            app_type.as_deref(),
            provider_name.as_deref(),
            model.as_deref(),
        )
    })
    .await
}

/// 获取按 app_type 拆分的使用量汇总
#[tauri::command]
pub async fn get_usage_summary_by_app(
    state: State<'_, AppState>,
    start_date: Option<i64>,
    end_date: Option<i64>,
    provider_name: Option<String>,
    model: Option<String>,
) -> Result<Vec<UsageSummaryByApp>, AppError> {
    let db = state.db.clone();
    run_usage_query("get_usage_summary_by_app", move || {
        db.get_usage_summary_by_app(
            start_date,
            end_date,
            provider_name.as_deref(),
            model.as_deref(),
        )
    })
    .await
}

/// 获取每日趋势
#[tauri::command]
pub async fn get_usage_trends(
    state: State<'_, AppState>,
    start_date: Option<i64>,
    end_date: Option<i64>,
    app_type: Option<String>,
    provider_name: Option<String>,
    model: Option<String>,
) -> Result<Vec<DailyStats>, AppError> {
    let db = state.db.clone();
    run_usage_query("get_usage_trends", move || {
        db.get_daily_trends(
            start_date,
            end_date,
            app_type.as_deref(),
            provider_name.as_deref(),
            model.as_deref(),
        )
    })
    .await
}

/// 获取 Provider 统计
#[tauri::command]
pub async fn get_provider_stats(
    state: State<'_, AppState>,
    start_date: Option<i64>,
    end_date: Option<i64>,
    app_type: Option<String>,
    provider_name: Option<String>,
    model: Option<String>,
) -> Result<Vec<ProviderStats>, AppError> {
    let db = state.db.clone();
    run_usage_query("get_provider_stats", move || {
        db.get_provider_stats(
            start_date,
            end_date,
            app_type.as_deref(),
            provider_name.as_deref(),
            model.as_deref(),
        )
    })
    .await
}

/// 获取模型统计
#[tauri::command]
pub async fn get_model_stats(
    state: State<'_, AppState>,
    start_date: Option<i64>,
    end_date: Option<i64>,
    app_type: Option<String>,
    provider_name: Option<String>,
    model: Option<String>,
) -> Result<Vec<ModelStats>, AppError> {
    let db = state.db.clone();
    run_usage_query("get_model_stats", move || {
        db.get_model_stats(
            start_date,
            end_date,
            app_type.as_deref(),
            provider_name.as_deref(),
            model.as_deref(),
        )
    })
    .await
}

/// 获取请求日志列表
#[tauri::command]
pub async fn get_request_logs(
    state: State<'_, AppState>,
    filters: LogFilters,
    page: u32,
    page_size: u32,
) -> Result<PaginatedLogs, AppError> {
    let db = state.db.clone();
    run_usage_query("get_request_logs", move || {
        db.get_request_logs(&filters, page, page_size)
    })
    .await
}

#[tauri::command]
pub async fn get_request_log_facets(
    state: State<'_, AppState>,
    filters: LogFilters,
) -> Result<RequestLogFacets, AppError> {
    let db = state.db.clone();
    run_usage_query("get_request_log_facets", move || {
        db.get_request_log_facets(&filters)
    })
    .await
}

/// 获取单个请求详情
#[tauri::command]
pub async fn get_request_detail(
    state: State<'_, AppState>,
    request_id: String,
) -> Result<Option<RequestLogDetail>, AppError> {
    let db = state.db.clone();
    run_usage_query("get_request_detail", move || {
        db.get_request_detail(&request_id)
    })
    .await
}

fn csv_field(value: impl AsRef<str>) -> String {
    let value = value.as_ref();
    if value.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

fn diagnostic_origin(failure_kind: Option<&str>, status_code: u16) -> &'static str {
    match failure_kind {
        Some(
            "upstream_capacity"
            | "upstream_rate_limit"
            | "upstream_server_error"
            | "response_header_timeout"
            | "first_chunk_timeout"
            | "semantic_output_timeout"
            | "upstream_timeout"
            | "stream_idle_timeout"
            | "connection_failure",
        ) => "upstream",
        Some("authentication" | "configuration" | "invalid_request") => "client_or_configuration",
        Some("response_transform" | "proxy_error") => "stackferry",
        Some("no_available_provider") => "routing_or_provider_availability",
        Some(_) => "undetermined",
        None if (400..500).contains(&status_code) => "client_or_configuration",
        None if status_code >= 500 => "undetermined",
        None => "none",
    }
}

#[tauri::command]
pub async fn export_request_logs(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    filters: LogFilters,
) -> Result<Option<String>, AppError> {
    let db = state.db.clone();
    let logs = run_usage_query("export_request_logs", move || {
        db.get_request_logs(&filters, 0, u32::MAX)
    })
    .await?;
    let default_name = format!(
        "stackferry-request-logs-{}.csv",
        chrono::Local::now().format("%Y%m%d-%H%M%S")
    );
    let destination = app
        .dialog()
        .file()
        .add_filter("CSV", &["csv"])
        .set_file_name(&default_name)
        .blocking_save_file();
    let Some(destination) = destination else {
        return Ok(None);
    };
    let destination_path = destination
        .into_path()
        .map_err(|_| AppError::Message("导出路径无效".to_string()))?;
    let mut csv = String::from(
        "created_at,request_id,app_type,api_type,provider_name,provider_id,request_model,model,thinking_effort,thinking_effort_source,status_code,diagnostic_origin,failure_kind,latency_ms,first_token_ms,duration_ms,is_streaming,input_tokens,output_tokens,reasoning_tokens,cache_read_tokens,cache_creation_tokens,cache_creation_1h_tokens,input_cost_usd,output_cost_usd,cache_read_cost_usd,cache_creation_cost_usd,total_cost_usd,cost_multiplier,data_source,pricing_model,upstream_response_id,stop_reason,error_message,route_trace\n",
    );
    for log in logs.data {
        let origin = diagnostic_origin(log.failure_kind.as_deref(), log.status_code).to_string();
        let fields = [
            log.created_at.to_string(),
            log.request_id,
            log.app_type,
            log.api_type,
            log.provider_name.unwrap_or_default(),
            log.provider_id,
            log.request_model.unwrap_or_default(),
            log.model,
            log.thinking_effort.unwrap_or_default(),
            log.thinking_effort_source.unwrap_or_default(),
            log.status_code.to_string(),
            origin,
            log.failure_kind.unwrap_or_default(),
            log.latency_ms.to_string(),
            log.first_token_ms
                .map(|value| value.to_string())
                .unwrap_or_default(),
            log.duration_ms
                .map(|value| value.to_string())
                .unwrap_or_default(),
            log.is_streaming.to_string(),
            log.input_tokens.to_string(),
            log.output_tokens.to_string(),
            log.reasoning_tokens.to_string(),
            log.cache_read_tokens.to_string(),
            log.cache_creation_tokens.to_string(),
            log.cache_creation_1h_tokens.to_string(),
            log.input_cost_usd,
            log.output_cost_usd,
            log.cache_read_cost_usd,
            log.cache_creation_cost_usd,
            log.total_cost_usd,
            log.cost_multiplier,
            log.data_source.unwrap_or_default(),
            log.pricing_model.unwrap_or_default(),
            log.upstream_response_id.unwrap_or_default(),
            log.stop_reason.unwrap_or_default(),
            log.error_message.unwrap_or_default(),
            log.route_trace.unwrap_or_default(),
        ];
        csv.push_str(&fields.iter().map(csv_field).collect::<Vec<_>>().join(","));
        csv.push('\n');
    }
    std::fs::write(&destination_path, csv)
        .map_err(|e| AppError::Message(format!("写入请求日志失败: {e}")))?;
    Ok(Some(destination_path.to_string_lossy().into_owned()))
}

/// 获取模型定价列表
#[tauri::command]
pub fn get_model_pricing(state: State<'_, AppState>) -> Result<Vec<ModelPricingInfo>, AppError> {
    log::info!("获取模型定价列表");
    state.db.ensure_model_pricing_seeded()?;
    crate::services::model_pricing::sync_local_model_pricing(&state.db)?;

    let db = state.db.clone();
    let conn = crate::database::lock_conn!(db.conn);

    // 检查表是否存在
    let table_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='model_pricing'",
            [],
            |row| row.get::<_, i64>(0).map(|count| count > 0),
        )
        .unwrap_or(false);

    if !table_exists {
        log::error!("model_pricing 表不存在,可能需要重启应用以触发数据库迁移");
        return Ok(Vec::new());
    }

    let mut stmt = conn.prepare(
        "SELECT model_id, display_name, input_cost_per_million, output_cost_per_million,
                cache_read_cost_per_million, cache_creation_cost_per_million
         FROM model_pricing
         ORDER BY display_name",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(ModelPricingInfo {
            model_id: row.get(0)?,
            display_name: row.get(1)?,
            input_cost_per_million: row.get(2)?,
            output_cost_per_million: row.get(3)?,
            cache_read_cost_per_million: row.get(4)?,
            cache_creation_cost_per_million: row.get(5)?,
        })
    })?;

    let mut pricing = Vec::new();
    for row in rows {
        pricing.push(row?);
    }

    log::info!("成功获取 {} 条模型定价数据", pricing.len());
    Ok(pricing)
}

/// 更新模型定价
#[tauri::command]
pub fn update_model_pricing(
    state: State<'_, AppState>,
    model_id: String,
    display_name: String,
    input_cost: String,
    output_cost: String,
    cache_read_cost: String,
    cache_creation_cost: String,
) -> Result<(), AppError> {
    crate::services::model_pricing::update_model_pricing(
        &state.db,
        ModelPricingInfo {
            model_id,
            display_name,
            input_cost_per_million: input_cost,
            output_cost_per_million: output_cost,
            cache_read_cost_per_million: cache_read_cost,
            cache_creation_cost_per_million: cache_creation_cost,
        },
    )?;
    Ok(())
}

/// 批量更新模型定价（models.dev 自动同步仅触发一次历史成本回填）
#[tauri::command]
pub fn update_model_pricing_batch(
    state: State<'_, AppState>,
    entries: Vec<ModelPricingInfo>,
) -> Result<usize, AppError> {
    crate::services::model_pricing::update_model_pricing_batch(&state.db, entries)
}

#[tauri::command]
pub fn get_models_dev_sync_config(
    state: State<'_, AppState>,
) -> Result<ModelsDevSyncState, AppError> {
    crate::services::model_pricing::get_models_dev_sync_state(&state.db)
}

#[tauri::command]
pub fn save_models_dev_sync_config(
    state: State<'_, AppState>,
    config: ModelsDevSyncConfig,
) -> Result<(), AppError> {
    crate::services::model_pricing::save_models_dev_sync_config(&state.db, config)
}

#[tauri::command]
pub fn record_models_dev_sync_result(
    state: State<'_, AppState>,
    synced_at: Option<i64>,
    error: Option<String>,
) -> Result<(), AppError> {
    crate::services::model_pricing::record_models_dev_sync_result(&state.db, synced_at, error)
}

/// 检查 Provider 使用限额
#[tauri::command]
pub fn check_provider_limits(
    state: State<'_, AppState>,
    provider_id: String,
    app_type: String,
) -> Result<crate::services::usage_stats::ProviderLimitStatus, AppError> {
    state.db.check_provider_limits(&provider_id, &app_type)
}

/// 删除模型定价
#[tauri::command]
pub fn delete_model_pricing(state: State<'_, AppState>, model_id: String) -> Result<(), AppError> {
    crate::services::model_pricing::delete_model_pricing(&state.db, &model_id)?;
    log::info!("已删除模型定价: {model_id}");
    Ok(())
}

/// 手动触发会话日志同步
#[tauri::command]
pub async fn sync_session_usage(
    state: State<'_, AppState>,
) -> Result<crate::services::session_usage::SessionSyncResult, AppError> {
    let db = state.db.clone();
    let _guard = crate::services::session_usage::session_sync_mutex()
        .lock()
        .await;
    tauri::async_runtime::spawn_blocking(move || {
        crate::services::session_usage::sync_all_unlocked(&db)
    })
    .await
    .map_err(|error| AppError::Message(format!("会话用量同步任务失败: {error}")))
}

/// Codex reset 成功后，无论重导是否导入新行或返回错误，都必须通知前端刷新。
/// 调用方应只在 reset 成功后调用，避免把未发生的数据变更误报为重建完成。
fn finish_codex_rebuild(
    result: Result<crate::services::session_usage::SessionSyncResult, AppError>,
) -> Result<crate::services::session_usage::SessionSyncResult, AppError> {
    crate::usage_events::notify_log_recorded();
    result
}

/// 备份数据库后，仅重建 Codex session 用量。锁覆盖 backup → reset → import
/// 整个序列，避免后台同步在清理和重导之间插入数据。
#[tauri::command]
pub async fn rebuild_codex_usage(
    state: State<'_, AppState>,
) -> Result<crate::services::session_usage::SessionSyncResult, AppError> {
    let db = state.db.clone();
    let _guard = crate::services::session_usage::session_sync_mutex()
        .lock()
        .await;
    tauri::async_runtime::spawn_blocking(move || {
        db.backup_database_file()?;
        db.reset_codex_usage()?;
        let result = crate::services::session_usage_codex::sync_codex_usage(&db);
        finish_codex_rebuild(result)
    })
    .await
    .map_err(|error| AppError::Message(format!("Codex 用量重建任务失败: {error}")))?
}

/// 获取数据来源分布
#[tauri::command]
pub fn get_usage_data_sources(
    state: State<'_, AppState>,
) -> Result<Vec<crate::services::session_usage::DataSourceSummary>, AppError> {
    crate::services::session_usage::get_data_source_breakdown(&state.db)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codex_rebuild_notifies_when_reimport_is_empty() {
        crate::usage_events::take_test_notify_count();

        let result = finish_codex_rebuild(Ok(
            crate::services::session_usage::SessionSyncResult::default(),
        ))
        .expect("空重导应成功");

        assert_eq!(result.imported, 0);
        assert_eq!(crate::usage_events::take_test_notify_count(), 1);
    }

    #[test]
    fn codex_rebuild_notifies_when_reimport_fails_after_reset() {
        crate::usage_events::take_test_notify_count();

        let result = finish_codex_rebuild(Err(AppError::Message(
            "synthetic reimport failure".to_string(),
        )));

        assert!(result.is_err());
        assert_eq!(crate::usage_events::take_test_notify_count(), 1);
    }
}
