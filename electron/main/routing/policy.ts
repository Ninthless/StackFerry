import type { ProviderKind } from '../../../shared/types'

export const FIRST_BYTE_TIMEOUT_MS = 15_000

export type EnableAction = 'official' | 'direct' | 'router'

export type EnablePlan = {
  action: EnableAction
  needsRestart: boolean
}

export type QueuePlan =
  | { action: 'none' }
  | { action: 'enter-router'; needsRestart: true }
  | { action: 'leave-router'; needsRestart: true }

export function planEnable(
  kind: ProviderKind,
  queueLength: number,
  needsRouter = false,
): EnablePlan {
  if (kind === 'official') return { action: 'official', needsRestart: true }
  if (queueLength < 1 && !needsRouter) return { action: 'direct', needsRestart: true }
  return { action: 'router', needsRestart: true }
}

export function planAfterQueueChange(input: {
  queueLength: number
  routerLive: boolean
  activeKind: ProviderKind | null
  needsRouter?: boolean
}): QueuePlan {
  const stayOnRouter = input.queueLength >= 1 || Boolean(input.needsRouter)
  if (stayOnRouter && !input.routerLive && input.activeKind === 'custom') {
    return { action: 'enter-router', needsRestart: true }
  }
  if (!stayOnRouter && input.routerLive) {
    return { action: 'leave-router', needsRestart: true }
  }
  return { action: 'none' }
}

export function planQuit(
  routerLive: boolean,
  needsRouter = false,
): 'restore-direct' | 'keep-router' | 'none' {
  if (!routerLive) return 'none'
  return needsRouter ? 'keep-router' : 'restore-direct'
}

export function requestOrder(activeCustomId: string | null, queue: string[]): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  const push = (id: string) => {
    if (!id || seen.has(id)) return
    seen.add(id)
    ordered.push(id)
  }
  if (activeCustomId && !queue.includes(activeCustomId)) push(activeCustomId)
  for (const id of queue) push(id)
  return ordered
}

/** 已在队列中的供应商被启用时提到队首，避免「当前上游」和尝试顺序不一致。 */
export function queueAfterEnable(queue: string[], id: string): string[] {
  if (!queue.includes(id) || queue[0] === id) return queue
  return [id, ...queue.filter((item) => item !== id)]
}

export function displayQueue(activeCustomId: string | null, queue: string[]): string[] {
  if (queue.length === 0) return []
  return requestOrder(activeCustomId, queue)
}

export function shouldFailoverHttp(status: number): boolean {
  // 只换上游处理限流和上游故障。400 字段错误换了仍会失败，还会打穿 prompt cache。
  return status === 429 || status >= 500
}

export type ProxyRoute = 'responses' | 'models' | 'messages'

export function classifyProxyPath(pathname: string): ProxyRoute | null {
  const normalized = pathname.replace(/\/+$/, '') || '/'
  if (normalized === '/v1/responses') return 'responses'
  if (normalized === '/v1/models') return 'models'
  if (normalized === '/v1/messages') return 'messages'
  return null
}

export function upstreamProxyPath(pathname: string, wireApi: 'responses' | 'chat'): string {
  if (wireApi === 'chat' && classifyProxyPath(pathname) === 'responses') {
    return '/v1/chat/completions'
  }
  return pathname
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
