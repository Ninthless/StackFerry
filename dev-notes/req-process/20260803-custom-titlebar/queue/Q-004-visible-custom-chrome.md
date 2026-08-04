# Q-004 Visible Custom Chrome

State: done

Depends on: `Q-002-titlebar-surface.md`

## Goal

Make the requested custom titlebar visibly replace the Linux/GNOME native titlebar in the task's isolated dev environment and normal default path.

## Contract

- The isolated dev setting enables app window controls without modifying production settings or data.
- Linux new/default presentation uses app controls; an existing explicit user opt-out may retain native decorations as a recovery fallback.
- Decorations are applied before first show and lightweight recreation so the actual window never displays a native/custom double bar.
- Normal, recovery, and error render roots keep a visible custom control path whenever decorations are disabled.

## Targets

- Linux default/fallback policy and its settings boundary.
- Isolated dev configuration and restart behavior.
- First-show/recreation decoration application and platform tests.

## Constraints

- Do not alter `/home/xia` production StackFerry settings, database, or PID.
- Do not remove the Linux native fallback or weaken existing Wayland drag safety.
- Do not change routes, sidebar/page headers, tray close behavior, or proxy state.

## Verification

- The isolated Tauri dev window shows no GNOME titlebar and exactly one custom titlebar after restart.
- Policy tests distinguish Linux default custom controls from explicit native fallback.
- Cold show and lightweight recreation do not flash or duplicate decorations.
