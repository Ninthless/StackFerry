# Q-003 Cross-Platform Verification

State: blocked

Depends on: `Q-002-titlebar-surface.md`

## Goal

Prove the completed titlebar across supported operating systems and all window lifecycle entry points, fixing only defects required by this contract.

## Contract

- Verify Windows, macOS, Linux X11, and Linux Wayland behavior on real desktop sessions.
- Exercise drag, double-click, minimize, maximize/restore, OS snap where available, native fullscreen, resize, scale-monitor transition, focus regain, and close.
- Exercise minimize-to-tray on/off, recovery-mode close, silent start, tray restore, single-instance, deep-link, Dock reopen, and lightweight recreate.
- Confirm no duplicated callbacks, stale icons, double titlebars, startup flash, z-index overlap, frozen webview, or lost input.
- Treat native Snap Layout/system-menu/touch/pen parity as excluded unless separately demonstrated; do not claim it from ordinary mouse testing.

## Targets

- Automated frontend/Rust regression suites and production builds.
- Real-platform interaction and visual matrix.
- Contract-scoped fixes discovered during verification.

## Constraints

- Verification results and logs remain in chat/tool output, not in this artifact.
- Do not remove the Linux native fallback until both X11 and Wayland pass.
- Do not broaden the work into unrelated shell or platform cleanup.

## Verification

- Required automated tests and builds pass with no new warnings attributable to this work.
- Manual matrix covers every platform and lifecycle case named in the contract.
- Screenshots at minimum and common window sizes confirm theme, scale, text fit, focus, hover, traffic-light clearance, and no overlap.
- The current queue advances to done only after the Linux fallback decision is supported by observed X11 and Wayland results.
