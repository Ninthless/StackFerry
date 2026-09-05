import { AppError } from '../../../shared/app-error'
import { modelsUrl, parseModelsResponse } from '../../../shared/provider-models'
import type { ProviderStore } from './store'

const FETCH_TIMEOUT_MS = 15_000

export type ListModelsInput = {
  baseUrl: string
  apiKey?: string
  providerId?: string
}

export async function listProviderModels(
  store: ProviderStore,
  input: ListModelsInput,
): Promise<string[]> {
  const url = modelsUrl(input.baseUrl)
  const apiKey = await resolveApiKey(store, input)
  const payload = await fetchModelsJson(url, apiKey)
  return parseModelsResponse(payload)
}

async function resolveApiKey(store: ProviderStore, input: ListModelsInput): Promise<string> {
  const typed = input.apiKey?.trim() ?? ''
  if (typed) return typed
  if (!input.providerId) {
    throw new AppError('models_missing_api_key')
  }
  const provider = await store.peek(input.providerId)
  const stored = store.decryptApiKey(provider)
  if (!stored) {
    throw new AppError('models_missing_api_key')
  }
  return stored
}

async function fetchModelsJson(url: string, apiKey: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
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
