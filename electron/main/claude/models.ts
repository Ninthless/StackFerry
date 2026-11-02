import { outboundFetch } from '../egress/fetch'
import { AppError } from '../../../shared/app-error'
import { isClaudeAuthScheme } from '../../../shared/claude-presets'
import { claudeModelsHeaders, claudeModelsUrl } from '../../../shared/claude-models'
import type { ClaudeAuthScheme } from '../../../shared/types'
import type { ClaudeProviderStore } from './store'

const FETCH_TIMEOUT_MS = 15_000
const MAX_MODEL_LIST_PAGES = 100

export type ListClaudeModelsInput = {
  baseUrl: string
  apiKey?: string
  providerId?: string
  authScheme?: ClaudeAuthScheme
}

export async function listClaudeModels(
  store: ClaudeProviderStore,
  input: ListClaudeModelsInput,
): Promise<string[]> {
  const url = claudeModelsUrl(input.baseUrl)
  const auth = await resolveClaudeModelsAuth(store, input)
  return fetchClaudeModels(url, auth.apiKey, auth.authScheme)
}

async function resolveClaudeModelsAuth(
  store: ClaudeProviderStore,
  input: ListClaudeModelsInput,
): Promise<{ apiKey: string; authScheme: ClaudeAuthScheme }> {
  const typed = input.apiKey?.trim() ?? ''
  let authScheme = isClaudeAuthScheme(input.authScheme) ? input.authScheme : undefined
  if (typed) {
    return { apiKey: typed, authScheme: authScheme ?? 'bearer' }
  }
  if (!input.providerId) {
    throw new AppError('models_missing_api_key')
  }
  const provider = await store.peek(input.providerId)
  const stored = store.decryptApiKey(provider)
  if (!stored) {
    throw new AppError('models_missing_api_key')
  }
  return {
    apiKey: stored,
    authScheme: authScheme ?? provider.authScheme,
  }
}

async function fetchClaudeModels(
  url: string,
  apiKey: string,
  authScheme: ClaudeAuthScheme,
): Promise<string[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  const headers = claudeModelsHeaders(apiKey, authScheme)
  const models = new Set<string>()
  const cursors = new Set<string>()
  const pageUrl = new URL(url)
  try {
    for (let page = 0; page < MAX_MODEL_LIST_PAGES; page++) {
      const response = await outboundFetch(pageUrl.href, {
        method: 'GET',
        headers,
        signal: controller.signal,
      })
      if (response.status === 401 || response.status === 403) {
        throw new AppError('models_auth')
      }
      if (response.status === 404 || response.status === 405) {
        throw new AppError('models_unsupported_endpoint')
      }
      if (!response.ok) {
        throw new AppError('models_http', { status: String(response.status) })
      }
      const { ids, nextCursor } = parseModelPage(await response.json())
      for (const id of ids) models.add(id)
      if (nextCursor === null) {
        if (models.size === 0) throw new AppError('models_empty')
        return [...models]
      }
      if (cursors.has(nextCursor)) throw new AppError('models_pagination_invalid')
      cursors.add(nextCursor)
      pageUrl.searchParams.set('after_id', nextCursor)
    }
    throw new AppError('models_pagination_limit')
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AppError('models_timeout')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function parseModelPage(payload: unknown): { ids: string[]; nextCursor: string | null } {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new AppError('models_invalid_payload')
  }
  const ids = payload.data
    .map((item) => (isRecord(item) && typeof item.id === 'string' ? item.id.trim() : ''))
    .filter(Boolean)
  if (payload.has_more === undefined || payload.has_more === false) {
    return { ids, nextCursor: null }
  }
  if (payload.has_more !== true || typeof payload.last_id !== 'string' || !payload.last_id.trim()) {
    throw new AppError('models_pagination_invalid')
  }
  return { ids, nextCursor: payload.last_id }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
