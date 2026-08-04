# Q-005 Shell-Aligned Titlebar

State: done

Depends on: `Q-004-visible-custom-chrome.md`

## Goal

Correct the visible titlebar so it belongs to StackFerry's existing shell instead of resembling an added generic/system header.

## Contract

- Keep one 32px full-width band aligned with the existing shell surface and bottom border.
- The sidebar remains the sole owner of the `StackFerry` brand; the titlebar has no centered title or repeated brand text/icon.
- Window buttons use stable rectangular hit areas with transparent rest states, subtle shell hover, and destructive close hover; no circular or permanently filled backgrounds.
- Minimize, maximize, restore, and close use familiar distinct Lucide glyphs. Restore must read as overlapping windows rather than diagonal fullscreen arrows.
- Only the blank band drags; buttons and every interactive descendant remain no-drag.
- macOS keeps native traffic lights and their reserved area without drawing duplicate controls.

## Targets

- Titlebar composition, icons, states, drag surface, and shell alignment.
- Platform render tests, accessibility names/tooltips, and actual dev screenshots.

## Constraints

- Preserve 232px sidebar, 72px page headers, content hierarchy, themes, locales, and full-screen offset.
- Add no command menu, visual dependency, custom macOS traffic lights, or whole-window transparency.

## Verification

- Actual isolated Tauri screenshot shows one custom bar, no GNOME bar, no repeated `StackFerry`, and no centered system title.
- 900x600 and common desktop screenshots in light/dark at 100%-200% show no overlap, clipping, or double chrome.
- Component tests cover transparent/rest hover classes, distinct maximize/restore icons, drag boundaries, actions, failures, focus, and platform variants.
