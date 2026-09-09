import { createServer, type AddressInfo, type IncomingMessage, type ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { CircuitBreaker } from '../electron/main/routing/breaker'
import { RequestLog } from '../electron/main/routing/log'
import { RoutingProxy, type UpstreamTarget } from '../electron/main/routing/proxy'
import type { ProxyRoute } from '../electron/main/routing/policy'

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
  routes?: readonly ProxyRoute[],
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
    routes,
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

  it('translates a chat completions stream into responses events', async () => {
    const upstream = await listenFake('chat', async (req, res) => {
      expect(req.method).toBe('POST')
      expect(req.url).toBe('/v1/chat/completions')
      expect(req.headers.authorization).toBe('Bearer chat-key')
      expect(req.headers['x-openai-actor-authorization']).toBe('custom')
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        messages?: unknown
        stream?: boolean
      }
      expect(payload.stream).toBe(true)
      expect(payload.messages).toEqual([{ role: 'user', content: 'hi' }])
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write(
        'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"hello"}}]}\n\n',
      )
      res.write(
        'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
      )
      res.write('data: [DONE]\n\n')
      res.end()
    })
    try {
      await withProxy(
        [
          {
            id: 'chat',
            baseUrl: upstream.url,
            apiKey: 'chat-key',
            wireApi: 'chat',
            httpHeaders: { 'x-openai-actor-authorization': 'custom' },
          },
        ],
        async (base) => {
          const response = await fetch(`${base}/v1/responses`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              model: 'gpt-test',
              input: 'hi',
              stream: true,
            }),
          })
          expect(response.status).toBe(200)
          const text = await response.text()
          expect(text).toContain('event: response.output_text.delta')
          expect(text).toContain('hello')
          expect(text).toContain('event: response.completed')
          expect(upstream.hits).toBe(1)
        },
      )
    } finally {
      await upstream.close()
    }
  })

  it('forwards Claude messages bytes and beta headers without rewriting', async () => {
    const body = JSON.stringify({
      model: 'claude-sonnet',
      system: [{ type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'assistant',
          content: [{ type: 'thinking', thinking: 't', signature: 'sig-1' }],
        },
      ],
    })
    const upstream = await listenFake('claude', async (req, res) => {
      expect(req.headers['anthropic-beta']).toBe('prompt-caching-2024-07-31')
      expect(req.headers['anthropic-version']).toBe('2023-06-01')
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      expect(Buffer.concat(chunks).toString('utf8')).toBe(body)
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('event: ping\n\n')
      res.end()
    })
    try {
      await withProxy(
        [{ id: 'claude', baseUrl: upstream.url, apiKey: 'sk-ant', authScheme: 'x-api-key' }],
        async (base) => {
          const response = await fetch(`${base}/v1/messages`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'anthropic-beta': 'prompt-caching-2024-07-31',
              'anthropic-version': '2023-06-01',
            },
            body,
          })
          expect(response.status).toBe(200)
          expect(await response.text()).toContain('event: ping')
        },
        ['messages'],
      )
    } finally {
      await upstream.close()
    }
  })

  it('does not fail over Claude extra-input 400s and keeps the error body', async () => {
    const first = await listenFake('one', (_req, res) => {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end('{"error":{"message":"Extra inputs are not permitted"}}')
    })
    const second = await listenFake('two', (_req, res) => {
      res.writeHead(200)
      res.end('nope')
    })
    try {
      await withProxy(
        [
          { id: 'one', baseUrl: first.url, apiKey: 'k1', authScheme: 'x-api-key' },
          { id: 'two', baseUrl: second.url, apiKey: 'k2', authScheme: 'x-api-key' },
        ],
        async (base) => {
          const response = await fetch(`${base}/v1/messages`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          })
          expect(response.status).toBe(400)
          expect(await response.text()).toBe('{"error":{"message":"Extra inputs are not permitted"}}')
          expect(second.hits).toBe(0)
        },
        ['messages'],
      )
    } finally {
      await first.close()
      await second.close()
    }
  })

  it('forwards Anthropic messages with x-api-key and ignores Codex paths', async () => {
    const upstream = await listenFake('claude', (req, res) => {
      expect(req.headers['x-api-key']).toBe('sk-ant')
      expect(req.headers.authorization).toBeUndefined()
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"ok":true}')
    })
    try {
      await withProxy(
        [{ id: 'claude', baseUrl: upstream.url, apiKey: 'sk-ant', authScheme: 'x-api-key' }],
        async (base) => {
          const ok = await fetch(`${base}/v1/messages`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-api-key': 'placeholder' },
            body: JSON.stringify({ model: 'claude-sonnet', messages: [] }),
          })
          expect(ok.status).toBe(200)
          expect(await ok.text()).toBe('{"ok":true}')
          const missing = await fetch(`${base}/v1/responses`, { method: 'POST', body: '{}' })
          expect(missing.status).toBe(404)
        },
        ['messages', 'models'],
      )
    } finally {
      await upstream.close()
    }
  })
})
