# Q-002 Pi Protocol Routing

State: done
Blocked by: none

## Goal

Route ordinary Pi HTTP/SSE API families through StackFerry as `app_type=pi` without flattening them into a Codex or Claude client.

## Contract

- Add namespaced Pi routes and request context that retain the source API family and distinguish Pi from shared endpoint shapes.
- Cover `openai-completions`, `openai-responses`, `anthropic-messages`, `google-generative-ai`, `mistral-conversations`, and `pi-messages` first.
- Preserve query strings, model identity, user/Pi attribution headers, compatibility flags, tool choice/schema, thinking/signature data, images, finish reasons, errors, and final usage frames.
- Reuse an existing protocol adapter only when its wire contract matches; otherwise add a Pi-aware transparent/provider adapter.
- Unsupported API values fail before upstream mutation and identify the unsupported value.

## Targets

- Proxy server routes, handler context/session, protocol adapters/forwarder, provider routing metadata, and protocol fixtures.
- Pi provider form/API validation where the current four-value restriction conflicts with upstream.

## Constraints

- No cross-protocol conversion by default.
- Streaming remains bounded and cancellation/backpressure propagates in both directions.
- Never log request/response bodies, images, tool payloads, or authorization values.

## Verification

- For every listed family, run non-stream and stream fixtures with text, thinking where supported, tool call/result, image input, final usage, and query/header preservation.
- Test malformed events, missing terminal event, empty body, abort, timeout, and non-2xx error normalization.
- Confirm existing Claude/Codex/Gemini routes remain behaviorally unchanged.
