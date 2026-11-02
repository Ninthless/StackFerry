# A2Agent compatibility

[A2Agent](https://a2agent.me/) is an API gateway. StackFerry includes these presets; users supply their own API key and choose a model available to that key.

| StackFerry client | Base URL | Protocol / authentication |
| --- | --- | --- |
| Claude | `https://api.a2agent.me` | Messages, bearer (`ANTHROPIC_AUTH_TOKEN`) |
| Codex | `https://api.a2agent.me/v1` | Responses, bearer |
| Grok | `https://api.a2agent.me/v1` | Responses, bearer |
| Pi | `https://api.a2agent.me/v1` | OpenAI Chat Completions, bearer |

Add a provider, select **A2Agent**, enter your key, fetch models, and select a model before enabling it. No default model is assumed. The Claude preset uses bearer auth; the endpoint also accepted `x-api-key` in the checks below.

## Verification

Checked on 2026-11-02 against StackFerry base commit `f847ce580e235888c7a5df48562ec387beec9d8e` (with the separately proposed Claude pagination fix for the Claude discovery check). A user-supplied test key was loaded from a private local file, without storing it in source, reports, or provider configuration.

| Check | Result |
| --- | --- |
| StackFerry `listClaudeModels`, bearer and `x-api-key` | Both returned 22 model IDs |
| StackFerry `listProviderModels` (Codex) | Returned 22 model IDs |
| StackFerry `listGrokModels` | Returned 22 model IDs |
| StackFerry `listPiModels`, `openai-completions` | Returned 22 model IDs |
| `POST /v1/messages`, bearer and `x-api-key`, `anthropic-version: 2023-06-01` | Both HTTP 200, `message` envelope and expected text |
| `POST /v1/responses`, bearer | HTTP 200, `response` envelope and expected text |
| `POST /v1/chat/completions`, bearer | HTTP 200, `chat.completion` envelope and expected text |

Generation checks used `deepseek-v4-flash` and a short text prompt. Messages used `max_tokens: 2048` with thinking disabled; Responses used `max_output_tokens: 2048`; Chat Completions used `max_tokens: 128` with thinking disabled. Discovery used StackFerry's actual provider functions with typed credentials. The discovered catalog was a single page, so it did not exercise live pagination; deterministic pagination fixtures are covered in the separate fix.

These checks cover model discovery and basic non-streaming protocol requests, not full CLI sessions, streaming, tools, routing/failover, every model, or every key's permissions. The tested key's catalog did not contain Claude or GPT model IDs; protocol support alone does not imply those models are available. Availability can change by account and over time.

This is a compatibility note, not an endorsement. Import, activation, credential storage, and routing behavior are unchanged.
