import { describe, expect, it } from 'vitest'
import {
  formatToml,
  overlayBaseUrl,
  overlayRequiresApiKey,
  overlaySession,
  parseProviderOverlay,
  starterOverlayToml,
  withOverlayBaseUrl,
  withOverlaySession,
} from '../shared/provider-overlay'
import { expectAppError } from './expect-app-error'

describe('provider overlay', () => {
  it('parses a single custom provider table', () => {
    const overlay = parseProviderOverlay(
      starterOverlayToml({
        providerId: 'openrouter',
        name: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'openai/gpt-5.4',
      }),
    )
    expect(overlay.tableKey).toBe('openrouter')
    expect(overlay.model).toBe('openai/gpt-5.4')
    expect(overlay.table.base_url).toBe('https://openrouter.ai/api/v1')
    expect(overlayRequiresApiKey(starterOverlayToml({
      providerId: 'openrouter',
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'openai/gpt-5.4',
    }))).toBe(true)
  })

  it('does not require an API key when env_key or auth is present', () => {
    expect(
      overlayRequiresApiKey(`
model = "local"
model_provider = "proxy"

[model_providers.proxy]
name = "Proxy"
base_url = "http://127.0.0.1:4000/v1"
env_key = "PROXY_KEY"
`),
    ).toBe(false)

    expect(
      overlayRequiresApiKey(`
model_provider = "cmd"

[model_providers.cmd]
name = "Cmd"
base_url = "http://127.0.0.1:4000/v1"

[model_providers.cmd.auth]
command = "op"
args = ["read", "op://Codex/key"]
`),
    ).toBe(false)
  })

  it('rejects unrelated top-level keys and mismatched provider ids', () => {
    expectAppError(
      () =>
        parseProviderOverlay(`
approval_policy = "never"
model_provider = "custom"

[model_providers.custom]
name = "Custom"
base_url = "https://api.example.com/v1"
`),
      'overlay_unsupported_top_level',
      { key: 'approval_policy' },
    )

    expectAppError(
      () =>
        parseProviderOverlay(`
model_provider = "one"

[model_providers.two]
name = "Two"
base_url = "https://api.example.com/v1"
`),
      'overlay_provider_mismatch',
    )
  })

  it('reads and writes base_url without dropping other overlay fields', () => {
    const starter = starterOverlayToml({
      providerId: 'custom',
      name: 'Custom',
      baseUrl: '',
      model: '',
    })
    expect(overlayBaseUrl(starter)).toBe('')

    const updated = withOverlayBaseUrl(starter, 'https://api.example.com/v1')
    expect(overlayBaseUrl(updated)).toBe('https://api.example.com/v1')
    expect(parseProviderOverlay(updated).table.name).toBe('Custom')
    expect(parseProviderOverlay(updated).table.wire_api).toBe('responses')
  })

  it('formats valid toml and rejects invalid toml', () => {
    const formatted = formatToml(`model_provider="custom"
[model_providers.custom]
name="Custom"
base_url="https://api.example.com/v1"
wire_api="responses"`)

    expect(formatted).toBe(`model_provider = "custom"

[model_providers.custom]
name = "Custom"
base_url = "https://api.example.com/v1"
wire_api = "responses"
`)
    expect(formatToml(formatted)).toBe(formatted)
    expect(formatToml('')).toBe('')
    expectAppError(() => formatToml('model_provider = ['), 'toml_parse_failed')
  })

  it('reads and writes model, reasoning, and context without dropping table fields', () => {
    const starter = starterOverlayToml({
      providerId: 'custom',
      name: 'Custom',
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt-5.4',
    })
    const updated = withOverlaySession(starter, {
      model: 'gpt-5.5',
      reasoningEffort: 'high',
      contextWindow: '1000000',
      autoCompact: '900000',
    })
    expect(overlaySession(updated)).toEqual({
      model: 'gpt-5.5',
      reasoningEffort: 'high',
      contextWindow: '1000000',
      autoCompact: '900000',
    })
    expect(parseProviderOverlay(updated).table.wire_api).toBe('responses')
    expect(overlayBaseUrl(updated)).toBe('https://api.example.com/v1')

    const cleared = withOverlaySession(updated, {
      reasoningEffort: '',
      contextWindow: '',
      autoCompact: '',
    })
    expect(overlaySession(cleared).reasoningEffort).toBe('')
    expect(cleared).not.toContain('model_reasoning_effort')
    expect(cleared).not.toContain('model_context_window')
  })

  it('accepts max and ultra reasoning effort', () => {
    const starter = starterOverlayToml({
      providerId: 'custom',
      name: 'Custom',
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt-6-astra',
    })
    const updated = withOverlaySession(starter, { reasoningEffort: 'ultra' })
    expect(overlaySession(updated).reasoningEffort).toBe('ultra')
    expect(parseProviderOverlay(updated).reasoningEffort).toBe('ultra')
    expect(
      parseProviderOverlay(withOverlaySession(starter, { reasoningEffort: 'max' }))
        .reasoningEffort,
    ).toBe('max')
  })

  it('rejects unknown reasoning effort and amazon-bedrock as a custom id', () => {
    expectAppError(
      () =>
        parseProviderOverlay(`
model_provider = "custom"
model_reasoning_effort = "ludicrous"

[model_providers.custom]
name = "Custom"
base_url = "https://api.example.com/v1"
`),
      'overlay_invalid_reasoning',
    )

    expectAppError(
      () =>
        parseProviderOverlay(`
model_provider = "amazon-bedrock"

[model_providers.amazon-bedrock]
name = "Bedrock"
base_url = "https://bedrock.example/v1"
`),
      'overlay_reserved_provider_id',
      { name: 'amazon-bedrock' },
    )
  })
})
