import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { RoutingStore } from '../electron/main/routing/store'

describe('routing store', () => {
  it('defaults to empty lanes and fixed breaker settings', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-routing-'))
    const store = new RoutingStore(path.join(dir, 'routing.json'))
    expect(await store.get()).toEqual({
      failureThreshold: 3,
      recoveryWaitSeconds: 30,
      halfOpenSuccesses: 1,
      logRetention: 50,
      lanes: {
        codex: { queue: [], port: null },
        'claude-code': { queue: [], port: null },
        'grok-build': { queue: [], port: null },
      },
    })
  })

  it('migrates a v1 queue onto the Codex lane', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-routing-v1-'))
    const file = path.join(dir, 'routing.json')
    await writeFile(
      file,
      '{"version":1,"queue":["b","a","b",""],"failureThreshold":0,"port":41234}\n',
    )
    const store = new RoutingStore(file)
    expect(await store.get()).toMatchObject({
      failureThreshold: 3,
      lanes: {
        codex: { queue: ['b', 'a'], port: 41234 },
        'claude-code': { queue: [], port: null },
      },
    })
  })

  it('keeps per-lane queues unique and falls back invalid numbers', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-routing-'))
    const file = path.join(dir, 'routing.json')
    await writeFile(file, '{"queue":["b","a","b",""],"failureThreshold":0,"port":99999}\n')
    const store = new RoutingStore(file)
    const first = await store.get()
    expect(first.lanes.codex.queue).toEqual(['b', 'a'])
    expect(first.failureThreshold).toBe(3)
    expect(first.lanes.codex.port).toBeNull()
    await store.setQueue('codex', ['c', 'a', 'c'])
    await store.setQueue('claude-code', ['z', 'z'])
    await store.setSettings({ failureThreshold: 5, recoveryWaitSeconds: 12 })
    await store.setPort('codex', 41234)
    expect(await store.get()).toMatchObject({
      lanes: {
        codex: { queue: ['c', 'a'], port: 41234 },
        'claude-code': { queue: ['z'], port: null },
      },
      failureThreshold: 5,
      recoveryWaitSeconds: 12,
    })
    const persisted = JSON.parse(await readFile(file, 'utf8')) as { version: number; queue?: unknown }
    expect(persisted.version).toBe(2)
    expect(persisted.queue).toBeUndefined()
  })
})
