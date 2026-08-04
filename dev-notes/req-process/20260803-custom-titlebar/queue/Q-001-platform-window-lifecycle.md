# Q-001 Platform Window Lifecycle

State: done

Depends on: none

Evidence: `../evidence/RQ-001-tauri-window-contract.md`

## Goal

Establish one platform-aware window-host contract that can safely support custom Windows/Linux chrome and macOS overlay chrome across every render and recreation path.

## Contract

- Windows uses custom controls with native decorations disabled before first show.
- macOS keeps decorations, Overlay titlebar style, native traffic lights, and native fullscreen behavior.
- Linux uses the new controls only through the existing app-controls preference/fallback boundary; stored choices are preserved, and the default changes only after X11/Wayland safety is demonstrated.
- Normal app, database recovery, and frontend error fallback share an always-available window chrome/control host when native decorations are off.
- Close uses `close()` and reaches the existing Rust `CloseRequested` owner exactly once.
- Mount, own actions, resize, and focus regain reconcile maximized/fullscreen state; async listeners are race-safe and cleaned up.
- First show and lightweight recreation decide decoration mode before display.
- Tray, single-instance, deep-link, Dock reopen, saved window state, Windows taskbar restoration, macOS activation policy, and Linux nudge behavior remain unchanged.

## Targets

- Platform window configuration and allowed commands.
- Shared frontend window host and event/state adapter.
- Startup, close, wake, and lightweight recreation lifecycle.
- Browser preview and focused lifecycle/decorations tests.

## Constraints

- Target the locked Tauri 2.10.3 behavior; do not use 2.11-only deep drag semantics.
- Do not disable macOS decorations or call `destroy()` from UI controls.
- Do not unconditionally re-enable Linux raw drag regions.
- Do not redesign tray policy, routes, sidebar, page headers, themes, or business behavior.

## Verification

- Automated platform matrix verifies decoration/control-host selection for normal, recovery, and error rendering.
- Tests verify close delegation, maximize/fullscreen reconciliation, one listener per event, cleanup including registration races, and browser-preview mocks.
- Lifecycle tests verify first show/recreate mode and preserve existing close, restore, and saved-window-state behavior.
- A Linux smoke check confirms the native fallback remains selectable before Q-002 proceeds to full visual verification.
