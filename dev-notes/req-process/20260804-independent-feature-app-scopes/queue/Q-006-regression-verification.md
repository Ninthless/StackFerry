# Q-006 Cross-Feature Regression Verification

State: done

## Goal

Verify isolation end to end and remove obsolete shared feature state only after every consumer is migrated.

## Contract

- Remove remaining `sharedFeatureApp` feature-page coupling and route-derived support gates.
- Exercise route application switching and provider-card switching against all independent page states.
- Preserve provider-only route switcher, route-specific utilities, and existing Pi/MCP work.

## Targets

- Application integration tests, affected component suites, typecheck/lint, and targeted Rust suites.

## Constraints

- Tests use isolated/mock data and do not read or write production user configuration.
- Do not broaden into unrelated UI or backend refactors.

## Verification

- Set distinct Prompt, Skills, Session, and MCP states; switch route applications/providers; assert every independent state is unchanged.
- Run affected frontend suites, typecheck/lint, and targeted MCP/provider Rust tests.
- Review the final diff against the dirty-worktree baseline to confirm no unrelated reversions.
