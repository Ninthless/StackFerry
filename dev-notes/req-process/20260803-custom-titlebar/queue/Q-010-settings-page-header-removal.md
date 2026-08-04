# Q-010 Settings Page Header Removal

State: done

Depends on: `Q-009-titlebar-version-placement.md`

## Goal

Hide the complete page-header surface only on Settings so its tab navigation begins directly below the global titlebar.

## Contract

- Do not render `PageHeader` when the active view is `settings`; remove its title, description, border, and full reserved height together.
- Keep the global titlebar, StackFerry brand/version, sidebar, selected Settings item, settings tabs, and settings content unchanged.
- Preserve the provider application switcher/header actions and every other non-provider view's normal title/context header.
- Restore the appropriate page header normally after navigating away from Settings.

## Targets

- Shell-level conditional page-header composition and integration coverage for route transitions.
- Settings layout at supported minimum/default sizes and themes.

## Constraints

- Add no settings-specific placeholder, replacement title, spacer, new component API, asset, dependency, or unrelated layout change.
- Preserve existing window titlebar height, settings tab behavior, routes, themes, locales, and sidebar actions.

## Verification

- Integration coverage proves Settings has no page banner/title/description and the provider header is restored after navigating away.
- Visual checks at 900x600 and 1200x760 in light/dark confirm settings tabs begin immediately below the global titlebar with no blank strip, duplicate divider, clipping, or overlap.
