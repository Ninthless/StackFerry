import { describe, expect, it } from 'vitest'
import type { ProviderStore, StoredProvider } from '../electron/main/codex/store'
import { createCodexAdapter } from '../electron/main/routing/codex-adapter'
import { readUpstreamApiKey } from '../electron/main/routing/proxy'
import { starterOverlayToml } from '../shared/provider-overlay'

describe('readUpstreamApiKey', () => {
  it('returns the decrypted key', () => {
    expect(readUpstreamApiKey(() => ' secret ')).toBe('secret')
  })

  it('returns null when decrypt throws or the key is empty', () => {
    expect(readUpstreamApiKey(() => '')).toBeNull()
    expect(
      readUpstreamApiKey(() => {
        throw new Error('unavailable')
      }),
    ).toBeNull()
  })

  it('reads env_key and ignores the stored secret', () => {
    const name = 'STACKFERRY_TEST_UPSTREAM_KEY'
    process.env[name] = ' from-env '
    try {
      expect(readUpstreamApiKey(() => 'stored', name)).toBe('from-env')
      delete process.env[name]
      expect(readUpstreamApiKey(() => 'stored', name)).toBeNull()
    } finally {
      delete process.env[name]
    }
  })
})

describe('codex resolveUpstream', () => {
  it('returns the stored key for a normal overlay', async () => {
    const adapter = adapterWith({ decrypt: () => 'secret' })
    await expect(adapter.resolveUpstream('p1')).resolves.toMatchObject({
      id: 'p1',
      apiKey: 'secret',
      baseUrl: 'https://example.test/v1',
    })
  })

  it('does not forward an empty or failed key', async () => {
    await expect(adapterWith({ decrypt: () => '' }).resolveUpstream('p1')).resolves.toBeNull()
    await expect(
      adapterWith({
        decrypt: () => {
          throw new Error('unavailable')
        },
      }).resolveUpstream('p1'),
    ).resolves.toBeNull()
  })

  it('injects env_key when the overlay uses external auth', async () => {
    const name = 'STACKFERRY_TEST_UPSTREAM_ENV'
    process.env[name] = 'env-secret'
    try {
      const adapter = adapterWith({
        decrypt: () => {
          throw new Error('should not decrypt')
        },
        tomlText: `${starterOverlayToml({
          providerId: 'azure',
          name: 'Azure',
          baseUrl: 'https://example.test/v1',
          model: 'gpt',
        })}env_key = "${name}"\n`,
      })
      await expect(adapter.resolveUpstream('p1')).resolves.toMatchObject({
        apiKey: 'env-secret',
      })
    } finally {
      delete process.env[name]
    }
  })
})

function adapterWith(input: { decrypt: () => string; tomlText?: string }) {
  const provider: StoredProvider = {
    id: 'p1',
    name: 'P',
    kind: 'custom',
    baseUrl: 'https://example.test/v1',
    model: 'gpt',
    models: ['gpt'],
    tomlText:
      input.tomlText ??
      starterOverlayToml({
        providerId: 'p1',
        name: 'P',
        baseUrl: 'https://example.test/v1',
        model: 'gpt',
      }),
    apiKeyPayload: 'payload',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
  return createCodexAdapter({
    providers: {
      peek: async () => provider,
      decryptApiKey: input.decrypt,
    } as unknown as ProviderStore,
    getCodexHome: () => '/tmp',
    backupRoot: '/tmp',
  })
}
