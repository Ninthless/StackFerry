import { describe, expect, it } from 'vitest'
import {
  applyOfficialProvider,
  applyThirdPartyProvider,
  parseToml,
  providerKey,
  stringifyToml,
} from '../electron/main/codex/merge'

const existing = parseToml(`
approval_policy = "on-request"
model = "gpt-5"
notify = ["notify-send"]
`)

describe('codex toml merge', () => {
  it('writes a third-party provider without dropping unrelated keys', () => {
    const next = applyThirdPartyProvider(existing, {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      apiKey: 'sk-test',
    })
    const key = providerKey('11111111-1111-1111-1111-111111111111')
    expect(next.approval_policy).toBe('on-request')
    expect(next.notify).toEqual(['notify-send'])
    expect(next.model_provider).toBe(key)
    expect(next.model).toBe('deepseek-chat')
    const providers = next.model_providers as Record<string, Record<string, string>>
    expect(providers[key]).toEqual({
      name: 'DeepSeek',
      base_url: 'https://api.deepseek.com/v1',
      wire_api: 'responses',
      experimental_bearer_token: 'sk-test',
    })
  })

  it('replaces the previous StackFerry provider when switching', () => {
    const first = applyThirdPartyProvider(existing, {
      id: 'aaaa',
      name: 'A',
      baseUrl: 'https://a.example/v1',
      model: 'model-a',
      apiKey: 'key-a',
    })
    const second = applyThirdPartyProvider(first, {
      id: 'bbbb',
      name: 'B',
      baseUrl: 'https://b.example/v1',
      model: 'model-b',
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
      baseUrl: 'https://c.example/v1',
      model: 'model-c',
      apiKey: 'key-c',
    })
    const official = applyOfficialProvider(thirdParty)
    expect(official.model_provider).toBe('openai')
    expect(official.approval_policy).toBe('on-request')
    expect(official.model_providers).toBeUndefined()
    expect(stringifyToml(official)).not.toContain('experimental_bearer_token')
  })
})
