export function modelsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim()
  if (!trimmed) {
    throw new Error('请填写 Base URL')
  }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('Base URL 不是有效地址')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Base URL 仅支持 http 或 https')
  }
  const path = parsed.pathname.replace(/\/+$/, '')
  parsed.pathname = `${path}/models`
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}

export function parseModelsResponse(payload: unknown): string[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error('模型列表格式无法解析')
  }
  const ids = payload.data
    .map((item) => (isRecord(item) && typeof item.id === 'string' ? item.id.trim() : ''))
    .filter(Boolean)
  if (ids.length === 0) {
    throw new Error('模型列表为空')
  }
  return [...new Set(ids)]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
