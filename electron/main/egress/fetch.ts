import { fetch as undiciFetch, ProxyAgent, type RequestInit as UndiciInit } from 'undici'
import { requestBypassesProxy } from '../../../shared/egress-proxy'
import type { EgressProxyStore } from './store'

let store: EgressProxyStore | null = null
let cached: { key: string; agent: ProxyAgent } | null = null

export function bindEgressStore(next: EgressProxyStore): void {
  store = next
  closeOutboundProxy()
}

export function closeOutboundProxy(): void {
  const agent = cached?.agent
  cached = null
  if (agent) void agent.close()
}

export async function outboundFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const href = requestHref(input)
  const route = store ? await store.route() : { proxyUri: null, bypass: '' }
  if (!route.proxyUri || requestBypassesProxy(href, route.bypass)) {
    return fetch(input, init)
  }
  const agent = agentFor(route.proxyUri)
  const response = await undiciFetch(href, undiciInit(init, agent))
  return response as unknown as Response
}

function agentFor(uri: string): ProxyAgent {
  if (cached?.key === uri) return cached.agent
  closeOutboundProxy()
  const agent = new ProxyAgent(uri)
  cached = { key: uri, agent }
  return agent
}

function undiciInit(init: RequestInit | undefined, dispatcher: ProxyAgent): UndiciInit {
  return {
    method: init?.method,
    headers: init?.headers as UndiciInit['headers'],
    body: init?.body as UndiciInit['body'],
    signal: init?.signal,
    dispatcher,
  }
}

function requestHref(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}
