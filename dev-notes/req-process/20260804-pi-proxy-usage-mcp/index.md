# Pi Proxy, Usage, and MCP

## Spec

- Goal: make Pi a first-class StackFerry application for proxy takeover, failover, usage statistics, provider quota scripts, and unified MCP management.
- Inputs: user request; StackFerry `65c62fa`; local Pi 0.80.7 at `c6d83715`; `pi-mcp-adapter` contract checked on 2026-08-04.
- Constraints: Pi-only scope; preserve the dirty worktree; preserve user-owned Pi files and unknown fields; Linux, Windows, and macOS behavior must be explicit; no regression to existing applications.
- Output: eight dependency-ordered implementation slices with protocol, data, lifecycle, security, and integration acceptance criteria.

## Evidence

- [RQ-001: Pi MCP adapter](evidence/RQ-001-pi-mcp-adapter.md)
- [RQ-002: Pi upstream contracts](evidence/RQ-002-pi-upstream-contracts.md)
- [D-001: MCP integration choice](decisions/D-001-use-pi-mcp-adapter.md)

## Explicit Requirements

- ER-001: Pi must support the same visible proxy takeover and failover workflow as Codex and the other proxy-capable applications.
- ER-002: Pi must appear in usage statistics, including request token/cost statistics and provider quota UsageScript configuration.
- ER-003: Pi must be selectable and effective in unified MCP management.
- ER-004: implementation must follow the inspected Pi source instead of assuming Pi is only OpenAI Chat Completions compatible.

## Inferred Requirements

- IR-001: takeover is a reversible overlay on Pi configuration. It preserves provider/model IDs, API type, OAuth and credentials, headers, compatibility flags, unknown fields, file permissions, and the configured Pi directories.
- IR-002: protocol identity is carried end to end. Requests must not be coerced into Chat Completions merely because they originate from Pi.
- IR-003: streaming failover may retry only before observable output; after any content/tool/thinking event, replay is forbidden.
- IR-004: usage combines proxy capture with Pi session import and must deduplicate the two sources.
- IR-005: Pi has no native MCP schema. Unified management therefore owns a tested third-party adapter dependency and writes the adapter's Pi-owned global config, never a fictitious `settings.json.mcpServers` field.
- IR-006: all file writes are atomic and lock-aware; a crash, failed sync, or process restart cannot strand an unrecoverable live configuration.

## Scope

### Included

- Pi takeover/recovery, switching, failover ordering, and health recovery.
- All ten Pi `KnownApi` values listed in FR-002 plus `openrouter-images` image generation.
- HTTP, SSE, provider event streams, and Codex WebSocket behavior required by that matrix.
- Proxy usage logs, Pi JSONL session import, pricing/filter/detail UI, and Pi provider UsageScript UI.
- Global unified MCP projection through a pinned, tested `pi-mcp-adapter`; import, collision handling, sync, removal, adapter install state, and Pi application selection.

### Out Of Scope

- Reworking non-Pi behavior except shared compatibility changes required by Pi.
- Editing project-local `.mcp.json`, `.pi/mcp.json`, or project package trust from StackFerry. The adapter may still read those files at runtime.
- Reimplementing an MCP client extension inside StackFerry while the selected adapter remains viable.
- Pi install analytics/telemetry; it is not model usage.
- Guaranteed forwarding of future/custom `Api` strings. Unknown values fail visibly without losing configuration.

## Must Not Regress

- Existing applications' proxy/MCP behavior.
- Pi provider switching, model import/export, session management, Skills, OAuth entries, shell/env credential references, and unknown config fields.
- Existing failover order: first added is tried first; recovered higher-priority channels regain priority without starving recovery probes.
- Existing request-log cost and dedup semantics.

## Functional Requirements

- FR-001: takeover uses a namespaced local endpoint and durable marker/snapshot; enable, disable, switch, restart, and failed paths restore the user-owned state.
- FR-002: routing records `app_type=pi` and supports `openai-completions`, `openai-responses`, `openai-codex-responses`, `azure-openai-responses`, `anthropic-messages`, `bedrock-converse-stream`, `google-generative-ai`, `google-vertex`, `mistral-conversations`, `pi-messages`, and `openrouter-images`.
- FR-003: each API preserves path/query/body/header, tools, thinking/signatures, images, finish/error semantics, and final usage.
- FR-004: Codex Responses preserves `/codex/responses`, required headers, zstd request bodies, and `auto` WebSocket-to-SSE fallback. Fallback is allowed once before output only.
- FR-005: channels keep add order, fail over only on eligible failures, recover circuits automatically, and never replay a partially emitted turn.
- FR-006: proxy statistics record Pi identity, protocol-aware tokens/cache/reasoning, status, duration, source, and cost; all usage views support Pi.
- FR-007: incremental session sync imports every assistant usage entry, including compacted and non-current branches, with deterministic identity and cross-source dedup.
- FR-008: Pi provider forms expose the existing generic UsageScript feature and resolve/test Pi base URL and credentials without exposing secrets.
- FR-009: unified MCP adds `apps.pi`, installs/enables the pinned adapter through global `settings.json.packages`, and projects selected servers to the Pi agent-dir `mcp.json`.
- FR-010: import/projection/removal preserve unmanaged packages, root/server fields, stdio/HTTP/SSE and adapter options; StackFerry never evaluates secret or shell expressions.

