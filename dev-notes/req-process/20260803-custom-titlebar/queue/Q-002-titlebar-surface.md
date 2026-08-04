# Q-002 Titlebar Surface

State: done

Depends on: `Q-001-platform-window-lifecycle.md`

## Goal

Deliver the compact StackFerry titlebar and its visible interactions on the verified shared lifecycle contract.

## Contract

- Reuse existing semantic tokens, Lucide icons, compact icon buttons, feedback, and four-locale i18n.
- Windows/Linux show a stable 32px band with right-aligned minimize, maximize/restore, and close controls; macOS shows the same material family while reserving native traffic-light space and avoiding duplicate controls.
- Only explicit blank/title/brand targets drag; every interactive target and descendant is no-drag.
- Double-click uses platform-correct Tauri behavior. Control actions call minimize, toggle-maximize, and close; the maximize/restore icon follows queried state.
- Buttons have localized accessible names, familiar tooltips, keyboard focus, stable hit areas, and destructive close hover.
- The bar and full-screen content negotiate one top boundary; neither may cover the other.

## Targets

- Shared titlebar component and app-shell placement.
- Theme, spacing, layering, responsive/DPI, focus, hover, and inactive states.
- Localized accessible labels and action error feedback.
- Drag/no-drag targets and window action wiring.

## Constraints

- Preserve the 232px sidebar, 72px page headers, routes, content hierarchy, brand, and supported themes.
- No application command menus, new design packages, whole-window transparency, private macOS APIs, or custom traffic lights.
- Do not use CSS/system drag regions over controls or rely on inherited/deep drag behavior.

## Verification

- Component tests cover platform render variants, button calls/failures, labels/tooltips, state icons, focus, and drag/no-drag targets.
- Visual inspection covers 900x600, common desktop size, 100%-200% scale, light/dark/system, and all locales.
- Normal, full-screen panel, recovery, and error states retain visible, non-overlapping controls or the approved native fallback.
