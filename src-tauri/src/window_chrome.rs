use tauri::WebviewWindow;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum DesktopPlatform {
    #[cfg(any(test, target_os = "linux"))]
    Linux,
    #[cfg(any(test, target_os = "macos"))]
    Macos,
    #[cfg(any(test, target_os = "windows"))]
    Windows,
}

const fn uses_app_window_controls(platform: DesktopPlatform) -> bool {
    match platform {
        #[cfg(any(test, target_os = "windows"))]
        DesktopPlatform::Windows => true,
        #[cfg(any(test, target_os = "linux"))]
        DesktopPlatform::Linux => true,
        #[cfg(any(test, target_os = "macos"))]
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
    let decorated = !uses_app_window_controls(current_platform());
    window.set_decorations(decorated)
}

#[cfg(test)]
mod tests {
    use super::{uses_app_window_controls, DesktopPlatform};

    #[test]
    fn windows_always_uses_app_controls() {
        assert!(uses_app_window_controls(DesktopPlatform::Windows));
    }

    #[test]
    fn macos_always_uses_native_controls() {
        assert!(!uses_app_window_controls(DesktopPlatform::Macos));
    }

    #[test]
    fn linux_always_uses_app_controls() {
        assert!(uses_app_window_controls(DesktopPlatform::Linux));
    }
}
