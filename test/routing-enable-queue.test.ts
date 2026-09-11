import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises'
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

import { ClaudeEnableService } from '../electron/main/claude/service'
import { ClaudeProviderStore } from '../electron/main/claude/store'
import { GrokEnableService } from '../electron/main/grok/service'
import { GrokProviderStore } from '../electron/main/grok/store'
import { ProviderStore } from '../electron/main/codex/store'
import { RoutingService } from '../electron/main/routing/service'
import { RoutingStore } from '../electron/main/routing/store'

describe('enable vs failover queue', () => {
  it('does not enroll the previous provider when switching the enabled one', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-enable-queue-'))
    const { store, routing } = await harness(dir, ['a', 'b'])

    try {
      await routing.enable('codex', 'a')
      expect((await store.get()).lanes.codex.queue).toEqual([])
      await routing.enable('codex', 'b')
      expect((await store.get()).lanes.codex.queue).toEqual([])
      const view = await routing.snapshot()
      expect(view.lanes.codex.queue.includes('a')).toBe(false)
    } finally {
      await routing.restoreOnQuit()
    }
  })

  it('promotes the dragged-to-front provider to current when routing is live', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-queue-promote-'))
    const { store, routing, providers } = await harness(dir, ['a', 'b'])
    await store.setQueue('codex', ['b'])

    try {
      await routing.enable('codex', 'a')
      expect((await providers.list()).find((item) => item.enabled)?.id).toBe('a')
      await routing.setQueueOrder('codex', ['b', 'a'])
      expect((await store.get()).lanes.codex.queue).toEqual(['b', 'a'])
      expect((await providers.list()).find((item) => item.enabled)?.id).toBe('b')
      expect((await routing.snapshot()).lanes.codex.queue[0]).toBe('b')
    } finally {
      await routing.restoreOnQuit()
    }
  })

  it('promotes the Grok queue head when routing is live', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-grok-queue-promote-'))
    const { store, routing, grokStore } = await harness(dir, ['codex-a'], ['a', 'b'])
    await store.setQueue('grok-build', ['b'])
    await routing.snapshot()

    try {
      await routing.enable('grok-build', 'a')
      expect((await grokStore.list()).find((item) => item.enabled)?.id).toBe('a')
      await routing.setQueueOrder('grok-build', ['b', 'a'])
      expect((await store.get()).lanes['grok-build'].queue).toEqual(['b', 'a'])
      expect((await grokStore.list()).find((item) => item.enabled)?.id).toBe('b')
      expect((await routing.snapshot()).lanes['grok-build'].queue[0]).toBe('b')
    } finally {
      await routing.restoreOnQuit()
    }
  })

  it('does not show a Grok chat provider as failover when the queue is empty', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-grok-chat-display-'))
    const { store, routing } = await harness(dir, [], ['a'], 'chat_completions')

    try {
      await routing.enable('grok-build', 'a')
      expect((await store.get()).lanes['grok-build'].queue).toEqual([])
      expect((await routing.snapshot()).lanes['grok-build'].queue).toEqual([])
      expect((await routing.snapshot()).lanes['grok-build'].active).toBe(true)
    } finally {
      await routing.restoreOnQuit()
    }
  })

  it('rewrites the live router config when switching the enabled provider', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-live-rewrite-'))
    const { routing, providers, restart } = await harness(dir, ['a', 'b'])

    try {
      await routing.enable('codex', 'a')
      expect(restart.value).toBe(true)
      const backupsAfterFirst = await readdir(path.join(dir, 'backups'))
      restart.value = false
      await routing.enable('codex', 'b')
      expect(restart.value).toBe(true)
      expect((await providers.list()).find((item) => item.enabled)?.id).toBe('b')
      expect((await readdir(path.join(dir, 'backups'))).length).toBeGreaterThan(backupsAfterFirst.length)
    } finally {
      await routing.restoreOnQuit()
    }
  })

  it('leaves an explicit failover queue unchanged when enabling someone else', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-enable-keep-queue-'))
    const { store, routing } = await harness(dir, ['a', 'b', 'c'])
    await store.setQueue('codex', ['c'])

    try {
      await routing.enable('codex', 'b')
      expect((await store.get()).lanes.codex.queue).toEqual(['c'])
    } finally {
      await routing.restoreOnQuit()
    }
  })

  it('promotes a queued provider to the head when it is enabled', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-enable-promote-queue-'))
    const { store, routing, providers } = await harness(dir, ['a', 'b', 'c'])
    await store.setQueue('codex', ['b', 'a', 'c'])

    try {
      await routing.enable('codex', 'a')
      expect((await store.get()).lanes.codex.queue).toEqual(['a', 'b', 'c'])
      expect((await providers.list()).find((item) => item.enabled)?.id).toBe('a')
      expect((await routing.snapshot()).lanes.codex.queue[0]).toBe('a')
    } finally {
      await routing.restoreOnQuit()
    }
  })
})

async function harness(
  dir: string,
  ids: string[],
  grokIds: string[] = [],
  grokBackend: 'responses' | 'chat_completions' = 'responses',
) {
  const providers = new ProviderStore(path.join(dir, 'providers.json'))
  const claudeStore = new ClaudeProviderStore(path.join(dir, 'claude-providers.json'))
  const grokStore = new GrokProviderStore(path.join(dir, 'grok-providers.json'))
  const store = new RoutingStore(path.join(dir, 'routing.json'))
  await writeFile(path.join(dir, 'providers.json'), `${JSON.stringify(providerFile(ids), null, 2)}\n`)
  if (grokIds.length > 0) {
    await writeFile(
      path.join(dir, 'grok-providers.json'),
      `${JSON.stringify(grokProviderFile(grokIds, grokBackend), null, 2)}\n`,
    )
  }
  await mkdir(path.join(dir, 'codex'), { recursive: true })
  await mkdir(path.join(dir, 'grok'), { recursive: true })
  const claude = new ClaudeEnableService({
    store: claudeStore,
    getClaudeHome: () => path.join(dir, 'claude'),
    getDesktopLibraries: () => [],
    backupRoot: path.join(dir, 'backups', 'claude'),
    isManaged: async () => false,
  })
  const grok = new GrokEnableService({
    store: grokStore,
    getGrokHome: () => path.join(dir, 'grok'),
    backupRoot: path.join(dir, 'backups', 'grok'),
    isManaged: () => false,
  })
  const restart = { value: false }
  const routing = new RoutingService({
    store,
    providers,
    claudeStore,
    claude,
    grokStore,
    grok,
    getCodexHome: () => path.join(dir, 'codex'),
    backupRoot: path.join(dir, 'backups'),
    setNeedsRestart: (value) => {
      restart.value = value
    },
  })
  return { store, routing, providers, grokStore, restart }
}

function grokProviderFile(ids: string[], apiBackend: 'responses' | 'chat_completions' = 'responses') {
  return {
    version: 1,
    activeProviderId: null,
    lastWriteAt: null,
    providers: ids.map((id) => ({
      id,
      name: id,
      kind: 'custom',
      baseUrl: 'https://example.test/v1',
      model: 'demo',
      apiBackend,
      apiKeyPayload: Buffer.from('key').toString('base64'),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })),
  }
}

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
