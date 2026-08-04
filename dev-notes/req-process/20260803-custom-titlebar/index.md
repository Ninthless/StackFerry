# StackFerry Custom Titlebar

Classification: existing surface redesign

## Spec

```text
Goal: Replace the visible desktop window chrome with a compact StackFerry titlebar that matches the existing UI while preserving native platform lifecycle behavior.
Inputs: User reference image; current Linux 32px app controls; existing theme tokens, Lucide icons, Tauri 2.10.3 window lifecycle, tray behavior, and platform overrides.
Constraints: Windows, macOS, Linux X11 and Linux Wayland differ; no native File/Edit/Help menu is requested; existing routes, navigation, themes, localization, proxy behavior, and window recovery semantics must remain stable. A Linux native-decoration fallback may exist, but it is not the target or default acceptance state.
Output: A shared titlebar surface, platform-correct controls/events, automated coverage, and a cross-platform verification matrix.
Notes: In this artifact, "custom titlebar" means the top window chrome shown in the reference, not an application command menu.
```

## Design Read

Surface: global desktop chrome for a dense proxy tool. Use existing semantic tokens, Lucide icons, themes, and compact density. The bar is 32px on Windows/Linux; macOS reserves its variable native traffic-light area. Platform-correct behavior outranks pixel equality. This single surface needs no separate design-system artifact.

## Explicit Requirements

- ER-001: Replace the pictured top window frame with a custom titlebar suited to StackFerry's current UI.
- ER-002: Window actions and events must behave correctly on every supported desktop platform.
- ER-003: Remove the redundant sidebar brand block, move application switching into the page header, and enlarge the default window.
- ER-004: Show the StackFerry app icon and wordmark in the empty left side of the custom titlebar.
- ER-005: Show the application switcher only on the provider routing view; there it is the sole visible left header identity and has no mode/status subtitle. Other non-provider views retain their existing page identity except the settings view.
- ER-006: Remove the sidebar version row and show the icon-free version text immediately to the right of `StackFerry` in the titlebar.
- ER-007: Hide the complete page header on the settings view so its tab navigation begins directly below the global titlebar.

## Inferred Requirements

- IR-001: Host the bar above normal, recovery, and error content; these states render outside `App`. Confidence: H. Confirm: no.
- IR-002: Windows/Linux use custom buttons; macOS keeps native traffic lights/fullscreen because fully custom chrome loses native behavior. Confidence: H. Confirm: no.
- IR-003: Close must call `close()` and reach Rust `CloseRequested`; tray, recovery exit, and cleanup depend on it. Confidence: H. Confirm: no.
- IR-004: Reconcile maximized/fullscreen state after mount, own actions, resize, and focus; Tauri 2.10.3 has no dedicated state event. Confidence: H. Confirm: no.
- IR-005: Linux dragging must retain the Wayland workaround and pass X11/Wayland checks; raw regions previously froze interaction. Confidence: H. Confirm: no.
- IR-006: Controls need localized names, keyboard focus, stable hit areas, feedback, and no-drag behavior. Confidence: H. Confirm: no.
- IR-007: Linux normal/default presentation must use the custom titlebar. Native decorations remain an explicit opt-out/recovery fallback, and production user choices are not silently overwritten. Confidence: H. Confirm: no.
- IR-008: The titlebar is the sole visible owner of the `StackFerry` app icon and wordmark; the sidebar and page header must not repeat it or introduce a centered system-style title. Confidence: H. Confirm: no.
- IR-009: On the provider routing view the header application switcher replaces the duplicate static application title; on other non-provider views the switcher is absent and existing view title/context remain, except settings intentionally renders no page header. Confidence: H. Confirm: no.
- IR-010: Enlarging the default window must not override saved user geometry or increase the supported minimum size. Confidence: H. Confirm: no.
- IR-011: The titlebar brand must remain part of the draggable surface without intercepting pointer input; macOS placement must clear native traffic lights. Confidence: H. Confirm: no.
- IR-012: Removing the provider subtitle must not remove routing status from the sidebar route-active dot/activity shortcut or disturb right header actions and application switching behavior. Confidence: H. Confirm: no.
- IR-013: Moving version ownership to the titlebar must preserve runtime version resolution and fallback, keep the brand group noninteractive/draggable, avoid platform controls, and leave sidebar activity plus Settings/Update behavior unchanged. Confidence: H. Confirm: no.
- IR-014: Hiding the settings page header must remove its full 72px surface and border without hiding the global titlebar, settings tabs/content, sidebar Settings state, or headers on other views. Confidence: H. Confirm: no.

