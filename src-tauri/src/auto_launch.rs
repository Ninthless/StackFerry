use crate::error::AppError;
use auto_launch::{AutoLaunch, AutoLaunchBuilder};

#[cfg(debug_assertions)]
fn ensure_system_auto_launch_available() -> Result<(), AppError> {
    Err(AppError::Message(
        "开发模式不会修改系统开机自启，请在已安装的正式版中设置".to_string(),
    ))
}

#[cfg(not(debug_assertions))]
fn ensure_system_auto_launch_available() -> Result<(), AppError> {
    Ok(())
}

#[cfg(target_os = "linux")]
fn format_auto_launch_app_path(path: &std::path::Path) -> String {
    let escaped = path
        .to_string_lossy()
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('`', "\\`")
        .replace('$', "\\$");
    format!("\"{escaped}\"")
}

#[cfg(target_os = "windows")]
fn format_auto_launch_app_path(path: &std::path::Path) -> String {
    format!("\"{}\"", path.to_string_lossy())
}

#[cfg(target_os = "macos")]
fn format_auto_launch_app_path(path: &std::path::Path) -> String {
    path.to_string_lossy().into_owned()
}

/// 获取 macOS 上的 .app bundle 路径
/// 将 `/path/to/StackFerry.app/Contents/MacOS/StackFerry` 转换为 `/path/to/StackFerry.app`
#[cfg(target_os = "macos")]
fn get_macos_app_bundle_path(exe_path: &std::path::Path) -> Option<std::path::PathBuf> {
    let path_str = exe_path.to_string_lossy();
    // 查找 .app/Contents/MacOS/ 模式
    if let Some(app_pos) = path_str.find(".app/Contents/MacOS/") {
        let app_bundle_end = app_pos + 4; // ".app" 的结束位置
        Some(std::path::PathBuf::from(&path_str[..app_bundle_end]))
    } else {
        None
    }
}

/// 初始化 AutoLaunch 实例
fn get_auto_launch() -> Result<AutoLaunch, AppError> {
    let app_name = "StackFerry";
    let exe_path =
        std::env::current_exe().map_err(|e| AppError::Message(format!("无法获取应用路径: {e}")))?;

    // macOS 需要使用 .app bundle 路径，否则 AppleScript login item 会打开终端
    #[cfg(target_os = "macos")]
    let app_path = get_macos_app_bundle_path(&exe_path).unwrap_or(exe_path);

    #[cfg(not(target_os = "macos"))]
    let app_path = exe_path;

    let app_path = format_auto_launch_app_path(&app_path);

    // 使用 AutoLaunchBuilder 消除平台差异
    // macOS: 使用 AppleScript 方式（默认），需要 .app bundle 路径
    // Windows/Linux: 使用注册表/XDG autostart
    let auto_launch = AutoLaunchBuilder::new()
        .set_app_name(app_name)
        .set_app_path(&app_path)
        .build()
        .map_err(|e| AppError::Message(format!("创建 AutoLaunch 失败: {e}")))?;

    Ok(auto_launch)
}

/// 启用开机自启
pub fn enable_auto_launch() -> Result<(), AppError> {
    ensure_system_auto_launch_available()?;
    let auto_launch = get_auto_launch()?;

    #[cfg(target_os = "macos")]
    if auto_launch
        .is_enabled()
        .map_err(|e| AppError::Message(format!("检查开机自启状态失败: {e}")))?
    {
        auto_launch
            .disable()
            .map_err(|e| AppError::Message(format!("刷新开机自启登录项失败: {e}")))?;
    }

    auto_launch
        .enable()
        .map_err(|e| AppError::Message(format!("启用开机自启失败: {e}")))?;
    log::info!("已启用开机自启");
    Ok(())
}

