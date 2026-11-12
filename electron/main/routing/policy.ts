import type { RoutingGroup } from '../../../shared/routing'
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

export type ProxyRoute = 'responses' | 'models' | 'messages' | 'chat'

export function classifyProxyPath(pathname: string): ProxyRoute | null {
  const normalized = pathname.replace(/\/+$/, '') || '/'
  if (normalized === '/v1/responses') return 'responses'
  if (normalized === '/v1/models') return 'models'
  if (normalized === '/v1/messages') return 'messages'
  if (normalized === '/v1/chat/completions') return 'chat'
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

export type ModelRoute =
  | { kind: 'named'; providerId: string; model: string }
  | { kind: 'group'; groupId: string; model: string }
  | { kind: 'lane' }

export function routeForModel(
  model: string,
  providerIds: readonly string[],
  groups: readonly RoutingGroup[] = [],
): ModelRoute {
  const slash = model.indexOf('/')
  if (slash <= 0 || slash === model.length - 1) return { kind: 'lane' }
  const head = model.slice(0, slash)
  const rest = model.slice(slash + 1)
  if (groups.some((group) => group.id === head)) return { kind: 'group', groupId: head, model: rest }
  if (!providerIds.includes(head)) return { kind: 'lane' }
  return { kind: 'named', providerId: head, model: rest }
}

export function candidatesForRequest(input: {
  model: string
  providerIds: readonly string[]
  groups?: readonly RoutingGroup[]
  stickyId?: string
}): { order: string[]; model: string | null } {
  const groups = input.groups ?? []
  const route = routeForModel(input.model, input.providerIds, groups)
  if (route.kind === 'lane') return { order: [...input.providerIds], model: null }
  if (route.kind === 'named') {
    return { order: namedFailoverOrder(route.providerId, input.providerIds), model: route.model }
  }
  const group = groups.find((item) => item.id === route.groupId)
  return {
    order: group ? groupOrder(group, input.providerIds, input.stickyId) : [],
    model: route.model,
  }
}

export function groupOrder(
  group: RoutingGroup,
  knownIds: readonly string[],
  stickyId?: string,
): string[] {
  const known = new Set(knownIds)
  const members = group.members.filter((id) => known.has(id))
  if (group.strategy !== 'turn' || !stickyId || !members.includes(stickyId)) return members
  return [stickyId, ...members.filter((id) => id !== stickyId)]
}

export function namedFailoverOrder(providerId: string, queue: readonly string[]): string[] {
  const rest = queue.filter((id) => id !== providerId)
  return [providerId, ...rest]
}

export function replaceModelField(body: Buffer, model: string): Buffer | null {
  const text = body.toString('utf8')
  const keyAt = text.search(/"model"\s*:/)
  if (keyAt < 0) return null
  const colonAt = text.indexOf(':', keyAt)
  let valueAt = colonAt + 1
  while (valueAt < text.length && /\s/.test(text[valueAt] ?? '')) valueAt += 1
  if (text[valueAt] !== '"') return null
  let end = valueAt + 1
  while (end < text.length) {
    if (text[end] === '\\') {
      end += 2
      continue
    }
    if (text[end] === '"') break
    end += 1
  }
  if (text[end] !== '"') return null
  return Buffer.from(`${text.slice(0, valueAt)}${JSON.stringify(model)}${text.slice(end + 1)}`)
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
