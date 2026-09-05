import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { RoutingStore } from '../electron/main/routing/store'

describe('routing store', () => {
  it('defaults to an empty queue and fixed breaker settings', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-routing-'))
    const store = new RoutingStore(path.join(dir, 'routing.json'))
    expect(await store.get()).toEqual({
      queue: [],
      failureThreshold: 3,
      recoveryWaitSeconds: 30,
      halfOpenSuccesses: 1,
      logRetention: 50,
      port: null,
    })
  })

  it('keeps queue order unique and falls back invalid numbers', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-routing-'))
    const file = path.join(dir, 'routing.json')
    await writeFile(file, '{"queue":["b","a","b",""],"failureThreshold":0,"port":99999}\n')
    const store = new RoutingStore(file)
    const first = await store.get()
    expect(first.queue).toEqual(['b', 'a'])
    expect(first.failureThreshold).toBe(3)
    expect(first.port).toBeNull()
    await store.setQueue(['c', 'a', 'c'])
    await store.setSettings({ failureThreshold: 5, recoveryWaitSeconds: 12 })
    await store.setPort(41234)
    expect(await store.get()).toMatchObject({
      queue: ['c', 'a'],
      failureThreshold: 5,
      recoveryWaitSeconds: 12,
      port: 41234,
    })
    const persisted = JSON.parse(await readFile(file, 'utf8')) as { version: number }
    expect(persisted.version).toBe(1)
  })
})
