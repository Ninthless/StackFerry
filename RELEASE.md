# StackFerry v0.1.10

## 简体中文

### 托盘快捷打开

- Windows 用户现在可以左键双击系统托盘图标，直接打开并聚焦 StackFerry 主界面。
- 如果主窗口已最小化或隐藏，双击会恢复并显示窗口。
- 如果应用处于轻量模式，双击会退出轻量模式并重建主窗口。

### 兼容性与回归保护

- 双击行为复用现有“打开主界面”托盘命令，窗口恢复、Linux 聚焦修复和 macOS 激活策略保持一致。
- 原有右键菜单、左键菜单和托盘用量刷新行为保持不变。

> Tauri 当前仅在 Windows 上提供托盘双击事件，因此本次快捷操作仅适用于 Windows。

## English

### Tray Double-Click

- Windows users can now left-double-click the system tray icon to open and focus the StackFerry main window.
- A minimized or hidden main window is restored and shown.
- When lightweight mode is active, double-clicking exits lightweight mode and recreates the main window.

### Compatibility and Regression Coverage

- The double-click path reuses the existing tray command for opening the main window, preserving window restoration, Linux focus handling, and macOS activation behavior.
- Existing context-menu, left-click menu, and tray usage-refresh behavior remains unchanged.

> Tauri currently emits tray double-click events on Windows only, so this shortcut is Windows-specific.