## Scope

### In

- Shared themed chrome and platform controls for all render states.
- Drag/double-click, window actions, state reconciliation, listener cleanup, and action errors.
- Decorations fixed before first show/recreation; full-screen content cannot overlap.
- Browser/component/Rust tests plus an actual custom-chrome screenshot from the isolated Linux dev window and later Windows, macOS, X11, and Wayland checks.
- Shell cleanup that removes the sidebar brand/application blocks, exposes the application switcher only on the provider routing header, and changes new/reset windows to 1200x760.
- One compact left-aligned StackFerry icon/wordmark group inside the global titlebar, with platform-safe spacing and no duplicate branding elsewhere.
- Conditional page-header identity that keeps existing titles/context on non-provider views except settings, omits the provider mode/status subtitle, and removes the settings-only page-header surface.
- A single icon-free version label immediately after the StackFerry wordmark in the titlebar, with no remaining sidebar version row.
- Settings tabs/content beginning directly below the global titlebar with no intermediate page header or blank reserved height.

### Out

- Command menus or business actions; route/navigation/proxy/tray/theme redesign.
- Custom macOS traffic lights, whole-window transparency/private APIs, or Dock changes.
- A Tauri upgrade for deep drag, or unverified native Snap/system-menu/touch/pen parity.

### Existing Change Contract

Affected: shell, platform config/capabilities, creation/recreation, theme/i18n/accessibility, preview, and tests.

Must not regress: themes/locales/navigation; sidebar route-active dot/activity shortcut, footer border/padding, version styling, and Settings/Update interactions; right header actions and application switching; close-to-tray and recovery exit; taskbar/Dock activation; tray/single-instance/deep-link wake; Linux nudge; saved geometry/state; silent start, full-screen panels, and lightweight mode.

Migration: no database change. New and isolated dev settings default to app controls; an existing production opt-out remains authoritative. The task-specific isolated dev setting may be changed without touching production data.

Rollout: lifecycle support lands before native decorations are removed. Linux normal startup uses custom chrome while the native fallback remains available until X11 and Wayland pass.

## Functional Requirements

- FR-001: Windows/Linux normal startup shows exactly one 32px custom bar with right-aligned minimize, maximize/restore, and close; macOS shows the themed band with native traffic-light space and no duplicate controls.
- FR-002: The bar is flush with the current shell surface and border. Its left side contains one compact StackFerry icon/wordmark group; it has no centered title, repeated branding, card treatment, or permanently filled/circular button backgrounds.
- FR-003: Only explicit blank/title/brand targets drag. Interactive controls and descendants never drag.
- FR-004: Drag-region double-click follows Tauri platform semantics; macOS keeps mouseup/no-movement behavior.
- FR-005: Buttons call minimize, toggle-maximize, and close, and reuse non-blocking error feedback.
- FR-006: Query state after mount, own action, resize, focus, fullscreen, snap, and restore so the maximize icon stays correct.
- FR-007: Close enters Rust close handling once and preserves tray/exit/recovery/cleanup behavior.
- FR-008: First show and lightweight recreation apply the selected decorations before display, without native/custom double-bar or frameless flash.
- FR-009: Normal, full-screen, recovery, and error states keep non-overlapping controls.
- FR-010: All wake paths still show/focus correctly and retain taskbar/Dock/Linux-nudge behavior.
- FR-011: Async event subscriptions are single-instance and race-safe on cleanup.
- FR-012: The sidebar starts with workspace navigation and contains neither the 72px brand block nor the application selector section. The existing selector appears at the left of the page header with no card-like permanent background.
- FR-013: The application switcher renders only when `currentView === "providers"` and is that view's sole visible left header identity without a repeated static application title. Every non-provider view omits the switcher; non-settings views retain their existing title and context.
- FR-014: New or reset main windows default to 1200x760 while keeping the 900x600 minimum and saved-geometry restoration behavior.
- FR-015: Windows/Linux position the existing app icon and `StackFerry` text at the left of the 32px bar; macOS places the same group after the reserved traffic-light area. The group is visually present but does not intercept drag gestures.
- FR-016: The provider routing header omits the `directMode`/`routingActive` context text without changing routing state; the sidebar route-active dot/activity shortcut, right header actions, and switching behavior remain intact.
- FR-017: The titlebar brand group renders the current `v{version}` immediately after `StackFerry` without a version icon; the sidebar renders no version content and retains its route-activity and Settings/Update interactions.
- FR-018: When `currentView === "settings"`, the shell does not render `PageHeader`; the settings tab navigation becomes the first content row below the global titlebar while the global titlebar and sidebar remain present.