/// 禁用开机自启
pub fn disable_auto_launch() -> Result<(), AppError> {
    ensure_system_auto_launch_available()?;
    let auto_launch = get_auto_launch()?;

    #[cfg(target_os = "windows")]
    match auto_launch.disable() {
        Ok(()) => {}
        Err(auto_launch::Error::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(AppError::Message(format!("禁用开机自启失败: {error}")));
        }
    }

    #[cfg(not(target_os = "windows"))]
    if auto_launch
        .is_enabled()
        .map_err(|e| AppError::Message(format!("检查开机自启状态失败: {e}")))?
    {
        auto_launch
            .disable()
            .map_err(|e| AppError::Message(format!("禁用开机自启失败: {e}")))?;
    }

    log::info!("已禁用开机自启");
    Ok(())
}

/// 检查是否已启用开机自启
pub fn is_auto_launch_enabled() -> Result<bool, AppError> {
    #[cfg(debug_assertions)]
    return Ok(false);

    #[cfg(not(debug_assertions))]
    {
        let auto_launch = get_auto_launch()?;
        auto_launch
            .is_enabled()
            .map_err(|e| AppError::Message(format!("检查开机自启状态失败: {e}")))
    }
}

pub fn reconcile_auto_launch_on_startup(enabled: bool) -> Result<(), AppError> {
    #[cfg(debug_assertions)]
    {
        let _ = enabled;
        Ok(())
    }

    #[cfg(not(debug_assertions))]
    {
        if enabled {
            enable_auto_launch()
        } else {
            disable_auto_launch()
        }
    }
}

#[cfg(test)]
mod tests {
    #[allow(unused_imports)]
    use super::*;

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_auto_launch_path_is_desktop_entry_safe() {
        let path = std::path::Path::new(r#"/opt/Stack Ferry/$bin`name"\app"#);
        assert_eq!(
            format_auto_launch_app_path(path),
            r#""/opt/Stack Ferry/\$bin\`name\"\\app""#
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_auto_launch_path_is_quoted() {
        let path = std::path::Path::new(r"C:\Program Files\StackFerry\StackFerry.exe");
        assert_eq!(
            format_auto_launch_app_path(path),
            r#""C:\Program Files\StackFerry\StackFerry.exe""#
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_auto_launch_bundle_path_is_unquoted() {
        let path = std::path::Path::new("/Applications/Stack Ferry.app");
        assert_eq!(
            format_auto_launch_app_path(path),
            "/Applications/Stack Ferry.app"
        );
    }

    #[cfg(debug_assertions)]
    #[test]
    fn debug_build_does_not_modify_system_auto_launch() {
        assert!(enable_auto_launch().is_err());
        assert!(disable_auto_launch().is_err());
        assert!(!is_auto_launch_enabled().expect("read debug auto-launch status"));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn test_get_macos_app_bundle_path_valid() {
        let exe_path =
            std::path::Path::new("/Applications/StackFerry.app/Contents/MacOS/StackFerry");
        let result = get_macos_app_bundle_path(exe_path);
        assert_eq!(
            result,
            Some(std::path::PathBuf::from("/Applications/StackFerry.app"))
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn test_get_macos_app_bundle_path_with_spaces() {
        let exe_path =
            std::path::Path::new("/Users/test/My Apps/StackFerry.app/Contents/MacOS/StackFerry");
        let result = get_macos_app_bundle_path(exe_path);
        assert_eq!(
            result,
            Some(std::path::PathBuf::from(
                "/Users/test/My Apps/StackFerry.app"
            ))
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn test_get_macos_app_bundle_path_not_in_bundle() {
        let exe_path = std::path::Path::new("/usr/local/bin/stackferry");
        let result = get_macos_app_bundle_path(exe_path);
        assert_eq!(result, None);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn test_get_macos_app_bundle_path_dev_build() {
        // 开发环境下的路径通常不在 .app bundle 内
        let exe_path = std::path::Path::new("/Users/dev/project/target/debug/stackferry");
        let result = get_macos_app_bundle_path(exe_path);
        assert_eq!(result, None);
    }
}
