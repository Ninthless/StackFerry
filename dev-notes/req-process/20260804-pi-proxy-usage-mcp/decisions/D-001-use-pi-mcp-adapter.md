# D-001 Use pi-mcp-adapter

Date: 2026-08-04
Status: accepted

## Decision

Use a pinned, compatibility-tested `pi-mcp-adapter` package as Pi's MCP runtime. StackFerry owns adapter enablement and the global Pi config projection boundary, but does not reimplement MCP transports inside this task.

## Why

Pi 0.80.7 has package/extension APIs but no native MCP schema. The adapter already implements the Pi extension lifecycle, standard MCP config discovery, stdio and remote transports, lazy/eager lifecycle, OAuth, status, direct tools, cancellation, and Pi agent-dir overrides. Rebuilding that runtime would expand this request substantially and create a second MCP implementation to maintain.

## Rejected

- Writing `mcpServers` into Pi `settings.json`: invalid against the inspected Pi schema and ineffective.
- Building a StackFerry-owned Pi extension now: feasible, but duplicates a maintained implementation and delays the user-visible integration.
- Importing another host's config only: does not make Pi a managed target and has unclear ownership/conflict behavior.

## Guardrails

- Pin the reviewed adapter version rather than following `latest` silently.
- Preserve all existing Pi package and MCP config fields.
- Do not auto-edit project-local files or bypass Pi project trust.
- Keep projection behind a small module so the runtime can be replaced if compatibility or maintenance changes.