## Non-Functional Requirements

- NFR-001: Keyboard controls have localized labels/tooltips, visible focus, familiar icons, and stable 32px hit areas.
- NFR-002: Target Tauri 2.10.3; do not depend on 2.11 deep drag.
- NFR-003: No overlap/clipping at 900x600, 100%-200% scale, themes, or long translations.
- NFR-004: No duplicate callbacks, stuck drag, lost focus, freeze, or stale state after remount/recreate.
- NFR-005: No whole-window transparency or macOS private APIs.
- NFR-006: The conditional selector or view title/context and the right header actions do not clip or overlap at the supported 900px minimum width or 100%-200% scale.
- NFR-007: The titlebar brand stays legible in light/dark and focused/unfocused states, fits within the fixed bar height, and never overlaps window controls or macOS traffic lights.
- NFR-008: The titlebar version remains legible and noninteractive without clipping, overlap, drag loss, or platform-control collision at 900x600 or 1200x760 in light/dark and focused/unfocused states.
- NFR-009: Removing the settings page header leaves no 72px spacer, duplicate divider, clipped tabs, or route-to-route layout residue at supported sizes and themes.

## Acceptance Criteria

- AC-001: Windows controls, drag, double-click, snap, maximize/restore, resize, and focus regain work and leave correct state/icon.
- AC-002: The isolated Linux dev window visibly replaces the pictured GNOME titlebar with exactly one custom bar. X11 and Wayland interactions must later pass without frozen UI or dead controls; the native fallback remains available until both pass.
- AC-003: macOS shows one unobstructed native traffic-light set through focus, fullscreen, resize, and height differences. First click may focus before drag; no silent whole-window `acceptFirstMouse`.
- AC-004: Buttons, menus, inputs, popovers, and tooltip triggers never drag; only eligible direct targets drag/double-click.
- AC-005: Action, OS gesture/shortcut, snap, traffic light, fullscreen, and restore reconcile real state and icon.
- AC-006: Close-to-tray hides/restores; disabled mode exits through cleanup; recovery exits; each action invokes close handling once.
- AC-007: Cold/silent start, recreate, Dock/tray/single-instance/deep-link restore show a focusable window without chrome flash and preserve saved state.
- AC-008: Full-screen, recovery, and error states never cover controls or leave an immovable frameless window.
- AC-009: At 900x600, 100/125/150/200% scale, all themes/locales have no clipping, overlap, shift, repeated brand, centered system title, or unreadable controls.
- AC-010: Tests cover platform render, IPC/errors, close, state query, drag boundaries, cleanup races, decorations, and preview mocks; manual evidence covers all four platform environments.
- AC-011: The isolated dev window has no sidebar brand/application blocks; switching applications from the page header still changes the active application, and provider pages show only one visible application name.
- AC-012: At 900x600 and 1200x760 in light/dark themes, the provider selector or non-provider title/context, actions, and sidebar navigation remain aligned without clipping or overlap.
- AC-013: The Tauri main-window configuration defaults to 1200x760, retains 900x600 minimums, and does not bypass window-state restoration.
- AC-014: The isolated dev window shows the existing app icon and exactly one visible `StackFerry` wordmark at the titlebar's left edge; the sidebar remains brand-free, the page header remains application-focused, drag still works through the brand area, and macOS has traffic-light clearance.
- AC-015: The provider routing view shows exactly one application switcher, no static application title, and no `directMode`/`routingActive` subtitle; every non-provider view shows no switcher, non-settings views keep their existing title/context, and routing status, right actions, and application switching remain functional.
- AC-016: Exactly one visible version appears immediately after `StackFerry` in the titlebar with no adjacent version icon; no version remains in the sidebar, titlebar dragging and platform clearance remain intact, and sidebar activity plus Settings/Update interactions still work.
- AC-017: Opening Settings shows no page-level `设置` title, description, header border, or reserved header height; the settings tabs sit directly below the global titlebar, and returning to another view restores that view's normal page header.

