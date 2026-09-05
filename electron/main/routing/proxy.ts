import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { RoutingLogEntry } from '../../../shared/routing'
import {
  classifyProxyPath,
  errorCodeForFailure,
  errorCodeForHttp,
  FIRST_BYTE_TIMEOUT_MS,
  modelFromBody,
  shouldFailoverHttp,
  upstreamRequestUrl,
} from './policy'

const MAX_BODY_BYTES = 8 * 1024 * 1024
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
  'authorization',
])

export type UpstreamTarget = {
  id: string
  baseUrl: string
  apiKey: string
  queryParams?: Record<string, string>
}

export type RoutingProxyDeps = {
  listCandidates: () => Promise<string[]>
  resolveUpstream: (id: string) => Promise<UpstreamTarget | null>
  admit: (id: string) => boolean
  recordSuccess: (id: string) => void
  recordFailure: (id: string) => void
  log: (entry: Omit<RoutingLogEntry, 'at'> & { at?: string }) => void
  now?: () => number
  fetch?: typeof fetch
}

type BufferedResponse = {
  status: number
  body: Buffer
  headers: Record<string, string>
  errorCode: string
}

export class RoutingProxy {
  private server: Server | null = null
  private port: number | null = null

  constructor(private readonly deps: RoutingProxyDeps) {}

  getPort(): number | null {
    return this.port
  }

  async listen(host: string, preferredPort: number | null): Promise<number> {
    if (this.server && this.port != null) return this.port
    try {
      return await this.bind(host, preferredPort && preferredPort > 0 ? preferredPort : 0)
    } catch (error) {
      if (preferredPort && preferredPort > 0) return this.bind(host, 0)
      throw error
    }
  }

  async close(): Promise<void> {
    const server = this.server
    this.server = null
    this.port = null
    if (!server) return
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }

  private async bind(host: string, port: number): Promise<number> {
    const server = createServer((req, res) => {
      void this.handle(req, res)
    })
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off('listening', onListening)
        reject(error)
      }
      const onListening = () => {
        server.off('error', onError)
        resolve()
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(port, host)
    })
    const address = server.address()
    if (!address || typeof address === 'string') {
      server.close()
      throw new Error('routing proxy failed to bind')
    }
    this.server = server
    this.port = address.port
    return address.port
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    const route = classifyProxyPath(pathname)
    if (!route) {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end('{"error":{"message":"Not found"}}')
      return
    }
    const body = await readBody(req)
    const model = modelFromBody(body, headerValue(req.headers['content-type']))
    const candidates = await this.deps.listCandidates()
    let lastFailure: BufferedResponse | null = null
    for (const id of candidates) {
      if (res.writableEnded) return
      if (!this.deps.admit(id)) {
        this.record(id, model, 0, 'breaker_open', Date.now())
        continue
      }
      const upstream = await this.deps.resolveUpstream(id)
      if (!upstream) {
        this.deps.recordFailure(id)
        this.record(id, model, 0, 'unresolved', Date.now())
        continue
      }
      const started = this.now()
      try {
        const result = await this.forward(req, res, upstream, pathname, body)
        if (result.kind === 'streamed') {
          this.deps.recordSuccess(id)
          this.record(id, model, result.status, '', started)
          return
        }
        if (result.kind === 'passthrough') {
          this.deps.recordSuccess(id)
          this.record(id, model, result.status, '', started)
          writeBuffered(res, result)
          return
        }
        this.deps.recordFailure(id)
        this.record(id, model, result.status, result.errorCode, started)
        lastFailure = result
      } catch (error) {
        this.deps.recordFailure(id)
        const errorCode = errorCodeForFailure(error)
        this.record(id, model, 0, errorCode, started)
        lastFailure = {
          status: 502,
          body: Buffer.from(`{"error":{"message":"${errorCode}"}}`),
          headers: { 'content-type': 'application/json' },
          errorCode,
        }
      }
    }
    if (res.writableEnded) return
    if (lastFailure) {
      writeBuffered(res, lastFailure)
      return
    }
    res.writeHead(503, { 'content-type': 'application/json' })
    res.end('{"error":{"message":"No upstream available"}}')
  }

  private async forward(
    incoming: IncomingMessage,
    outgoing: ServerResponse,
    upstream: UpstreamTarget,
    pathname: string,
    body: Buffer,
  ): Promise<{ kind: 'streamed'; status: number } | { kind: 'passthrough' } & BufferedResponse | BufferedResponse & { kind: 'failover' }> {
    const url = upstreamRequestUrl(upstream.baseUrl, pathname, upstream.queryParams)
    const headers = outboundHeaders(incoming.headers, upstream.apiKey)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FIRST_BYTE_TIMEOUT_MS)
    const onClientClose = () => controller.abort()
    incoming.on('close', onClientClose)
    try {
      const response = await (this.deps.fetch ?? fetch)(url, {
        method: incoming.method ?? 'GET',
        headers,
        body: incoming.method === 'GET' || incoming.method === 'HEAD' ? undefined : new Uint8Array(body),
        signal: controller.signal,
      })
      if (shouldFailoverHttp(response.status)) {
        const buffered = await bufferResponse(response, errorCodeForHttp(response.status))
        return { kind: 'failover', ...buffered }
      }
      if (!response.ok) {
        return { kind: 'passthrough', ...(await bufferResponse(response, '')) }
      }
      const streamed = await pipeSuccess(response, outgoing, controller, timer)
      if (!streamed) {
        return {
          kind: 'failover',
          status: 502,
          body: Buffer.from('{"error":{"message":"stream"}}'),
          headers: { 'content-type': 'application/json' },
          errorCode: 'stream',
        }
      }
      return { kind: 'streamed', status: response.status }
    } finally {
      clearTimeout(timer)
      incoming.off('close', onClientClose)
    }
  }

  private record(providerId: string, model: string, status: number, errorCode: string, started: number): void {
    this.deps.log({
      providerId,
      model,
      status,
      latencyMs: Math.max(0, this.now() - started),
      errorCode,
    })
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }
}

