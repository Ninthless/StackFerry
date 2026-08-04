# Q-008 Provider-Only App Switcher

State: done

Depends on: `Q-007-titlebar-brand-placement.md`

## Goal

Make application switching exclusive to the provider routing header while restoring the existing title/context identity of every non-provider view.

## Contract

- Render the application switcher only when `currentView === "providers"`.
- On the provider routing view, use the switcher as the sole visible left header identity; do not render a repeated static application title or the `directMode`/`routingActive` context text.
- On every non-provider view, do not render the application switcher; retain that view's existing title and context when provided.
- Preserve the sidebar route-active dot/activity shortcut as the routing-status affordance, all right header actions, and existing application switching behavior.
- Keep the titlebar as the sole owner of the StackFerry app icon/wordmark and do not restore sidebar branding.

## Targets

- Conditional page-header identity/context composition and its focused component/integration coverage.
- Provider routing, settings, prompts, skills, MCP, agents, sessions, workspace, OpenClaw, Hermes, and other existing view states.

## Constraints

- Preserve the 72px page header, 900px minimum width, 1200x760 default geometry, routes, themes, locales, titlebar brand, and window behavior.
- Do not move or redesign the sidebar status indicators, activity shortcut, right header actions, or application switcher behavior.
- Add no new navigation state, status label, asset, or dependency.

## Verification

- Component tests cover provider-only switcher visibility, the missing provider title/subtitle, and retained non-provider title/context.
- Integration coverage confirms application switching, sidebar route status/activity access, and right header actions remain functional.
- At the supported minimum/default sizes and light/dark themes, conditional header content remains aligned without clipping, overlap, or duplicate identity.
