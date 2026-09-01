use crate::init_status::{InitErrorPayload, SkillsMigrationPayload};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub async fn open_external(app: AppHandle, url: String) -> Result<bool, String> {
    let url = if url.starts_with("http://") || url.starts_with("https://") {
        url
    } else {
        format!("https://{url}")
    };

    app.opener()
        .open_url(&url, None::<String>)
        .map_err(|error| format!("打开链接失败: {error}"))?;

    Ok(true)
}

#[tauri::command]
pub async fn copy_text_to_clipboard(text: String) -> Result<bool, String> {
    tokio::task::spawn_blocking(move || {
        let mut clipboard =
            arboard::Clipboard::new().map_err(|error| format!("访问系统剪贴板失败: {error}"))?;
        clipboard
            .set_text(text)
            .map_err(|error| format!("写入系统剪贴板失败: {error}"))?;
        Ok(true)
    })
    .await
    .map_err(|error| format!("剪贴板任务执行失败: {error}"))?
}

#[tauri::command]
pub async fn check_for_updates(handle: AppHandle) -> Result<bool, String> {
    handle
        .opener()
        .open_url(
            "https://github.com/Ninthless/StackFerry/releases/latest",
            None::<String>,
        )
        .map_err(|error| format!("打开更新页面失败: {error}"))?;

    Ok(true)
}

#[tauri::command]
pub async fn is_portable_mode() -> Result<bool, String> {
    let exe_path =
        std::env::current_exe().map_err(|error| format!("获取可执行路径失败: {error}"))?;
    Ok(exe_path
        .parent()
        .is_some_and(|directory| directory.join("portable.ini").is_file()))
}

#[tauri::command]
pub async fn get_init_error() -> Result<Option<InitErrorPayload>, String> {
    Ok(crate::init_status::get_init_error())
}

#[tauri::command]
pub async fn get_migration_result() -> Result<bool, String> {
    Ok(crate::init_status::take_migration_success())
}

#[tauri::command]
pub async fn get_skills_migration_result() -> Result<Option<SkillsMigrationPayload>, String> {
    Ok(crate::init_status::take_skills_migration_result())
}

/// 设置窗口主题（Windows/macOS 标题栏颜色）
/// theme: "dark" | "light" | "system"
#[tauri::command]
pub async fn set_window_theme(window: tauri::Window, theme: String) -> Result<(), String> {
    use tauri::Theme;

    let tauri_theme = match theme.as_str() {
        "dark" => Some(Theme::Dark),
        "light" => Some(Theme::Light),
        _ => None, // system default
    };

    window.set_theme(tauri_theme).map_err(|e| e.to_string())
}
