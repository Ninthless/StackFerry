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
    throw new Error('请填写 API Key')
  }
  const provider = await store.peek(input.providerId)
  const stored = store.decryptApiKey(provider)
  if (!stored) {
    throw new Error('请填写 API Key')
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
      throw new Error('认证失败，请检查 API Key')
    }
    if (response.status === 404 || response.status === 405) {
      throw new Error('该端点不支持 /v1/models，请手动输入模型 ID')
    }
    if (!response.ok) {
      throw new Error(`获取模型列表失败（${response.status}）`)
    }
    return await response.json()
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('获取模型列表超时')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}
