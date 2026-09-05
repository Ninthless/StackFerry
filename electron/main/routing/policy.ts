import type { ProviderKind } from '../../../shared/types'

export const FIRST_BYTE_TIMEOUT_MS = 15_000

export type EnableAction = 'official' | 'direct' | 'router' | 'pointer'

export type EnablePlan = {
  action: EnableAction
  needsRestart: boolean
}

export type QueuePlan =
  | { action: 'none' }
  | { action: 'enter-router'; needsRestart: true }
  | { action: 'leave-router'; needsRestart: true }

export function planEnable(kind: ProviderKind, queueLength: number, routerLive: boolean): EnablePlan {
  if (kind === 'official') return { action: 'official', needsRestart: true }
  if (queueLength < 1) return { action: 'direct', needsRestart: true }
  if (routerLive) return { action: 'pointer', needsRestart: false }
  return { action: 'router', needsRestart: true }
}

export function planAfterQueueChange(input: {
  queueLength: number
  routerLive: boolean
  activeKind: ProviderKind | null
}): QueuePlan {
  if (input.queueLength >= 1 && !input.routerLive && input.activeKind === 'custom') {
    return { action: 'enter-router', needsRestart: true }
  }
  if (input.queueLength < 1 && input.routerLive) {
    return { action: 'leave-router', needsRestart: true }
  }
  return { action: 'none' }
}

export function planQuit(routerLive: boolean): 'restore-direct' | 'none' {
  return routerLive ? 'restore-direct' : 'none'
}

export function requestOrder(activeCustomId: string | null, queue: string[]): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  const push = (id: string) => {
    if (!id || seen.has(id)) return
    seen.add(id)
    ordered.push(id)
  }
  if (activeCustomId) push(activeCustomId)
  for (const id of queue) push(id)
  return ordered
}

export function shouldFailoverHttp(status: number): boolean {
  return status === 429 || status >= 500
}

export function classifyProxyPath(pathname: string): 'responses' | 'models' | null {
  const normalized = pathname.replace(/\/+$/, '') || '/'
  if (normalized === '/v1/responses') return 'responses'
  if (normalized === '/v1/models') return 'models'
  return null
}

export function upstreamRequestUrl(
  baseUrl: string,
  incomingPath: string,
  queryParams?: Record<string, string>,
): string {
  const parsed = new URL(baseUrl)
  const basePath = parsed.pathname.replace(/\/+$/, '')
  const suffix = incomingPath.replace(/^\/v1\/?/, '').replace(/^\/+/, '')
  parsed.pathname = suffix ? `${basePath}/${suffix}` : basePath
  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      parsed.searchParams.set(key, value)
    }
  }
  parsed.hash = ''
  return parsed.toString()
}

export function modelFromBody(body: Buffer, contentType: string): string {
  if (!contentType.toLowerCase().includes('json') || body.length === 0) return ''
  try {
    const parsed = JSON.parse(body.toString('utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return ''
    const model = (parsed as { model?: unknown }).model
    return typeof model === 'string' ? model.trim() : ''
  } catch {
    return ''
  }
}

export function errorCodeForHttp(status: number): string {
  return `http_${status}`
}

export function errorCodeForFailure(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error) {
    const name = String((error as { name: unknown }).name)
    if (name === 'AbortError' || name === 'TimeoutError') return 'timeout'
  }
  return 'network'
}
