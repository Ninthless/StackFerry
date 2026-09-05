import { createServer, type AddressInfo, type IncomingMessage, type ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { CircuitBreaker } from '../electron/main/routing/breaker'
import { RequestLog } from '../electron/main/routing/log'
import { RoutingProxy, type UpstreamTarget } from '../electron/main/routing/proxy'

type FakeUpstream = {
  id: string
  url: string
  hits: number
  close: () => Promise<void>
}

async function listenFake(
  id: string,
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<FakeUpstream> {
  const state: FakeUpstream = { id, url: '', hits: 0, close: async () => undefined }
  const server = createServer((req, res) => {
    state.hits += 1
    handler(req, res)
  })
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address() as AddressInfo
  state.url = `http://127.0.0.1:${address.port}/v1`
  state.close = () =>
    new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  return state
}

async function withProxy(
  targets: UpstreamTarget[],
  run: (base: string, log: RequestLog) => Promise<void>,
): Promise<void> {
  const log = new RequestLog(() => 20)
  const breaker = new CircuitBreaker(() => ({
    failureThreshold: 3,
    recoveryWaitMs: 30_000,
    halfOpenSuccesses: 1,
  }))
  const proxy = new RoutingProxy({
    listCandidates: async () => targets.map((item) => item.id),
    resolveUpstream: async (id) => targets.find((item) => item.id === id) ?? null,
    admit: (id) => breaker.admit(id),
    recordSuccess: (id) => breaker.recordSuccess(id),
    recordFailure: (id) => breaker.recordFailure(id),
    log: (entry) => log.append(entry),
  })
  const port = await proxy.listen('127.0.0.1', 0)
  try {
    await run(`http://127.0.0.1:${port}`, log)
  } finally {
    await proxy.close()
  }
}

describe('routing proxy', () => {
  it('passes SSE through the next upstream after a 5xx, injecting the api key', async () => {
    const first = await listenFake('one', (_req, res) => {
      res.writeHead(503, { 'content-type': 'application/json' })
      res.end('{"error":"down"}')
    })
    const second = await listenFake('two', (req, res) => {
      expect(req.headers.authorization).toBe('Bearer secret-two')
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('data: {"ok":true}\n\n')
      res.end()
    })
    try {
      await withProxy(
        [
          { id: 'one', baseUrl: first.url, apiKey: 'secret-one' },
          { id: 'two', baseUrl: second.url, apiKey: 'secret-two' },
        ],
        async (base, log) => {
          const response = await fetch(`${base}/v1/responses`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-test', input: 'hi' }),
          })
          expect(response.status).toBe(200)
          expect(await response.text()).toContain('data: {"ok":true}')
          expect(first.hits).toBe(1)
          expect(second.hits).toBe(1)
          const dumped = JSON.stringify(log.list())
          expect(dumped).not.toContain('secret-one')
          expect(dumped).not.toContain('secret-two')
          expect(log.list().some((entry) => entry.errorCode === 'http_503')).toBe(true)
        },
      )
    } finally {
      await first.close()
      await second.close()
    }
  })

  it('fails over on 429 and does not switch after a 400', async () => {
    const first = await listenFake('one', (_req, res) => {
      res.writeHead(429, { 'content-type': 'application/json' })
      res.end('{"error":"rate"}')
    })
    const second = await listenFake('two', (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"ok":true}')
    })
    try {
      await withProxy(
        [
          { id: 'one', baseUrl: first.url, apiKey: 'k1' },
          { id: 'two', baseUrl: second.url, apiKey: 'k2' },
        ],
        async (base) => {
          const response = await fetch(`${base}/v1/models`)
          expect(response.status).toBe(200)
          expect(await response.text()).toBe('{"ok":true}')
          expect(second.hits).toBe(1)
        },
      )
    } finally {
      await first.close()
      await second.close()
    }

    const bad = await listenFake('bad', (_req, res) => {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end('{"error":"bad request"}')
    })
    const unused = await listenFake('unused', (_req, res) => {
      res.writeHead(200)
      res.end('nope')
    })
    try {
      await withProxy(
        [
          { id: 'bad', baseUrl: bad.url, apiKey: 'k' },
          { id: 'unused', baseUrl: unused.url, apiKey: 'k' },
        ],
        async (base) => {
          const response = await fetch(`${base}/v1/responses`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          })
          expect(response.status).toBe(400)
          expect(unused.hits).toBe(0)
        },
      )
    } finally {
      await bad.close()
      await unused.close()
    }
  })

  it('fails over when the stream dies before the first byte', async () => {
    const first = await listenFake('one', (_req, res) => {
      res.destroy()
    })
    const second = await listenFake('two', (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end('data: recovered\n\n')
    })
    try {
      await withProxy(
        [
          { id: 'one', baseUrl: first.url, apiKey: 'k1' },
          { id: 'two', baseUrl: second.url, apiKey: 'k2' },
        ],
        async (base) => {
          const response = await fetch(`${base}/v1/responses`, {
            method: 'POST',
            body: '{}',
          })
          expect(await response.text()).toContain('recovered')
          expect(second.hits).toBe(1)
        },
      )
    } finally {
      await first.close()
      await second.close()
    }
  })
})
