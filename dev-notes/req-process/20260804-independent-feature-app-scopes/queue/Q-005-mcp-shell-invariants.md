# Q-005 MCP And Shell Context Invariants

State: done

## Goal

Remove misleading route context from MCP while preserving its independent application matrix and live projection behavior.

## Contract

- MCP owns no single selected application and receives no route application prop.
- Page title/context is global MCP identity, not the last Provider Routing application.
- Pi remains in the supported MCP matrix; unsupported clients remain absent.
- Provider switching keeps same-app, idempotent MCP re-projection and never changes stored enable flags.

## Targets

- MCP panel/shell context, unified MCP tests, and targeted provider/MCP Rust tests.

## Constraints

- Preserve Pi adapter status and all current uncommitted Pi MCP behavior.
- A malformed unrelated application config must not block target-app projection.

## Verification

- UI tests prove MCP is reachable from every route application and matrix toggles remain independent.
- Rust tests prove Codex live rewrite restores enabled MCP entries and does not mutate database flags.
