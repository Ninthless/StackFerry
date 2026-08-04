# Q-003 Pi Advanced Transport And Failover

State: done
Blocked by: Q-002

## Goal

Complete Pi's cloud/Codex/image transport matrix and make ordered failover and automatic recovery safe for streaming side effects.

## Contract

- Add `openai-codex-responses`, `azure-openai-responses`, `bedrock-converse-stream`, `google-vertex`, and `openrouter-images` with their actual endpoint/auth/event semantics.
- Codex preserves `/codex/responses`, zstd, account/session/client headers, WebSocket streaming, and one pre-output SSE fallback.
- Azure preserves deployment path and API-version query. Bedrock/Vertex use valid upstream credential/signing behavior rather than forwarding a signature bound to the local host.
- Image requests/responses and usage travel through the image-capable route without text-only coercion.
- Pi providers use insertion-ordered channels. Retry/failover is allowed only before the first observable stream event; post-output disconnect returns an error without replay.
- Pi participates in persistent health, half-open probing, automatic recovery, and recovered-channel priority consistently with the corrected shared router.

## Targets

- Advanced routes/transports/auth, image path, forwarder retry gate, provider router/circuit health, and end-to-end fixtures.

## Constraints

- Cloud signing credentials remain secret and are not persisted outside established stores.
- Lower-priority healthy traffic must not permanently prevent recovery policy from probing eligible channels.
- Do not weaken the shared circuit-breaker behavior for other apps.

## Verification

- Codex WS success, pre-output fallback, post-output disconnect, zstd, and required-header fixtures.
- Azure/Bedrock/Vertex auth/path fixtures and OpenRouter image generation fixture.
- Ordered three-channel failover, non-retryable 4xx, retryable 429/5xx, half-open recovery, restart recovery, and no-replay assertions.
