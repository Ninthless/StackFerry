# RQ-002 Pi Upstream Contracts

Checked: 2026-08-04 against Pi commit `c6d8371521fc8357958bb21fd43552c15f46c7f4` (`@earendil-works/pi-coding-agent@0.80.7`).

## Provider And Configuration

- Pi model identity is `provider + modelId`; session resume resolves that pair. Takeover must retain both: [SDK source](/home/xia/AMyCode/Projects/Other/agents/pi/packages/coding-agent/src/core/sdk.ts).
- Provider/model overrides live in `models.json` and support provider/model `baseUrl`, `apiKey`, headers, compatibility settings, API and model overrides: [models documentation](/home/xia/AMyCode/Projects/Other/agents/pi/packages/coding-agent/docs/models.md) and [model config schema](/home/xia/AMyCode/Projects/Other/agents/pi/packages/coding-agent/src/core/model-config.ts).
- Credentials may come from locked `auth.json`, environment variables, literal/env/shell config references, OAuth, ADC, or cloud chains. Routing must not flatten these into one API-key field: [auth storage](/home/xia/AMyCode/Projects/Other/agents/pi/packages/coding-agent/src/core/auth-storage.ts) and [config value resolution](/home/xia/AMyCode/Projects/Other/agents/pi/packages/coding-agent/src/core/resolve-config-value.ts).
- `httpProxy` config sets ordinary HTTP proxy environment behavior; it is not provider base-URL takeover: [HTTP dispatcher](/home/xia/AMyCode/Projects/Other/agents/pi/packages/coding-agent/src/core/http-dispatcher.ts).

## Protocol And Stream

- The current API union contains ten known text APIs and a separate `openrouter-images` image API: [AI types](/home/xia/AMyCode/Projects/Other/agents/pi/packages/ai/src/types.ts).
- Pi streams carry ordered start/delta/end events for text, thinking, and tool calls plus done/error. Final usage may arrive only in terminal provider events and cannot be discarded.
- OpenAI Chat requests force streaming and request usage; Anthropic combines initial and terminal usage; Google subtracts cached content from fresh input. Parsers and pricing must use protocol-specific semantics: [OpenAI Chat](/home/xia/AMyCode/Projects/Other/agents/pi/packages/ai/src/api/openai-completions.ts), [Anthropic](/home/xia/AMyCode/Projects/Other/agents/pi/packages/ai/src/api/anthropic-messages.ts), and [Google](/home/xia/AMyCode/Projects/Other/agents/pi/packages/ai/src/api/google-generative-ai.ts).
- OpenAI Codex uses `/codex/responses`, special headers, possible zstd bodies, and an auto transport that falls back from WebSocket only before output: [Codex Responses implementation](/home/xia/AMyCode/Projects/Other/agents/pi/packages/ai/src/api/openai-codex-responses.ts).

## Session And Usage

- Session files are append-only version-3 JSONL trees. The default session path is below the Pi agent directory; CLI/env/settings can override it: [session manager](/home/xia/AMyCode/Projects/Other/agents/pi/packages/coding-agent/src/core/session-manager.ts).
- Persisted assistant entries include provider, model, API, stop reason, and input/output/cache-read/cache-write/reasoning/total/cost usage: [session format](/home/xia/AMyCode/Projects/Other/agents/pi/packages/coding-agent/docs/session-format.md).
- Pi session totals intentionally include all assistant messages, compacted history, and non-current branches. Current context usage is a different value and can be temporarily unknown after compaction: [agent session](/home/xia/AMyCode/Projects/Other/agents/pi/packages/coding-agent/src/core/agent-session.ts).
- RPC `get_session_stats` is useful for reconciliation, but persistent StackFerry history still requires JSONL incremental import: [RPC documentation](/home/xia/AMyCode/Projects/Other/agents/pi/packages/coding-agent/docs/rpc.md).

## Impact

- Proxy implementation requires protocol-aware Pi routes, not a Pi boolean around the current Codex handler.
- Session importing is needed for usage outside takeover; proxy and session rows need one dedup contract.
- Configuration code must preserve provider/model/API identities and credential sources through takeover and restoration.
