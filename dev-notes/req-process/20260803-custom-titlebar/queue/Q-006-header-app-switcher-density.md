# Q-006 Header App Switcher And Window Density

State: done

Depends on: `Q-005-shell-aligned-titlebar.md`

## Goal

Clean the left shell by removing redundant identity blocks, move application switching to the page header, and give new/default windows a more comfortable working area.

## Contract

- Remove the sidebar's 72px StackFerry brand block and its Applications label/switcher block; workspace navigation becomes the first sidebar content.
- Place the existing application switcher at the left of the page header with a compact transparent header treatment.
- Provider pages use the switcher as the application identity and do not repeat the active application as a static title.
- Non-provider pages keep their current page title beside the switcher; context and header actions remain visible and reachable.
- Change the main-window default to 1200x760 while retaining the 900x600 minimum and saved window-state behavior.

## Targets

- Sidebar and page-header composition, application-switcher variants, shell integration, and focused component coverage.
- Tauri main-window default geometry and visual samples at default/minimum sizes.

## Constraints

- Preserve navigation labels/order, the 232px sidebar width, routes, application-switch behavior, themes, locales, titlebar controls, and window lifecycle.
- Do not clear or overwrite production or isolated saved geometry merely to enforce the new default.
- Do not introduce a new menu, dependency, mobile layout, or sidebar-collapse behavior.

## Verification

- Component tests prove the sidebar has no brand/application block, header switching still works, provider identity is not duplicated, and non-provider titles remain visible.
- Config and build checks prove 1200x760 defaults with unchanged 900x600 minimums.
- Isolated dev/browser screenshots at 900x600 and 1200x760 in light/dark show a clean sidebar and no header clipping or overlap.