## Non-Functional Requirements

- NFR-001: config writes are atomic, serialized, permission-preserving, and recoverable.
- NFR-002: credentials, secrets, bodies, images, and tool payloads never enter ordinary logs.
- NFR-003: buffering is bounded; cancellation propagates; projection and sync are incremental/idempotent.
- NFR-004: unsupported values return actionable errors and retain original data.
- NFR-005: platform path, permission, WebSocket, and process cleanup behavior is tested.

## Acceptance Criteria

- AC-001: takeover round-trip, restart, and failed-write recovery leave an existing provider/model/OAuth configuration semantically identical.
- AC-002: each supported API passes representative streaming/tool/usage fixtures with valid cloud/Codex auth and transport behavior.
- AC-003: Codex pre-output WS failure falls back once; post-output disconnect never resends; zstd and required headers remain unchanged.
- AC-004: thinking/signatures, tools, images, final/partial usage, abort, timeout, malformed stream, empty body, and 401/403/429/5xx terminate cleanly.
- AC-005: three channels follow insertion order; open circuits recover automatically and restored higher-priority channels resume their position.
- AC-006: Pi proxy rows have correct protocol-aware token/cache/cost values and all usage views work.
- AC-007: repeated/append session import is incremental; mixed proxy/session data counts once and tokens reconcile with Pi stats.
- AC-008: a Pi provider can save, test, run, refresh, and remove a UsageScript while secrets remain redacted.
- AC-009: selecting Pi for stdio/HTTP servers installs the adapter, makes both callable in a fresh Pi session, and deselection preserves unmanaged entries.
- AC-010: install/config/collision/concurrent-write/project-override/read-only failures are visible and non-destructive.
- AC-011: Linux, Windows, and macOS cover custom directories, atomic replacement, shutdown/cancellation, and process cleanup; existing CI stays green.

## Migration And Rollout

- Existing unified MCP rows deserialize `pi=false`; no server is silently enabled for Pi.
- Existing Pi files are read before first write; a differing same-ID MCP entry is a conflict.
- Adapter version is pinned in code and changed through explicit compatibility testing.
- Rollback restores the pre-takeover Pi snapshot, stops Pi routing, and removes only the StackFerry-managed adapter/package/config entries.

## Risk

- P0: config/auth loss. Mitigation: no routing rewrite of `auth.json`; atomic snapshot/restore tests.
- P0: replay after partial stream output duplicates tools or side effects. Mitigation: freeze retry eligibility after first observable event.
- P0: protocol coercion corrupts data/auth. Mitigation: protocol fixtures and transparent paths first.
- P0: usage double-counting. Mitigation: deterministic identity plus bounded fingerprint fallback.
- P1: adapter compatibility/supply chain. Mitigation: pin, test, preserve config, and keep the boundary replaceable.
- P1: project MCP overrides global state. Mitigation: surface conflicts without editing projects.
- P1: Windows child processes or Codex WS remain alive after exit. Mitigation: platform lifecycle tests and bounded shutdown.
- P2: future custom Pi API strings are unsupported. Mitigation: preserve them and fail explicitly instead of guessing.

## Queue

1. [Q-001 Pi takeover lifecycle](queue/Q-001-pi-takeover-lifecycle.md)
2. [Q-002 Pi protocol routing](queue/Q-002-pi-protocol-routing.md)
3. [Q-003 Pi advanced transport and failover](queue/Q-003-pi-advanced-transport-failover.md)
4. [Q-004 Pi proxy usage](queue/Q-004-pi-proxy-usage.md)
5. [Q-005 Pi session usage](queue/Q-005-pi-session-usage.md)
6. [Q-006 Pi provider quota scripts](queue/Q-006-pi-provider-usage-script.md)
7. [Q-007 Pi unified MCP](queue/Q-007-pi-unified-mcp.md)
8. [Q-008 Pi integration and rollout](queue/Q-008-pi-integration-rollout.md)
