# Q-009 Titlebar Version Placement

State: done

Depends on: `Q-008-provider-only-app-switcher.md`

## Goal

Remove version content from the sidebar and show the current version immediately to the right of the StackFerry titlebar wordmark without a version icon.

## Contract

- Remove the complete sidebar version row, including its `SlidersHorizontal` icon; leave route activity and Settings/Update behavior unchanged.
- Render `v{appVersion}` immediately after `StackFerry` inside the existing titlebar brand group, with no additional icon, separator, background, or control treatment.
- Preserve the existing runtime version lookup and `APP_VERSION` fallback while moving ownership from the sidebar to the global titlebar.
- Keep the version noninteractive within the pointer-transparent brand group so titlebar dragging and double-click behavior remain available.
- Preserve Windows/Linux left spacing, macOS traffic-light clearance, titlebar height, focus dimming, and window controls.

## Targets

- Global titlebar brand composition, sidebar footer cleanup, version ownership, and focused component coverage.
- Minimum/default window visual layout in supported themes and focus states.

## Constraints

- Preserve the StackFerry app icon/wordmark, route-activity shortcut, Settings/Update interactions, footer frame, themes, locales, and window behavior.
- Preserve the 900x600 minimum, 1200x760 default, saved geometry, routes, and platform-specific titlebar behavior.
- Add no new icon, interaction, status row, asset, or dependency.

## Verification

- Component coverage proves exactly one titlebar version label after `StackFerry`, no sidebar version/icon, noninteractive brand behavior, and retained sidebar actions.
- Focused checks cover runtime version fallback/update ownership without duplicate listeners or labels.
- Visual checks at 900x600 and 1200x760 in light/dark and focused/unfocused states show legible version text with no clipping, overlap, or platform-control collision.
