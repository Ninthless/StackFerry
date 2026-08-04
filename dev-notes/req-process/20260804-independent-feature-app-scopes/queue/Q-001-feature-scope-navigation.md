# Q-001 Feature Scope Foundation And Navigation

State: done

## Goal

Establish independent feature preference boundaries and make global feature navigation stable without changing provider-routing behavior.

## Contract

- Provider Routing application state remains the sole input to provider list/actions, proxy, failover, profiles, and provider dialogs.
- Introduce validated page-local preference ownership for Prompts, Skills, and Sessions; loading a preference performs no backend write.
- Render Skills, Prompts, Sessions, and MCP as stable global navigation entries.
- Render OpenClaw/Hermes-only utilities as separate conditional entries with no duplicate keys.

## Targets

- Application shell state and storage helpers.
- Sidebar navigation composition and its component tests.

## Constraints

- The route `AppSwitcher` remains visible only on Provider Routing.
- Do not remove or overwrite existing Pi/MCP changes in dirty files.
- This slice must remain buildable before individual feature consumers are migrated.

## Verification

- Component tests cover navigation under Claude, Claude Desktop, Pi, OpenClaw, and Hermes.
- Integration assertions prove route application changes still reach provider queries/actions.
- Typecheck passes with both old consumers and new preference foundations during the transition.
