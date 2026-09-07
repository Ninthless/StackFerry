import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { starterOverlayToml, withOverlayWireApi } from '../shared/provider-overlay'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
}))

import { ProviderStore } from '../electron/main/providers/store'
import { RoutingService } from '../electron/main/routing/service'
import { RoutingStore } from '../electron/main/routing/store'

describe('enable vs failover queue', () => {
  it('does not enroll the previous provider when switching the enabled one', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-enable-queue-'))
    const providers = new ProviderStore(path.join(dir, 'providers.json'))
    const store = new RoutingStore(path.join(dir, 'routing.json'))
    await writeFile(path.join(dir, 'providers.json'), `${JSON.stringify(providerFile(['a', 'b']), null, 2)}\n`)
    await mkdir(path.join(dir, 'codex'), { recursive: true })
    const routing = new RoutingService({
      store,
      providers,
      getCodexHome: () => path.join(dir, 'codex'),
      backupRoot: path.join(dir, 'backups'),
      setNeedsRestart: () => undefined,
    })

    try {
      await routing.enable('a')
      expect((await store.get()).queue).toEqual([])
      await routing.enable('b')
      expect((await store.get()).queue).toEqual([])
      const view = await routing.snapshot()
      expect(view.queue.includes('a')).toBe(false)
    } finally {
      await routing.restoreOnQuit()
    }
  })

  it('leaves an explicit failover queue unchanged when enabling someone else', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-enable-keep-queue-'))
    const providers = new ProviderStore(path.join(dir, 'providers.json'))
    const store = new RoutingStore(path.join(dir, 'routing.json'))
    await writeFile(path.join(dir, 'providers.json'), `${JSON.stringify(providerFile(['a', 'b', 'c']), null, 2)}\n`)
    await store.setQueue(['c'])
    await mkdir(path.join(dir, 'codex'), { recursive: true })
    const routing = new RoutingService({
      store,
      providers,
      getCodexHome: () => path.join(dir, 'codex'),
      backupRoot: path.join(dir, 'backups'),
      setNeedsRestart: () => undefined,
    })

    try {
      await routing.enable('b')
      expect((await store.get()).queue).toEqual(['c'])
    } finally {
      await routing.restoreOnQuit()
    }
  })
})

function providerFile(ids: string[]) {
  return {
    version: 2,
    activeProviderId: null,
    lastWriteAt: null,
    providers: ids.map((id) => ({
      id,
      name: id,
      kind: 'custom',
      baseUrl: 'https://example.test/v1',
      model: 'demo',
      tomlText: withOverlayWireApi(
        starterOverlayToml({
          providerId: id,
          name: id,
          baseUrl: 'https://example.test/v1',
          model: 'demo',
        }),
        'chat',
      ),
      apiKeyPayload: Buffer.from('key').toString('base64'),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })),
  }
}
