import { describe, expect, it } from 'vitest'
import {
  applyOfficialProvider,
  applyRouterProvider,
  applyThirdPartyProvider,
  parseToml,
  providerKey,
  stringifyToml,
} from '../electron/main/codex/merge'
import { starterOverlayToml } from '../shared/provider-overlay'
import { expectAppError } from './expect-app-error'

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
    expect(next.approval_policy).toBeUndefined()
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
      http_headers: {
        'x-openai-actor-authorization': 'custom',
      },
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

  it('keeps previous StackFerry provider tables when switching', () => {
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
    expect(Object.keys(providers)).toEqual([providerKey('aaaa'), providerKey('bbbb')])
    expect(second.model_provider).toBe(providerKey('bbbb'))
    expect(stringifyToml(second)).toContain('experimental_bearer_token = "key-b"')
    expect(stringifyToml(second)).toContain('experimental_bearer_token = "key-a"')
  })

  it('restores the official openai pointer and keeps dormant provider tables', () => {
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
    expect(official.approval_policy).toBeUndefined()
    expect(official.mcp_servers).toEqual({ docs: { command: 'docs-mcp' } })
    const providers = official.model_providers as Record<string, Record<string, string>>
    expect(providers[providerKey('cccc')].experimental_bearer_token).toBe('key-c')
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

  it('rejects writing chat wire_api into a direct live provider and reserved ids', () => {
    expectAppError(
      () =>
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
      'overlay_wire_api',
    )

    expectAppError(
      () =>
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
      'overlay_reserved_provider_id',
      { name: 'openai' },
    )
  })

  it('writes approval_policy from the overlay and clears it when omitted', () => {
    const withPolicy = applyThirdPartyProvider(existing, {
      id: 'policy',
      name: 'Policy',
      tomlText: `approval_policy = "never"
${overlayFor({
        providerId: 'provider_policy',
        name: 'Policy',
        baseUrl: 'https://policy.example/v1',
        model: 'model-policy',
      })}`,
      apiKey: 'key-policy',
    })
    expect(withPolicy.approval_policy).toBe('never')
    expect(withPolicy.sandbox_mode).toBe('workspace-write')

    const withoutPolicy = applyThirdPartyProvider(withPolicy, {
      id: 'no-policy',
      name: 'No Policy',
      tomlText: overlayFor({
        providerId: 'provider_no_policy',
        name: 'No Policy',
        baseUrl: 'https://nopolicy.example/v1',
        model: 'model-no-policy',
      }),
      apiKey: 'key-no-policy',
    })
    expect(withoutPolicy.approval_policy).toBeUndefined()
    expect(withoutPolicy.sandbox_mode).toBe('workspace-write')
  })

  it('writes max reasoning effort from the overlay', () => {
    const applied = applyThirdPartyProvider(existing, {
      id: 'astra',
      name: 'Astra',
      tomlText: `model_reasoning_effort = "max"
${overlayFor({
        providerId: 'provider_astra',
        name: 'Astra',
        baseUrl: 'https://astra.example/v1',
        model: 'gpt-6-astra',
      })}`,
      apiKey: 'key-astra',
    })
    expect(applied.model).toBe('gpt-6-astra')
    expect(applied.model_reasoning_effort).toBe('max')
  })

  it('writes a local router table without secrets', () => {
    const next = applyRouterProvider(existing, {
      port: 17890,
      tomlText: overlayFor({
        providerId: 'provider_r',
        name: 'Routed',
        baseUrl: 'https://secret.example/v1',
        model: 'model-r',
      }),
    })
    expect(next.model_provider).toBe('stackferry_router')
    expect(next.model).toBe('model-r')
    const providers = next.model_providers as Record<string, Record<string, string>>
    expect(providers.stackferry_router).toEqual({
      name: 'StackFerry Router',
      base_url: 'http://127.0.0.1:17890/v1',
      wire_api: 'responses',
    })
    expect(stringifyToml(next)).not.toContain('secret.example')
    expect(stringifyToml(next)).not.toContain('experimental_bearer_token')
    expect(stringifyToml(next)).not.toContain('localhost')
  })

  it('keeps the router live table on responses when the overlay is chat', () => {
    const next = applyRouterProvider(existing, {
      port: 17890,
      tomlText: `model = "model-chat"
model_provider = "provider_chat"

[model_providers.provider_chat]
name = "Chat"
base_url = "https://chat.example/v1"
wire_api = "chat"
`,
    })
    const providers = next.model_providers as Record<string, Record<string, string>>
    expect(providers.stackferry_router.wire_api).toBe('responses')
    expect(providers.stackferry_router.base_url).toBe('http://127.0.0.1:17890/v1')
    expect(stringifyToml(next)).not.toContain('wire_api = "chat"')
    expect(stringifyToml(next)).not.toContain('chat.example')
  })

  it('points custom and router live configs at the StackFerry catalog', () => {
    const catalogPath = 'C:\\Users\\me\\.codex\\model-catalogs\\stackferry.json'
    const custom = applyThirdPartyProvider(existing, {
      id: 'catalog',
      name: 'Catalog',
      tomlText: overlayFor({
        providerId: 'provider_catalog',
        name: 'Catalog',
        baseUrl: 'https://catalog.example/v1',
        model: 'gpt-5.4',
      }),
      apiKey: 'key-catalog',
      catalogPath,
      models: ['gpt-5.4', 'gpt-5'],
    })
    expect(custom.model_catalog_json).toBe('C:/Users/me/.codex/model-catalogs/stackferry.json')

    const routed = applyRouterProvider(custom, {
      port: 17890,
      tomlText: overlayFor({
        providerId: 'provider_r',
        name: 'Routed',
        baseUrl: 'https://secret.example/v1',
        model: 'model-r',
      }),
      catalogPath,
      models: ['model-r'],
    })
    expect(routed.model_catalog_json).toBe('C:/Users/me/.codex/model-catalogs/stackferry.json')
    const providers = routed.model_providers as Record<string, unknown>
    expect(providers).toHaveProperty(providerKey('catalog'))
    expect(providers).toHaveProperty('stackferry_router')
  })

  it('clears only the StackFerry catalog pointer', () => {
    const owned = 'C:/Users/me/.codex/model-catalogs/stackferry.json'
    const other = '/tmp/custom-catalog.json'
    const withOwned = applyThirdPartyProvider(
      { ...existing, model_catalog_json: owned },
      {
        id: 'empty',
        name: 'Empty',
        tomlText: overlayFor({
          providerId: 'provider_empty',
          name: 'Empty',
          baseUrl: 'https://empty.example/v1',
          model: 'gpt-5.4',
        }),
        apiKey: 'key-empty',
        catalogPath: owned,
        models: [],
      },
    )
    expect(withOwned.model_catalog_json).toBeUndefined()

    const withOther = applyOfficialProvider(
      { ...existing, model_catalog_json: other },
      owned,
    )
    expect(withOther.model_catalog_json).toBe(other)
  })
})