function writeBuffered(res: ServerResponse, result: BufferedResponse): void {
  if (res.writableEnded || res.headersSent) return
  res.writeHead(result.status, result.headers)
  res.end(result.body)
}

async function bufferResponse(response: Response, errorCode: string): Promise<BufferedResponse> {
  return {
    status: response.status,
    body: Buffer.from(await response.arrayBuffer()),
    headers: responseHeaders(response.headers),
    errorCode,
  }
}

async function pipeSuccess(
  response: Response,
  outgoing: ServerResponse,
  controller: AbortController,
  firstByteTimer: ReturnType<typeof setTimeout>,
): Promise<boolean> {
  const headers = responseHeaders(response.headers)
  const body = response.body
  if (!body) {
    clearTimeout(firstByteTimer)
    outgoing.writeHead(response.status, headers)
    outgoing.end()
    return true
  }
  const reader = body.getReader()
  let first = true
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (first) {
        clearTimeout(firstByteTimer)
        outgoing.writeHead(response.status, headers)
        first = false
      }
      if (value && value.length > 0) outgoing.write(Buffer.from(value))
    }
    if (first) {
      clearTimeout(firstByteTimer)
      outgoing.writeHead(response.status, headers)
    }
    outgoing.end()
    return true
  } catch {
    if (first) {
      controller.abort()
      return false
    }
    if (!outgoing.writableEnded) outgoing.end()
    return true
  }
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) {
      throw new Error('request too large')
    }
    chunks.push(buffer)
  }
  return chunks.length === 1 ? chunks[0] : Buffer.concat(chunks)
}

function outboundHeaders(source: IncomingMessage['headers'], apiKey: string): Record<string, string> {
  const headers = copyHeaders(source)
  if (apiKey) headers.authorization = `Bearer ${apiKey}`
  return headers
}

function copyHeaders(source: IncomingMessage['headers']): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(source)) {
    if (!value || HOP_BY_HOP.has(key.toLowerCase())) continue
    headers[key] = Array.isArray(value) ? value.join(', ') : value
  }
  return headers
}

function responseHeaders(source: Headers): Record<string, string> {
  const headers: Record<string, string> = {}
  source.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return
    headers[key] = value
  })
  return headers
}

function headerValue(value: string | string[] | undefined): string {
  if (!value) return ''
  return Array.isArray(value) ? value.join(', ') : value
}
