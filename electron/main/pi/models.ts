import { AppError } from '../../../shared/app-error'
import { piModelsRequest } from '../../../shared/pi-models'
import { parseModelsResponse } from '../../../shared/provider-models'
import { isPiApi, type PiApi } from '../../../shared/types'
import { outboundFetch } from '../egress/fetch'
import type { PiProviderStore } from './store'

const FETCH_TIMEOUT_MS = 15_000

export type ListPiModelsInput = {
  baseUrl: string
  api?: PiApi
  apiKey?: string
  providerId?: string
}

export async function listPiModels(store: PiProviderStore, input: ListPiModelsInput): Promise<string[]> {
  const auth = await resolvePiModelsAuth(store, input)
  const request = piModelsRequest(input.baseUrl, auth.api, auth.apiKey)
  return parseModelsResponse(await fetchPiModelsJson(request.url, request.headers))
}

async function resolvePiModelsAuth(
  store: PiProviderStore,
  input: ListPiModelsInput,
): Promise<{ api: PiApi; apiKey: string }> {
  const typed = input.apiKey?.trim() ?? ''
  const requested = isPiApi(input.api) ? input.api : undefined
  if (typed && requested) return { api: requested, apiKey: typed }
  if (!input.providerId) {
    if (!typed) throw new AppError('models_missing_api_key')
    if (!requested) throw new AppError('pi_api')
    return { api: requested, apiKey: typed }
  }
  const provider = await store.peek(input.providerId)
  const apiKey = typed || store.decryptApiKey(provider)
  if (!apiKey) throw new AppError('models_missing_api_key')
  return { api: requested ?? provider.api, apiKey }
}

async function fetchPiModelsJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await outboundFetch(url, { method: 'GET', headers, signal: controller.signal })
    if (response.status === 401 || response.status === 403) throw new AppError('models_auth')
    if (response.status === 404 || response.status === 405) throw new AppError('models_unsupported_endpoint')
    if (!response.ok) throw new AppError('models_http', { status: String(response.status) })
    return await response.json()
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new AppError('models_timeout')
    throw error
  } finally {
    clearTimeout(timer)
  }
}
