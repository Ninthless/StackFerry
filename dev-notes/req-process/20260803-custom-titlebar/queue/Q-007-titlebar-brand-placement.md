# Q-007 Titlebar Brand Placement

State: done

Depends on: `Q-006-header-app-switcher-density.md`

## Goal

Place the StackFerry app icon and wordmark in the empty left side of the global titlebar while keeping the cleaned sidebar and relocated application switcher intact.

## Contract

- Render the existing app icon followed by `StackFerry` at the left of the custom titlebar as shown by the user's arrow.
- Keep the group compact within the fixed titlebar height, aligned with existing shell tokens, and free of card, pill, or filled background treatment.
- Windows/Linux use the left edge with normal compact padding; macOS shifts the group past the native traffic-light reserve and never draws duplicate controls.
- The brand group is non-interactive and does not prevent dragging or double-click behavior across the titlebar.
- Do not restore the sidebar brand block or add StackFerry branding to the page header; the page header continues to own application switching and page identity.

## Targets

- Global titlebar composition, platform offsets, drag hit testing, focus/theme appearance, and focused component coverage.
- Isolated dev/browser visual evidence at minimum/default window sizes.

## Constraints

- Reuse the existing app icon asset, typography, semantic color tokens, and 28px/32px platform titlebar heights.
- Preserve window controls, titlebar event semantics, sidebar cleanup, application switching, 1200x760 default geometry, routes, themes, and locales.
- Add no new asset, menu, dependency, centered title, or platform-specific custom traffic lights.

## Verification

- Component tests cover one visible brand group, no sidebar/page-header duplication, Windows/Linux left alignment, macOS traffic-light clearance, and unchanged drag/no-drag boundaries.
- Light/dark and focused/unfocused screenshots at 900x600 and 1200x760 show legible branding with no overlap or clipping.
- The isolated Tauri dev accessibility/layout evidence shows exactly one visible StackFerry wordmark in the titlebar and usable window controls.
