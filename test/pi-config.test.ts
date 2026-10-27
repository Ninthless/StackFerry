import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { AppError } from '../shared/app-error'
import {
  applyDirectPiDocuments,
  applyOfficialPiDocuments,
  applyRouterPiDocuments,
  assertSamePiApi,
  parsePiJson,
  piApisForQueue,
  piProviderKey,
  rememberedPiDefault,
} from '../electron/main/pi/config'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
}))

import { piModelsPath, piSettingsPath } from '../electron/main/pi/home'
import { PiEnableService } from '../electron/main/pi/service'
import { PiProviderStore } from '../electron/main/pi/store'

const provider = {
  id: 'gateway',
  name: 'Relay',
  baseUrl: 'https://relay.example/v1',
  model: 'demo-model',
  api: 'openai-completions' as const,
  apiKey: 'secret',
}

describe('pi config documents', () => {
  it('writes the active provider into models.json and settings.json', () => {
    const next = applyDirectPiDocuments(
      { providers: { ollama: { baseUrl: 'http://localhost:11434/v1' } } },
      { defaultProvider: 'anthropic', defaultModel: 'claude', theme: 'dark' },
      provider,
    )
    expect(next.models.providers).toMatchObject({
      ollama: { baseUrl: 'http://localhost:11434/v1' },
      [piProviderKey('gateway')]: {
        name: 'Relay',
        baseUrl: 'https://relay.example/v1',
        api: 'openai-completions',
        apiKey: 'secret',
        models: [{ id: 'demo-model' }],
      },
    })
    expect(next.settings).toMatchObject({
      theme: 'dark',
      defaultProvider: piProviderKey('gateway'),
      defaultModel: 'demo-model',
    })
  })

  it('points the router at localhost and restores the previous default without touching other providers', () => {
    const direct = applyDirectPiDocuments({}, { defaultProvider: 'openai', defaultModel: 'gpt' }, provider)
    const routed = applyRouterPiDocuments(direct.models, direct.settings, provider, 8787)
    const managed = (routed.models.providers as Record<string, { baseUrl: string; apiKey: string }>)[
      piProviderKey('gateway')
    ]
    expect(managed.baseUrl).toBe('http://127.0.0.1:8787/v1')
    expect(managed.apiKey).not.toBe('secret')
    const official = applyOfficialPiDocuments(routed.models, routed.settings, {
      provider: 'openai',
      model: 'gpt',
    })
    expect(official.models.providers).toEqual({})
    expect(official.settings.defaultProvider).toBe('openai')
    expect(official.settings.defaultModel).toBe('gpt')
  })

  it('ignores a stackferry default when remembering the previous login', () => {
    expect(rememberedPiDefault(parsePiJson('{"defaultProvider":"openai","defaultModel":"gpt"}'))).toEqual({
      provider: 'openai',
      model: 'gpt',
    })
    expect(rememberedPiDefault({ defaultProvider: piProviderKey('gateway') })).toBeNull()
    expect(() => parsePiJson('[]')).toThrow(AppError)
  })

  it('keeps a native default when official is enabled with nothing remembered', () => {
    const kept = applyOfficialPiDocuments(
      { providers: { openai: { baseUrl: 'https://api.openai.com/v1' }, [piProviderKey('old')]: { apiKey: 'x' } } },
      { defaultProvider: 'openai', defaultModel: 'gpt', theme: 'dark' },
      null,
    )
    expect(kept.models.providers).toEqual({ openai: { baseUrl: 'https://api.openai.com/v1' } })
    expect(kept.settings).toEqual({ defaultProvider: 'openai', defaultModel: 'gpt', theme: 'dark' })
    const cleared = applyOfficialPiDocuments(
      {},
      { defaultProvider: piProviderKey('gateway'), defaultModel: 'demo', theme: 'dark' },
      null,
    )
    expect(cleared.settings).toEqual({ theme: 'dark' })
  })

  it('keeps the on-disk Pi default when official is enabled first', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-pi-official-'))
    const piHome = path.join(dir, 'agent')
    await mkdir(piHome, { recursive: true })
    await writeFile(
      piSettingsPath(piHome),
      `${JSON.stringify({ defaultProvider: 'openai', defaultModel: 'gpt', theme: 'dark' })}\n`,
    )
    await writeFile(piModelsPath(piHome), `${JSON.stringify({ providers: { openai: { baseUrl: 'https://api.openai.com/v1' } } })}\n`)
    const store = new PiProviderStore(path.join(dir, 'pi-providers.json'))
    const service = new PiEnableService({
      store,
      getPiHome: () => piHome,
      backupRoot: path.join(dir, 'backups'),
    })
    await service.writeOfficial()
    expect(JSON.parse(await readFile(piSettingsPath(piHome), 'utf8'))).toEqual({
      defaultProvider: 'openai',
      defaultModel: 'gpt',
      theme: 'dark',
    })
    expect(await store.getPreviousDefault()).toBeNull()
  })

  it('writes the thinking level and context window, then drops the managed level on official', () => {
    const next = applyDirectPiDocuments(
      {},
      { theme: 'dark', modelThinkingLevels: { 'openai/gpt': 'low' } },
      { ...provider, thinkingLevel: 'high', contextWindow: '200000' },
    )
    const managed = (next.models.providers as Record<string, { models: unknown[] }>)[piProviderKey('gateway')]
    expect(managed.models).toEqual([{ id: 'demo-model', reasoning: true, contextWindow: 200000 }])
    expect(next.settings.modelThinkingLevels).toEqual({
      'openai/gpt': 'low',
      [`${piProviderKey('gateway')}/demo-model`]: 'high',
    })
    const official = applyOfficialPiDocuments(next.models, next.settings, { provider: 'openai', model: 'gpt' })
    expect(official.settings.modelThinkingLevels).toEqual({ 'openai/gpt': 'low' })
    expect(official.settings.theme).toBe('dark')
  })

  it('rejects a failover queue that mixes APIs', () => {
    expect(() => assertSamePiApi(['openai-completions', 'openai-completions'])).not.toThrow()
    expect(() => assertSamePiApi(['openai-completions', 'anthropic-messages'])).toThrow(AppError)
    const providers = [
      { id: 'a', kind: 'custom', api: 'openai-completions' as const },
      { id: 'b', kind: 'custom', api: 'openai-responses' as const },
    ]
    expect(() => assertSamePiApi(piApisForQueue(providers, ['a', 'b'], { id: 'b', api: 'openai-completions' }))).not.toThrow()
    expect(() => assertSamePiApi(piApisForQueue(providers, ['a', 'b']))).toThrow(AppError)
  })
})
