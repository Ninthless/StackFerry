# RQ-001 Tauri Window Contract

Date: 2026-08-03

Scope: official Tauri facts needed to define StackFerry's cross-platform titlebar behavior. Project versions are `@tauri-apps/api 2.8.0`, Rust `tauri 2.10.3`, and `tauri-runtime-wry 2.10.1`.

## Research Questions

- RQ-1: Which window commands preserve close interception?
- RQ-2: What drag and double-click behavior is platform-specific in Tauri 2.10.3?
- RQ-3: Which events can keep maximize/fullscreen UI state aligned?
- RQ-4: How do decorations, Overlay titlebar style, and traffic lights differ by platform?
- RQ-5: What listener and inactive-window constraints affect acceptance criteria?

## Evidence

1. The Window API exposes minimize, toggle-maximize, close, destroy, state queries, and event subscriptions. `close()` emits the interceptable close request; `destroy()` bypasses it. Every `on*` registration returns an unlisten function that must be called when its handler is no longer needed.
2. The custom-titlebar guide states that `data-tauri-drag-region` applies only to the directly hit element so controls remain interactive. Tauri 2.10.3's official drag script performs Windows/Linux drag and double-click handling on mousedown, while macOS toggles on mouseup only when movement has not cancelled the gesture. The `deep` attribute behavior arrived in 2.11 and is unavailable here.
3. Tauri 2.10.3 window events include resize, move, close, destroy, focus, scale-factor, drag/drop, and theme changes, but no dedicated maximize/unmaximize/fullscreen event. Therefore state UI needs initial/action/resize/focus reconciliation plus real OS-entry testing. Linux does not support the theme-changed event.
4. `titleBarStyle` is a macOS titlebar setting. Native traffic-light positioning requires Overlay with decorations enabled. The official guide warns that fully custom macOS chrome loses native capabilities; whole-window transparency is unrelated and may require private APIs that block App Store acceptance.
5. Tauri documents an inactive macOS drag-region limitation. Enabling whole-window `acceptFirstMouse` would also change first-click behavior for every webview control, so this requirement does not silently enable it.

## Project Impact

- Windows/Linux custom controls use existing minimize, toggle-maximize, is-maximized, close, start-dragging, and decorations capabilities. Separate maximize/unmaximize commands would require additional capabilities and are unnecessary.
- Custom close must continue through Rust `CloseRequested` to preserve tray, exit, cleanup, and recovery behavior.
- macOS retains native traffic lights; Windows/Linux decoration choice belongs in platform configuration/startup rather than relying on `titleBarStyle`.
- Drag attributes must be explicit and must not cover interactive descendants. The repository-specific Linux Wayland safety gate remains authoritative over the general guide.
- Event subscriptions require deterministic cleanup, including unmount before the async registration resolves.

## Sources

- Tauri Window JavaScript API: https://v2.tauri.app/reference/javascript/api/namespacewindow/
- Tauri window customization guide: https://v2.tauri.app/learn/window-customization/
- Tauri 2.10.3 drag script: https://github.com/tauri-apps/tauri/blob/tauri-v2.10.3/crates/tauri/src/window/scripts/drag.js
- Tauri 2.10.3 WindowEvent source: https://github.com/tauri-apps/tauri/blob/tauri-v2.10.3/crates/tauri/src/app.rs#L108-L154
- Tauri WindowConfig reference: https://v2.tauri.app/reference/config/#windowconfig
- Tauri titleBarStyle reference: https://v2.tauri.app/reference/config/#titlebarstyle
- Tauri platform configuration files: https://v2.tauri.app/develop/configuration-files/
- Tauri 2.11 release notes: https://v2.tauri.app/release/tauri/v2.11.0/
- Tauri macOS custom-titlebar limitations: https://github.com/tauri-apps/tauri/issues/2663
- Tauri inactive macOS drag-region issue: https://github.com/tauri-apps/tauri/issues/4316
