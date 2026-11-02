import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
}))

import { listClaudeModels } from '../electron/main/claude/models'
import { ClaudeProviderStore } from '../electron/main/claude/store'
import type { ClaudeAuthScheme } from '../shared/types'

const servers: Server[] = []
const directories: string[] = []

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function fixture(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer(handler)
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('fixture has no TCP address')
  return `http://127.0.0.1:${address.port}`
}

function respond(response: ServerResponse, body: unknown, status = 200) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

async function provider(baseUrl: string, authScheme: ClaudeAuthScheme = 'bearer') {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-model-pages-'))
  directories.push(dir)
  const store = new ClaudeProviderStore(path.join(dir, 'providers.json'))
  const saved = await store.add({
    name: 'Fixture gateway', kind: 'custom', baseUrl, authScheme, apiKey: 'fixture-stored-key',
  })
  return { store, providerId: saved.id }
}

describe('Claude model discovery pagination', () => {
  for (const authScheme of ['bearer', 'x-api-key'] as const) {
    for (const source of ['typed', 'stored'] as const) {
      it(`lists both pages with ${source} credentials and ${authScheme} authentication`, async () => {
        const requests: { url: URL; headers: IncomingMessage['headers'] }[] = []
        const cursor = 'cursor/one ?&'
        const baseUrl = await fixture((request, response) => {
          const url = new URL(request.url!, 'http://fixture')
          requests.push({ url, headers: request.headers })
          respond(response, url.searchParams.has('after_id')
            ? { data: [{ id: 'beta' }, { id: ' gamma ' }], has_more: false }
            : { data: [{ id: 'alpha' }, { id: 'beta' }], has_more: true, last_id: cursor })
        })
        const { store, providerId } = await provider(baseUrl, authScheme)
        const peek = vi.spyOn(store, 'peek')
        const decrypt = vi.spyOn(store, 'decryptApiKey')
        await expect(listClaudeModels(store, {
          baseUrl, providerId, ...(source === 'typed' ? { apiKey: ' fixture-typed-key ', authScheme } : {}),
        })).resolves.toEqual(['alpha', 'beta', 'gamma'])
        expect(requests).toHaveLength(2)
        expect(requests[0].url.pathname).toBe('/v1/models')
        expect(requests[1].url.pathname).toBe('/v1/models')
        expect(requests[1].url.searchParams.get('limit')).toBe('1000')
        expect(requests[1].url.searchParams.get('after_id')).toBe(cursor)
        for (const { headers } of requests) {
          const key = `fixture-${source}-key`
          expect(headers['anthropic-version']).toBe('2023-06-01')
          expect(headers.authorization).toBe(authScheme === 'bearer' ? `Bearer ${key}` : undefined)
          expect(headers['x-api-key']).toBe(authScheme === 'x-api-key' ? key : undefined)
        }
        expect(peek).toHaveBeenCalledTimes(source === 'typed' ? 0 : 1)
        expect(decrypt).toHaveBeenCalledTimes(source === 'typed' ? 0 : 1)
      })
    }
  }

  it('accepts single-page OpenAI-shaped catalogs without pagination metadata', async () => {
    const baseUrl = await fixture((_, response) => respond(response, { data: [{ id: 'alpha' }] }))
    const { store } = await provider(baseUrl)
    await expect(listClaudeModels(store, { baseUrl, apiKey: 'fixture-key' })).resolves.toEqual(['alpha'])
  })

  it('continues past an empty intermediate page with an advancing cursor', async () => {
    const baseUrl = await fixture((request, response) => {
      const next = new URL(request.url!, 'http://fixture').searchParams.get('after_id')
      respond(response, next ? { data: [{ id: 'alpha' }], has_more: false }
        : { data: [], has_more: true, last_id: 'next' })
    })
    const { store } = await provider(baseUrl)
    await expect(listClaudeModels(store, { baseUrl, apiKey: 'fixture-key' })).resolves.toEqual(['alpha'])
  })

  it.each([401, 403])('rejects a later-page HTTP %i without returning a partial list', async (status) => {
    const baseUrl = await fixture((request, response) => {
      const next = new URL(request.url!, 'http://fixture').searchParams.has('after_id')
      respond(response, next ? {} : { data: [{ id: 'alpha' }], has_more: true, last_id: 'next' }, next ? status : 200)
    })
    const { store } = await provider(baseUrl)
    await expect(listClaudeModels(store, { baseUrl, apiKey: 'fixture-key' })).rejects.toMatchObject({ code: 'models_auth' })
  })

  it.each([undefined, '', '   ', 7])('rejects an unusable next cursor (%s)', async (last_id) => {
    const baseUrl = await fixture((_, response) => respond(response, { data: [{ id: 'alpha' }], has_more: true, last_id }))
    const { store } = await provider(baseUrl)
    await expect(listClaudeModels(store, { baseUrl, apiKey: 'fixture-key' })).rejects.toMatchObject({ code: 'models_pagination_invalid' })
  })

  it('stops a repeated cursor before issuing a redundant request', async () => {
    let count = 0
    const baseUrl = await fixture((_, response) => {
      count++
      respond(response, { data: [{ id: 'alpha' }], has_more: true, last_id: 'same' })
    })
    const { store } = await provider(baseUrl)
    await expect(listClaudeModels(store, { baseUrl, apiKey: 'fixture-key' })).rejects.toMatchObject({ code: 'models_pagination_invalid' })
    expect(count).toBe(2)
  })

  it('bounds an endlessly advancing catalog rather than returning partial success', async () => {
    let count = 0
    const baseUrl = await fixture((_, response) => {
      count++
      respond(response, { data: [{ id: `model-${count}` }], has_more: true, last_id: String(count) })
    })
    const { store } = await provider(baseUrl)
    await expect(listClaudeModels(store, { baseUrl, apiKey: 'fixture-key' })).rejects.toMatchObject({ code: 'models_pagination_limit' })
    expect(count).toBe(100)
  })

  it('uses one total deadline across pages and body reads', async () => {
    const { store } = await provider('http://127.0.0.1')
    vi.useFakeTimers()
    const signals: AbortSignal[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_, init) => {
      const signal = init!.signal!
      signals.push(signal)
      if (signals.length === 1) {
        await new Promise((resolve) => setTimeout(resolve, 10_000))
        return new Response(JSON.stringify({ data: [{ id: 'alpha' }], has_more: true, last_id: 'next' }))
      }
      return new Response(new ReadableStream({
        start(controller) {
          signal.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true })
        },
      }))
    })
    const result = listClaudeModels(store, { baseUrl: 'http://127.0.0.1', apiKey: 'fixture-key' })
    const outcome = result.then(
      (models) => ({ models, error: undefined }),
      (error: unknown) => ({ models: undefined, error }),
    )
    await vi.advanceTimersByTimeAsync(15_000)
    expect((await outcome).error).toMatchObject({ code: 'models_timeout' })
    expect(signals).toHaveLength(2)
    expect(signals[0]).toBe(signals[1])
    expect(signals[1].aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})
