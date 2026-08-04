# Q-007 Pi Unified MCP

State: done
Blocked by: Q-001

## Goal

Make Pi an effective unified MCP target through a pinned `pi-mcp-adapter` integration while preserving all user-owned Pi package and MCP configuration.

## Contract

- Add backward-compatible `apps.pi` support in backend/frontend unified MCP schemas, migration/import, selectors, navigation, sync, removal, and bulk projection.
- On explicit Pi MCP enablement, add the pinned adapter package to global Pi `settings.json.packages`; detect installed/pending/error state. Do not use a fictitious native MCP field.
- Project StackFerry-selected servers into `<Pi agent dir>/mcp.json` `mcpServers`, preserving root `imports`, `settings`, unknown fields, unmanaged servers, and adapter-specific server fields.
- Support stdio and remote server specs, including args/env/cwd, URL/headers/auth, disabled, lifecycle/timeout, resource/direct-tool options, and include/exclude filters where present.
- Import existing Pi global adapter servers with `apps.pi=true`. A differing same-ID entry is surfaced as a collision and is never silently overwritten.
- Deselect/delete/rollback removes or restores only StackFerry-owned package/config state. Project files and trust remain untouched.
- Detect higher-precedence project overrides when a project context is available and report that the effective runtime differs from global state.

## Targets

- Unified MCP domain/database migration, Pi MCP config module, service/commands, package lifecycle, UI app metadata/panel, import/export/deeplink, translations, and tests.

## Constraints

- Follow [D-001](../decisions/D-001-use-pi-mcp-adapter.md) and [RQ-001](../evidence/RQ-001-pi-mcp-adapter.md).
- Treat `$ENV`, `${ENV}`, `!command`, OAuth, and bearer expressions as opaque values; do not evaluate or log them.
- Serialize concurrent StackFerry/Pi writes and retain original permissions.

## Verification

- Migration defaults Pi off; UI selection persists and syncs.
- Existing package arrays and complex `mcp.json` round-trip unchanged outside managed fields.
- Fresh Pi sessions discover and call one stdio and one HTTP server; deselection restores prior state.
- Missing Node/network/package, malformed/read-only config, same-ID collision, parallel write, custom agent dir, project override, and rollback tests.
