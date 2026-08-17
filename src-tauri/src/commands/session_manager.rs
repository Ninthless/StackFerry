#![allow(non_snake_case)]

use crate::session_manager;
use tauri::State;

#[tauri::command]
pub async fn list_sessions(
    state: State<'_, crate::store::AppState>,
    providerId: String,
    scope: Option<session_manager::SessionScope>,
    instanceId: Option<String>,
    forceRefresh: bool,
) -> Result<Vec<session_manager::SessionMeta>, String> {
    let scope = scope.unwrap_or(match instanceId {
        Some(instance_id) => session_manager::SessionScope::Instance { instance_id },
        None => session_manager::SessionScope::Default,
    });
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        session_manager::scan_sessions_scoped(&db, &providerId, scope, forceRefresh)
    })
    .await
    .map_err(|e| format!("Failed to scan sessions: {e}"))?
}

#[tauri::command]
pub async fn get_session_messages(
    state: State<'_, crate::store::AppState>,
    providerId: String,
    instanceId: Option<String>,
    sourcePath: String,
) -> Result<Vec<session_manager::SessionMessage>, String> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        session_manager::load_messages_scoped(&db, &providerId, instanceId.as_deref(), &sourcePath)
    })
    .await
    .map_err(|e| format!("Failed to load session messages: {e}"))?
}

#[tauri::command]
pub async fn get_session_message_page(
    state: State<'_, crate::store::AppState>,
    providerId: String,
    instanceId: Option<String>,
    sourcePath: String,
    cursor: Option<String>,
) -> Result<session_manager::SessionMessagePage, String> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        session_manager::load_message_page_scoped(
            &db,
            &providerId,
            instanceId.as_deref(),
            &sourcePath,
            cursor.as_deref(),
        )
    })
    .await
    .map_err(|error| format!("Failed to load session message page: {error}"))?
}

#[tauri::command]
pub async fn get_session_message_content(
    state: State<'_, crate::store::AppState>,
    providerId: String,
    instanceId: Option<String>,
    sourcePath: String,
    contentCursor: String,
) -> Result<String, String> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        session_manager::load_message_content_scoped(
            &db,
            &providerId,
            instanceId.as_deref(),
            &sourcePath,
            &contentCursor,
        )
    })
    .await
    .map_err(|error| format!("Failed to load session message content: {error}"))?
}

/// 在用户选定的终端里恢复一个会话。
///
/// # 安全边界：`command` 是刻意不加校验的
///
/// 本命令接受 renderer 传来的任意字符串并最终交给 shell。多份外部审计把这一点
/// 报成"IPC 任意命令执行"，这里明确记录为**已知并接受的风险**，而不是待修缺陷。
///
/// 依据是本应用把 renderer 当作可信边界。支撑这一判断的是以下事实，全部逐条
/// 核实过（2026-07）：
///
/// 1. 全库仅一处 `dangerouslySetInnerHTML`（`ProviderIcon.tsx`），其入参是图标
///    **名字**，经 `hasIcon()` 把关后从手工维护的构建期注册表取 SVG——用户与
///    深链接都只能给名字，给不了标记内容
/// 2. 前端无 `eval` / `new Function`
/// 3. `tauri.conf.json` 的 `frontendDist` 指向打包产物，webview 不加载任何远程
///    源；界面里也没有 `<iframe>` / `<webview>`
/// 4. CSP 为 `script-src 'self'`——既不允许内联脚本，也不允许外部脚本
///
/// 因此"攻击者能调用本 IPC"这一前提，成立时已意味着他能以当前用户身份执行代码；
/// 那种情况下绕道本命令并不会让他多拿到任何东西。
///
/// # 什么会推翻这个结论
///
/// 上面四条任意一条不再成立，本命令就必须改成**只接收 session / provider 标识、
/// 由后端从会话记录重建命令**。具体触发条件：
///
/// - 渲染任何来自网络或配置文件的富文本 / HTML / SVG 内容
/// - 引入 `<iframe>`、`<webview>`，或让 webview 导航到远程 origin
/// - 放宽 CSP 的 `script-src`（例如为了加载第三方脚本或统计 SDK）
/// - 引入任何在 renderer 内执行外部代码的机制
///
/// 相比之下 `cwd` 的处理**不属于**这条豁免：它是磁盘上扫来的项目路径，正常使用
/// 就可能含 `$(...)`，与 renderer 是否可信无关，因此在
/// `session_manager::terminal::shell_escape` 里做了完整的单引号转义。
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn launch_session_terminal(
    state: State<'_, crate::store::AppState>,
    command: String,
    cwd: Option<String>,
    custom_config: Option<String>,
    providerId: Option<String>,
    instanceId: Option<String>,
    sessionId: Option<String>,
    sourcePath: Option<String>,
) -> Result<bool, String> {
    if let (Some(provider_id), Some(instance_id)) = (providerId.as_deref(), instanceId) {
        let session_id = sessionId.ok_or_else(|| "恢复运行环境会话需要 sessionId".to_string())?;
        let source_path =
            sourcePath.ok_or_else(|| "恢复运行环境会话需要 sourcePath".to_string())?;
        let db = state.db.clone();
        let provider_id = provider_id.to_string();
        tauri::async_runtime::spawn_blocking(move || {
            crate::commands::misc::launch_instance_session(
                &db,
                &provider_id,
                &instance_id,
                &session_id,
                &source_path,
                cwd.as_deref().map(std::path::Path::new),
            )
        })
        .await
        .map_err(|e| format!("Failed to launch instance session: {e}"))??;
        return Ok(true);
    }
    let command = command.clone();
    let cwd = cwd.clone();
    let custom_config = custom_config.clone();

    // Read preferred terminal from global settings
    let preferred = crate::settings::get_preferred_terminal();
    // Map global setting terminal names to session terminal names
    // Global uses "iterm2", session terminal uses "iterm"
    let target = match preferred.as_deref() {
        Some("iterm2") => "iterm".to_string(),
        Some(t) => t.to_string(),
        None => "terminal".to_string(), // Default to Terminal.app on macOS
    };

    tauri::async_runtime::spawn_blocking(move || {
        session_manager::terminal::launch_terminal(
            &target,
            &command,
            cwd.as_deref(),
            custom_config.as_deref(),
        )
    })
    .await
    .map_err(|e| format!("Failed to launch terminal: {e}"))??;

    Ok(true)
}

#[tauri::command]
pub async fn delete_session(
    state: State<'_, crate::store::AppState>,
    providerId: String,
    instanceId: Option<String>,
    sessionId: String,
    sourcePath: String,
) -> Result<bool, String> {
    let provider_id = providerId.clone();
    let session_id = sessionId.clone();
    let source_path = sourcePath.clone();

    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        session_manager::delete_session_scoped(
            &db,
            &provider_id,
            instanceId.as_deref(),
            &session_id,
            &source_path,
        )
    })
    .await
    .map_err(|e| format!("Failed to delete session: {e}"))?
}

#[tauri::command]
pub async fn delete_sessions(
    state: State<'_, crate::store::AppState>,
    items: Vec<session_manager::DeleteSessionRequest>,
) -> Result<Vec<session_manager::DeleteSessionOutcome>, String> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        session_manager::delete_sessions_scoped(&db, &items)
    })
    .await
    .map_err(|e| format!("Failed to delete sessions: {e}"))
}
