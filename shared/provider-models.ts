import { AppError } from './app-error'

export function modelsUrl(baseUrl: string): string {
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
  parsed.pathname = `${path}/models`
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}

export function parseModelsResponse(payload: unknown): string[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new AppError('models_invalid_payload')
  }
  const ids = payload.data
    .map((item) => (isRecord(item) && typeof item.id === 'string' ? item.id.trim() : ''))
    .filter(Boolean)
  if (ids.length === 0) {
    throw new AppError('models_empty')
  }
  return [...new Set(ids)]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
