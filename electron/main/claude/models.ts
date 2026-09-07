import { AppError } from '../../../shared/app-error'
import { isClaudeAuthScheme } from '../../../shared/claude-presets'
import { claudeModelsHeaders, claudeModelsUrl } from '../../../shared/claude-models'
import { parseModelsResponse } from '../../../shared/provider-models'
import type { ClaudeAuthScheme } from '../../../shared/types'
import type { ClaudeProviderStore } from './store'

const FETCH_TIMEOUT_MS = 15_000

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
  const payload = await fetchClaudeModelsJson(url, auth.apiKey, auth.authScheme)
  return parseModelsResponse(payload)
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

async function fetchClaudeModelsJson(
  url: string,
  apiKey: string,
  authScheme: ClaudeAuthScheme,
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: claudeModelsHeaders(apiKey, authScheme),
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
    return await response.json()
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AppError('models_timeout')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}
