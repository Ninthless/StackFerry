# Q-008 Pi Integration And Rollout

State: done
Blocked by: Q-003, Q-004, Q-005, Q-006, Q-007

## Goal

Close cross-feature gaps and prove the Pi proxy, usage, and MCP implementation is recoverable and portable before release.

## Contract

- Exercise takeover, provider switch, ordered failover/recovery, usage capture/import, quota script, MCP install/projection, restart, and rollback as one workflow.
- Add versioned migrations/defaults for any database/settings fields; old users start with Pi proxy/MCP disabled and retain all live config.
- Provide observable, localized status/errors for unsupported APIs, adapter install, config collision, recovery, and partial sync without debug-only inspection.
- Ensure Linux, Windows, and macOS path, permission, atomic replacement, WebSocket, process shutdown, and child-process behavior.
- Update CI/build packaging only where required by shipped runtime dependencies and fixtures.

## Targets

- Cross-module integration tests, platform abstractions, migration/rollback, translations, CI, and release notes where the repository convention requires them.

## Constraints

- No opportunistic refactor or unrelated UI redesign.
- Never enable Pi takeover or MCP automatically for an existing installation.
- A failed migration or runtime dependency check must leave prior behavior usable.

## Verification

- Clean-install and upgrade fixtures on all supported platforms.
- End-to-end Pi workflow using local upstream fixtures for every protocol class and representative MCP transports.
- Existing frontend tests, Rust tests/lints, build checks, and platform CI pass.
- Manual smoke confirms exact restore after forced termination during takeover and MCP projection.