## Decisions

- Term: "custom titlebar" is the global top window chrome, not a native application command menu.
- Decision: Windows/Linux use custom HTML controls; macOS keeps native traffic lights and system fullscreen behavior.
- Decision: reuse theme/icon/i18n and compact density; add no visual dependency/artifact.
- Decision: preserve the Rust close-request owner and all existing restore/nudge/window-state paths.
- Decision: use version-matched Tauri drag semantics only on verified targets; keep interactive descendants and the Linux safety gate protected.
- Decision: Linux native decorations are fallback only, not a successful custom-titlebar screenshot.
- Decision: the custom titlebar is the sole owner of the compact `StackFerry` icon/wordmark; the sidebar stays clean and the page header owns application identity and switching.
- Decision: use a 1200x760 default window and preserve the existing 900x600 minimum and saved geometry.
- Decision: the application switcher is exclusive to the provider routing view and replaces that view's title/subtitle block; non-provider views retain their existing title/context composition.
- Decision: the global titlebar brand group owns the sole visible version label; the sidebar owns no version content, and no icon or interaction is added to the version.
- Decision: settings is the sole non-provider view without `PageHeader`; its internal tabs provide the page identity and navigation.

## Risks

- P0: Frameless recovery/error states could become immovable; raw Linux drag can restore the Wayland freeze.
- P1: Bypassed close breaks lifecycle; z-order/timing causes overlap or chrome flash; missing state events leave stale icons; custom macOS buttons lose native semantics.
- P2: Drag over controls swallows input; deep drag is version-incompatible; frameless chrome lacks guaranteed native Snap/system-menu/touch parity; missing a11y/mocks/cleanup hides regressions.
- P3: Transparency/private APIs add macOS distribution risk.
- P2: Moving the selector can crowd provider actions at minimum width or hide non-provider page identity if title composition is not conditional.
- P2: A titlebar brand layer can swallow drag input or overlap macOS traffic lights if its pointer and platform offsets are wrong.
- P2: Incorrect conditional header composition can leak the switcher into non-provider views, suppress their identity, or remove the remaining route-status affordances with the provider subtitle.
- P2: Moving version lookup into the global titlebar can duplicate labels, intercept drag input, or crowd macOS traffic lights/window controls if ownership and spacing are not preserved.
- P2: A broad page-header condition could accidentally remove headers from other views or leave settings with stale reserved height after navigation.

## Queue

- `Q-001-platform-window-lifecycle.md`: establish the shared platform/decorations/lifecycle contract.
- `Q-002-titlebar-surface.md`: implement the visible titlebar and interactions on that contract.
- `Q-003-cross-platform-verification.md`: complete automated and real-platform regression verification.
- `Q-004-visible-custom-chrome.md`: make the isolated Linux dev and normal default path visibly use custom chrome while preserving an explicit native fallback.
- `Q-005-shell-aligned-titlebar.md`: remove duplicated/system-style chrome and verify the corrected surface in the actual dev window.
- `Q-006-header-app-switcher-density.md`: remove redundant sidebar identity, relocate application switching into the page header, and enlarge the default window.
- `Q-007-titlebar-brand-placement.md`: place the StackFerry icon/wordmark in the titlebar's left drag surface without restoring sidebar duplication.
- `Q-008-provider-only-app-switcher.md`: restrict application switching to the provider routing header and preserve non-provider titles plus routing-status affordances.
- `Q-009-titlebar-version-placement.md`: remove the sidebar version row and place icon-free version text after the StackFerry titlebar wordmark.
- `Q-010-settings-page-header-removal.md`: hide the page header only on Settings and preserve all other shell identities.

## Handoff

Artifact path: `dev-notes/req-process/20260803-custom-titlebar/`

Current: `queue/Q-003-cross-platform-verification.md`

Next: none

Blockers: Q-003 remains blocked on unavailable Windows, macOS, Linux X11, and safely targetable Wayland interaction sessions.
