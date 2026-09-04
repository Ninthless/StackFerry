import { describe, expect, it } from 'vitest'
import {
  applyOfficialProvider,
  applyThirdPartyProvider,
  parseToml,
  providerKey,
  stringifyToml,
} from '../electron/main/codex/merge'
import { starterOverlayToml } from '../shared/provider-overlay'

const existing = parseToml(`
approval_policy = "on-request"
model = "gpt-5"
notify = ["notify-send"]
sandbox_mode = "workspace-write"

[mcp_servers.docs]
command = "docs-mcp"
`)

function overlayFor(input: {
  providerId: string
  name: string
  baseUrl: string
  model: string
  extra?: string
}): string {
  const base = starterOverlayToml({
    providerId: input.providerId,
    name: input.name,
    baseUrl: input.baseUrl,
    model: input.model,
  })
  return input.extra ? `${base}${input.extra}` : base
}

describe('codex toml merge', () => {
  it('writes a third-party overlay without dropping unrelated keys', () => {
    const next = applyThirdPartyProvider(existing, {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'DeepSeek',
      tomlText: overlayFor({
        providerId: 'deepseek',
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
      }),
      apiKey: 'sk-test',
    })
    const key = providerKey('11111111-1111-1111-1111-111111111111')
    expect(next.approval_policy).toBe('on-request')
    expect(next.notify).toEqual(['notify-send'])
    expect(next.sandbox_mode).toBe('workspace-write')
    expect(next.model_provider).toBe(key)
    expect(next.model).toBe('deepseek-chat')
    const servers = next.mcp_servers as Record<string, Record<string, string>>
    expect(servers.docs.command).toBe('docs-mcp')
    const providers = next.model_providers as Record<string, Record<string, string>>
    expect(providers[key]).toEqual({
      name: 'DeepSeek',
      base_url: 'https://api.deepseek.com/v1',
      wire_api: 'responses',
      experimental_bearer_token: 'sk-test',
    })
    expect(providers.deepseek).toBeUndefined()
  })

  it('keeps extra provider fields and skips bearer injection when env_key is set', () => {
    const next = applyThirdPartyProvider(existing, {
      id: 'aaaa',
      name: 'Azure',
      tomlText: overlayFor({
        providerId: 'azure',
        name: 'Azure OpenAI',
        baseUrl: 'https://example.openai.azure.com/openai',
        model: 'gpt-5.4',
        extra: 'query_params = { api-version = "preview" }\nenv_key = "AZURE_OPENAI_API_KEY"\n',
      }),
      apiKey: 'should-not-write',
    })
    const key = providerKey('aaaa')
    const providers = next.model_providers as Record<string, Record<string, unknown>>
    expect(providers[key]).toMatchObject({
      name: 'Azure OpenAI',
      env_key: 'AZURE_OPENAI_API_KEY',
      query_params: { 'api-version': 'preview' },
    })
    expect(providers[key].experimental_bearer_token).toBeUndefined()
  })

  it('replaces the previous StackFerry provider when switching', () => {
    const first = applyThirdPartyProvider(existing, {
      id: 'aaaa',
      name: 'A',
      tomlText: overlayFor({
        providerId: 'provider_a',
        name: 'A',
        baseUrl: 'https://a.example/v1',
        model: 'model-a',
      }),
      apiKey: 'key-a',
    })
    const second = applyThirdPartyProvider(first, {
      id: 'bbbb',
      name: 'B',
      tomlText: overlayFor({
        providerId: 'provider_b',
        name: 'B',
        baseUrl: 'https://b.example/v1',
        model: 'model-b',
      }),
      apiKey: 'key-b',
    })
    const providers = second.model_providers as Record<string, unknown>
    expect(Object.keys(providers)).toEqual([providerKey('bbbb')])
    expect(second.model_provider).toBe(providerKey('bbbb'))
    expect(stringifyToml(second)).toContain('experimental_bearer_token = "key-b"')
    expect(stringifyToml(second)).not.toContain('key-a')
  })

  it('restores the official openai provider and strips injected tokens', () => {
    const thirdParty = applyThirdPartyProvider(existing, {
      id: 'cccc',
      name: 'C',
      tomlText: overlayFor({
        providerId: 'provider_c',
        name: 'C',
        baseUrl: 'https://c.example/v1',
        model: 'model-c',
      }),
      apiKey: 'key-c',
    })
    const official = applyOfficialProvider(thirdParty)
    expect(official.model_provider).toBe('openai')
    expect(official.approval_policy).toBe('on-request')
    expect(official.mcp_servers).toEqual({ docs: { command: 'docs-mcp' } })
    expect(official.model_providers).toBeUndefined()
    expect(stringifyToml(official)).not.toContain('experimental_bearer_token')
  })

  it('writes reasoning and context from the overlay and clears them when omitted', () => {
    const withSession = applyThirdPartyProvider(existing, {
      id: 'dddd',
      name: 'D',
      tomlText: `model_reasoning_effort = "high"
model_context_window = 1000000
model_auto_compact_token_limit = 900000
${overlayFor({
        providerId: 'provider_d',
        name: 'D',
        baseUrl: 'https://d.example/v1',
        model: 'model-d',
      })}`,
      apiKey: 'key-d',
    })
    expect(withSession.model).toBe('model-d')
    expect(withSession.model_reasoning_effort).toBe('high')
    expect(withSession.model_context_window).toBe(1000000)
    expect(withSession.model_auto_compact_token_limit).toBe(900000)

    const withoutSession = applyThirdPartyProvider(withSession, {
      id: 'eeee',
      name: 'E',
      tomlText: overlayFor({
        providerId: 'provider_e',
        name: 'E',
        baseUrl: 'https://e.example/v1',
        model: 'model-e',
      }),
      apiKey: 'key-e',
    })
    expect(withoutSession.model).toBe('model-e')
    expect(withoutSession.model_reasoning_effort).toBeUndefined()
    expect(withoutSession.model_context_window).toBeUndefined()
    expect(withoutSession.model_auto_compact_token_limit).toBeUndefined()
  })

  it('rejects chat wire_api and reserved provider ids', () => {
    expect(() =>
      applyThirdPartyProvider(existing, {
        id: 'bad-wire',
        name: 'Bad',
        tomlText: `model = "x"
model_provider = "bad"

[model_providers.bad]
name = "Bad"
base_url = "https://bad.example/v1"
wire_api = "chat"
`,
        apiKey: 'k',
      }),
    ).toThrow('wire_api 仅支持 responses')

    expect(() =>
      applyThirdPartyProvider(existing, {
        id: 'reserved',
        name: 'OpenAI',
        tomlText: overlayFor({
          providerId: 'openai',
          name: 'OpenAI',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-5.4',
        }),
        apiKey: 'k',
      }),
    ).toThrow('openai 是 Codex 内置供应商 ID，请改用其他名称')
  })
})
