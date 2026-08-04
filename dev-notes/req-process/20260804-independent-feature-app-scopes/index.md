# Independent Feature Application Scopes

## Spec

- Goal: stop provider-routing application and provider changes from silently changing Prompts, Skills, Sessions, or MCP management state.
- Inputs: current shared app wiring, Skills/MCP matrices, Session filter, Prompt `app_type` storage, and the provider-only switcher decision.
- Constraints: the route application switcher remains visible only on Provider Routing; feature pages may expose their own compact target/filter controls; preserve all existing dirty Pi/MCP work; do not change backend ownership schemas.
- Output: independent page preferences, stable global navigation, preserved MCP projection, and regression coverage.
- Notes: "application" means a client such as Claude, Codex, or Pi. "provider" means an API provider card inside one application.

## Explicit Requirements

- ER-001: switching the Provider Routing application must not change Prompt, Skills, Session, or MCP page state.
- ER-002: switching a provider card must not change those page states.
- ER-003: Skills, Sessions, and MCP retain their per-application ownership models.

## Inferred Requirements

- IR-001: Prompts need an independent selector because records and live files are keyed by application. Confidence: H. Confirm: no.
- IR-002: Skills remain a unified list with per-application toggles; only install, discovery install, ZIP install, and restore need an independent default target. Confidence: H. Confirm: no.
- IR-003: Sessions keep their existing client filter and persist it independently; the route application must not initialize or remount the page. Confidence: H. Confirm: no.
- IR-004: MCP remains a unified per-server matrix and needs no selected application. Provider switching may re-project its unchanged matrix to the target live config. Confidence: H. Confirm: no.
- IR-005: global feature navigation stays available regardless of route application; OpenClaw/Hermes utilities may remain conditional. Confidence: H. Confirm: no.
- IR-006: the provider-only `AppSwitcher` remains; feature selectors are page-local controls. Confidence: H. Confirm: no.

## Scope

### Included

- Restrict routing state to route ownership and remove `sharedFeatureApp` from global feature pages.
- Add persisted Prompt application and Skills default-target preferences.
- Persist the existing Session client filter independently, defaulting to `all`.
- Keep MCP's boolean matrix as source of truth and remove stale route context.
- Make Skills, Prompts, Sessions, and MCP stable global navigation entries; append route-specific OpenClaw/Hermes utilities separately.
- Handle hidden/unsupported stored application values with page-local deterministic fallbacks.
- Add component, integration, persistence, and MCP projection tests.

### Out Of Scope

- Changing provider routing, failover ordering, proxy takeover, profiles, provider forms, or provider storage.
- Changing Prompt, Skill, Session, or MCP backend schemas.
- Adding an application-wide selector to MCP or filtering its unified matrix.
- Making unsupported applications support Skills or MCP.
- Changing explicit profile, import, deep-link, or user toggle operations that intentionally update feature data.

## Existing Change Contract

Affected: application shell state, sidebar composition, Prompt page, Skills page/discovery actions, Session filter lifecycle, MCP page context, and tests.

Must not regress: provider routing switch/add/edit/delete, proxy and failover controls, route-specific OpenClaw/Hermes tools, provider-only header switcher, Prompt live-file writes, Skills per-app toggles, session scanning, Pi MCP adapter status, or same-app MCP live re-projection.

Migration: no database migration. Keep `stackferry-last-app` for Provider Routing only. New page preferences use separate keys; absent/invalid Prompt and Skills preferences fall back to Claude when visible/supported, otherwise the first visible supported application. Sessions default to `all`.

Rollout: land page ownership and navigation changes with tests in dependency order. Existing uncommitted Pi/MCP work is preserved and tested as part of the final integration slice.

## Functional Requirements

