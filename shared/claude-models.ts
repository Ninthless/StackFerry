import { AppError } from './app-error'
import type { ClaudeAuthScheme } from './types'

export const ANTHROPIC_API_VERSION = '2023-06-01'

export function uniqueClaudeModelIds(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const id of ids) {
    const trimmed = id.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

export function persistClaudeModels(
  defaultModel: string | undefined,
  models: readonly unknown[] | undefined,
): { model: string; models: string[] } {
  // 合集为空时不把默认模型塞进去，避免启用后用单条 inferenceModels 盖掉 Desktop 3P / 网关发现。
  const listed = uniqueClaudeModelIds(
    (models ?? []).filter((item): item is string => typeof item === 'string'),
  )
  const fallback = (defaultModel ?? '').trim()
  if (listed.length === 0) {
    return { model: fallback, models: [] }
  }
  const ordered = listed.includes(fallback) ? uniqueClaudeModelIds([fallback, ...listed]) : listed
  return { model: ordered[0] ?? '', models: ordered }
}

export function claudeModelsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim()
  if (!trimmed) {
    throw new AppError('models_missing_base_url')
  }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new AppError('models_invalid_url')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError('models_unsupported_protocol')
  }
  const path = parsed.pathname.replace(/\/+$/, '')
  parsed.pathname = modelsPath(path)
  parsed.search = ''
  parsed.searchParams.set('limit', '1000')
  parsed.hash = ''
  return parsed.toString()
}

export function claudeModelsHeaders(
  apiKey: string,
  authScheme: ClaudeAuthScheme,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'anthropic-version': ANTHROPIC_API_VERSION,
  }
  if (authScheme === 'bearer') {
    headers.Authorization = `Bearer ${apiKey}`
  } else {
    headers['x-api-key'] = apiKey
  }
  return headers
}

function modelsPath(path: string): string {
  if (path.endsWith('/models')) return path
  if (path.endsWith('/v1') || /(^|\/)v1\//.test(path)) return `${path}/models`
  return `${path}/v1/models`
}
