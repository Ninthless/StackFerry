use tauri::WebviewWindow;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum DesktopPlatform {
    Linux,
    Macos,
    Windows,
}

const fn uses_app_window_controls(platform: DesktopPlatform, linux_preference: bool) -> bool {
    match platform {
        DesktopPlatform::Windows => true,
        DesktopPlatform::Linux => linux_preference,
        DesktopPlatform::Macos => false,
    }
}

const fn current_platform() -> DesktopPlatform {
    #[cfg(target_os = "windows")]
    return DesktopPlatform::Windows;

    #[cfg(target_os = "macos")]
    return DesktopPlatform::Macos;

    #[cfg(target_os = "linux")]
    return DesktopPlatform::Linux;
}

pub(crate) fn apply_window_decorations(window: &WebviewWindow) -> Result<(), tauri::Error> {
    let settings = crate::settings::get_settings();
    let decorated = !uses_app_window_controls(current_platform(), settings.use_app_window_controls);
    window.set_decorations(decorated)
}

#[cfg(test)]
mod tests {
    use super::{uses_app_window_controls, DesktopPlatform};

    #[test]
    fn windows_always_uses_app_controls() {
        assert!(uses_app_window_controls(DesktopPlatform::Windows, false));
        assert!(uses_app_window_controls(DesktopPlatform::Windows, true));
    }

    #[test]
    fn macos_always_uses_native_controls() {
        assert!(!uses_app_window_controls(DesktopPlatform::Macos, false));
        assert!(!uses_app_window_controls(DesktopPlatform::Macos, true));
    }

    #[test]
    fn linux_preserves_the_user_preference() {
        assert!(!uses_app_window_controls(DesktopPlatform::Linux, false));
        assert!(uses_app_window_controls(DesktopPlatform::Linux, true));
    }
}