- FR-001: route application state is consumed only by provider routing, proxy/failover/profile actions, provider dialogs, and explicitly route-specific utilities.
- FR-002: Prompts display and persist their own supported application selection and use it for every query, mutation, import, and live-file operation.
- FR-003: changing Prompt application closes or resets stale edit state before any save can target the new application.
- FR-004: Skills display a separate default target for install/restore actions while every installed Skill keeps independent per-app enable toggles.
- FR-005: repo discovery, skills.sh discovery, ZIP install, and backup restore all use the Skills target captured for that action, never the route application.
- FR-006: Sessions remove the route-derived prop/remount key, persist their own filter (including `all`), and reconcile selection when filtering hides the selected session.
- FR-007: MCP continues to read/write `server.apps[app]`; its page title/context does not display the route application.
- FR-008: provider switching re-projects MCP only for the switched application without mutating the stored MCP matrix or involving unrelated applications.
- FR-009: global feature navigation does not disappear when Provider Routing is set to Pi, OpenClaw, Hermes, or Claude Desktop; route-specific utilities remain correctly conditional without duplicate entries.
- FR-010: the route application switcher remains exclusive to the Provider Routing page. Page-local Prompt/Skills/Session controls do not call the route switch handler.

## Non-Functional Requirements

- NFR-001: preferences are independently named, validate values, and do not write backend data on load/switch.
- NFR-002: compact selectors fit the current header/panel density at the supported minimum window size and remain keyboard accessible and localized.
- NFR-003: pending mutations cannot write to a different application than the displayed action.
- NFR-004: no unrelated dirty-worktree changes are reverted or reformatted.

## Acceptance Criteria

- AC-001: select Codex on Prompts, Pi as the Skills target, Gemini in Sessions, and any MCP matrix; then switch Provider Routing through Claude/OpenClaw/Pi and back. Every feature selection/matrix remains unchanged.
- AC-002: switch provider cards repeatedly inside an application. Prompt selection, Skills target/toggles, Session filter, and MCP matrix remain unchanged.
- AC-003: Prompt list, add/edit/delete/enable/import, and live-file preview target the Prompt page selection; an open editor cannot save into a newly selected application.
- AC-004: every Skills install/restore entry point targets the Skills preference, while toggling one Skill for one application changes only that matrix cell.
- AC-005: Sessions initially show `all` on a clean profile, remember a user-selected filter across navigation/reload, and are not remounted from route application changes.
- AC-006: MCP management is reachable for every route application, including Pi and OpenClaw, while unsupported clients remain absent from the MCP matrix.
- AC-007: switching a Codex provider preserves enabled MCP entries in live `config.toml`; a broken unrelated client config cannot block that projection; database enable flags remain identical.
- AC-008: OpenClaw/Hermes route-specific utilities still appear only in their intended route context, alongside the stable global feature entries with no duplicate navigation keys.
- AC-009: browser/component/integration tests and targeted Rust MCP/provider tests pass without modifying production user data.

## Decisions

- Term: `routeApp` is the Provider Routing application; it is not a global feature application.
- Decision: preserve the prior provider-only route `AppSwitcher` requirement.
- Decision: Prompts own `promptApp`; Skills own `skillsTargetApp`; Sessions own `sessionProviderFilter`; MCP owns no single current app.
- Decision: unified per-item application matrices remain authoritative for Skills and MCP.
- Decision: application visibility affects only each page's allowed choices/fallback, never another page's stored preference.

## Risks

- P1: state renames could route provider mutations through feature preferences. Mitigation: isolate handlers and assert app arguments.
- P1: stale editors or pending Skills actions could target the wrong client. Mitigation: reset editors and capture targets.
- P1: sidebar changes could hide/duplicate route utilities. Mitigation: separate global and route-specific entries and test all apps.
- P2: invalid stored values or overlapping dirty Pi/MCP changes. Mitigation: validate/fallback locally and patch without wholesale restores.

## Queue

1. [Q-001 Feature scope foundation and navigation](queue/Q-001-feature-scope-navigation.md)
2. [Q-002 Independent Prompt application](queue/Q-002-prompt-app.md)
3. [Q-003 Independent Skills target](queue/Q-003-skills-target.md)
4. [Q-004 Independent Session filter](queue/Q-004-session-filter.md)
5. [Q-005 MCP and shell context invariants](queue/Q-005-mcp-shell-invariants.md)
6. [Q-006 Cross-feature regression verification](queue/Q-006-regression-verification.md)

## Handoff

Artifact path: `dev-notes/req-process/20260804-independent-feature-app-scopes/`

Current: `queue/Q-001-feature-scope-navigation.md`

Next: `queue/Q-002-prompt-app.md`

Blockers: none.
