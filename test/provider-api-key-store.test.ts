import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
}))

import { ClaudeProviderStore } from '../electron/main/claude/store'
import { ProviderStore } from '../electron/main/codex/store'
import { GrokProviderStore } from '../electron/main/grok/store'
import { starterOverlayToml } from '../shared/provider-overlay'

describe('provider api key read', () => {
  it('keeps Codex list items free of plaintext keys and decrypts on demand', async () => {
    const store = new ProviderStore(path.join(await tempDir('codex'), 'providers.json'))
    const listed = await store.add({
      name: 'Gateway',
      kind: 'custom',
      apiKey: 'sk-codex',
      tomlText: starterOverlayToml({
        providerId: 'gateway',
        name: 'Gateway',
        baseUrl: 'https://gw.example/v1',
        model: 'demo',
      }),
    })
    expect(listed).toMatchObject({ hasApiKey: true })
    expect(listed).not.toHaveProperty('apiKey')
    await expect(store.readApiKey(listed.id)).resolves.toBe('sk-codex')
    await expect(store.readApiKey('missing')).rejects.toMatchObject({ code: 'provider_missing' })
  })

  it('keeps Claude list items free of plaintext keys and decrypts on demand', async () => {
    const store = new ClaudeProviderStore(path.join(await tempDir('claude'), 'providers.json'))
    const listed = await store.add({
      name: 'Claude Gateway',
      kind: 'custom',
      baseUrl: 'https://claude.example',
      authScheme: 'bearer',
      apiKey: 'sk-claude',
    })
    expect(listed).toMatchObject({ hasApiKey: true })
    expect(listed).not.toHaveProperty('apiKey')
    await expect(store.readApiKey(listed.id)).resolves.toBe('sk-claude')
  })

  it('decrypts Grok chat and image keys without putting them on the list item', async () => {
    const store = new GrokProviderStore(path.join(await tempDir('grok'), 'providers.json'))
    const listed = await store.add({
      name: 'Grok Gateway',
      kind: 'custom',
      baseUrl: 'https://grok.example/v1',
      model: 'demo',
      apiBackend: 'responses',
      apiKey: 'chat-secret',
      imageApiKey: 'image-secret',
    })
    expect(listed).toMatchObject({ hasApiKey: true, hasImageApiKey: true })
    expect(listed).not.toHaveProperty('apiKey')
    expect(listed).not.toHaveProperty('imageApiKey')
    await expect(store.readApiKeys(listed.id)).resolves.toEqual({
      apiKey: 'chat-secret',
      imageApiKey: 'image-secret',
    })
  })
})

async function tempDir(label: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), `stackferry-${label}-key-`))
}
