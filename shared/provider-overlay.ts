import { parse, stringify } from 'smol-toml'

export type TomlTable = Record<string, unknown>

export const RESERVED_PROVIDER_IDS = new Set(['openai', 'ollama', 'lmstudio'])
export const REASONING_EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh'] as const
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number]

const ALLOWED_TOP_LEVEL = new Set([
  'model',
  'model_provider',
  'model_providers',
  'model_reasoning_effort',
  'model_context_window',
  'model_auto_compact_token_limit',
])

export type ProviderOverlay = {
  model: string
  reasoningEffort: string
  contextWindow: number | null
  autoCompact: number | null
  tableKey: string
  table: TomlTable
}

export type OverlaySession = {
  model: string
  reasoningEffort: string
  contextWindow: string
  autoCompact: string
}

export type OverlaySummary = {
  model: string
  baseUrl: string
  usesExternalAuth: boolean
}

export function isPlainObject(value: unknown): value is TomlTable {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseToml(text: string): TomlTable {
  const trimmed = text.trim()
  if (!trimmed) return {}
  try {
    const parsed = parse(trimmed)
    if (!isPlainObject(parsed)) {
      throw new Error('TOML 根节点必须是表')
    }
    return parsed
  } catch (error) {
    if (error instanceof Error && error.message === 'TOML 根节点必须是表') throw error
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`TOML 无法解析：${detail}`)
  }
}

export function stringifyToml(doc: TomlTable): string {
  const rendered = stringify(doc).trim()
  return rendered ? `${rendered}\n` : ''
}

export function formatToml(text: string): string {
  return stringifyToml(parseToml(text))
}

export function starterOverlayToml(input: {
  providerId: string
  name: string
  baseUrl: string
  model: string
}): string {
  const table: TomlTable = {
    name: input.name,
    base_url: input.baseUrl,
    wire_api: 'responses',
  }
  const doc: TomlTable = {
    model_provider: input.providerId,
    model_providers: {
      [input.providerId]: table,
    },
  }
  if (input.model.trim()) doc.model = input.model.trim()
  return stringifyToml(doc)
}

export function parseProviderOverlay(
  text: string,
  options: { requireBaseUrl?: boolean } = {},
): ProviderOverlay {
  const doc = parseToml(text)
  if (Object.keys(doc).length === 0) {
    throw new Error('请填写供应商 TOML 配置')
  }

  for (const key of Object.keys(doc)) {
    if (!ALLOWED_TOP_LEVEL.has(key)) {
      throw new Error(`覆盖片段不支持顶层键 ${key}`)
    }
  }

  const providers = doc.model_providers
  if (!isPlainObject(providers)) {
    throw new Error('请提供一个 [model_providers.<id>] 表')
  }

  const keys = Object.keys(providers)
  if (keys.length !== 1) {
    throw new Error('覆盖片段必须恰好包含一个自定义供应商表')
  }

  const tableKey = keys[0]
  if (RESERVED_PROVIDER_IDS.has(tableKey)) {
    throw new Error(`${tableKey} 是 Codex 内置供应商 ID，请改用其他名称`)
  }

  const table = providers[tableKey]
  if (!isPlainObject(table)) {
    throw new Error('供应商表必须是对象')
  }

  const declaredProvider = asTrimmedString(doc.model_provider)
  if (declaredProvider && declaredProvider !== tableKey) {
    throw new Error('model_provider 必须与 [model_providers.<id>] 的 id 一致')
  }

  const baseUrl = asTrimmedString(table.base_url)
  if ((options.requireBaseUrl ?? true) && !baseUrl) {
    throw new Error('请在 TOML 中填写 base_url')
  }

  const wireApi = table.wire_api
  if (wireApi !== undefined && wireApi !== 'responses') {
    throw new Error('wire_api 仅支持 responses')
  }

  if (hasAuthTable(table) && hasInlineAuth(table)) {
    throw new Error('auth 不能与 env_key / experimental_bearer_token / requires_openai_auth 同时使用')
  }

  return {
    model: asTrimmedString(doc.model),
    reasoningEffort: parseReasoningEffort(doc.model_reasoning_effort),
    contextWindow: parsePositiveInt(doc.model_context_window, 'model_context_window'),
    autoCompact: parsePositiveInt(doc.model_auto_compact_token_limit, 'model_auto_compact_token_limit'),
    tableKey,
    table: { ...table },
  }
}

export function serializeProviderOverlay(overlay: ProviderOverlay): string {
  const doc: TomlTable = {
    model_provider: overlay.tableKey,
    model_providers: {
      [overlay.tableKey]: { ...overlay.table },
    },
  }
  if (overlay.model) doc.model = overlay.model
  if (overlay.reasoningEffort) doc.model_reasoning_effort = overlay.reasoningEffort
  if (overlay.contextWindow != null) doc.model_context_window = overlay.contextWindow
  if (overlay.autoCompact != null) doc.model_auto_compact_token_limit = overlay.autoCompact
  return stringifyToml(doc)
}

export function summarizeProviderOverlay(text: string): OverlaySummary {
  const overlay = parseProviderOverlay(text)
  return {
    model: overlay.model,
    baseUrl: asTrimmedString(overlay.table.base_url),
    usesExternalAuth: overlayUsesExternalAuth(overlay.table),
  }
}

export function overlayRequiresApiKey(text: string): boolean {
  return !overlayUsesExternalAuth(parseProviderOverlay(text).table)
}

export function overlayBaseUrl(text: string): string {
  try {
    return asTrimmedString(parseProviderOverlay(text, { requireBaseUrl: false }).table.base_url)
  } catch {
    return ''
  }
}

export function overlaySession(text: string): OverlaySession {
  try {
    const overlay = parseProviderOverlay(text, { requireBaseUrl: false })
    return {
      model: overlay.model,
      reasoningEffort: overlay.reasoningEffort,
      contextWindow: overlay.contextWindow == null ? '' : String(overlay.contextWindow),
      autoCompact: overlay.autoCompact == null ? '' : String(overlay.autoCompact),
    }
  } catch {
    return { model: '', reasoningEffort: '', contextWindow: '', autoCompact: '' }
  }
}

export function withOverlayBaseUrl(text: string, baseUrl: string): string {
  return patchOverlay(text, (overlay) => {
    overlay.table.base_url = baseUrl.trim()
  })
}

export function withOverlaySession(text: string, patch: Partial<OverlaySession>): string {
  return patchOverlay(text, (overlay) => {
    if (patch.model !== undefined) overlay.model = patch.model.trim()
    if (patch.reasoningEffort !== undefined) overlay.reasoningEffort = patch.reasoningEffort.trim()
    if (patch.contextWindow !== undefined) {
      overlay.contextWindow = parseOptionalPositiveInt(patch.contextWindow, 'model_context_window')
    }
    if (patch.autoCompact !== undefined) {
      overlay.autoCompact = parseOptionalPositiveInt(patch.autoCompact, 'model_auto_compact_token_limit')
    }
  })
}

function patchOverlay(text: string, mutate: (overlay: ProviderOverlay) => void): string {
  const overlay = parseProviderOverlay(text, { requireBaseUrl: false })
  mutate(overlay)
  return serializeProviderOverlay(overlay)
}

export function overlayUsesExternalAuth(table: TomlTable): boolean {
  return Boolean(asTrimmedString(table.env_key) || hasAuthTable(table))
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isReasoningEffort(value: string): value is ReasoningEffort {
  return (REASONING_EFFORTS as readonly string[]).includes(value)
}

function parseReasoningEffort(value: unknown): string {
  const effort = asTrimmedString(value)
  if (!effort) return ''
  if (!isReasoningEffort(effort)) {
    throw new Error('model_reasoning_effort 仅支持 minimal / low / medium / high / xhigh')
  }
  return effort
}

function parsePositiveInt(value: unknown, key: string): number | null {
  if (value === undefined) return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${key} 必须是正整数`)
  }
  return value
}

function parseOptionalPositiveInt(text: string, key: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const value = Number(trimmed)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${key} 必须是正整数`)
  }
  return value
}

function hasAuthTable(table: TomlTable): boolean {
  return isPlainObject(table.auth) && Boolean(asTrimmedString(table.auth.command))
}

function hasInlineAuth(table: TomlTable): boolean {
  return Boolean(
    asTrimmedString(table.env_key) ||
      asTrimmedString(table.experimental_bearer_token) ||
      table.requires_openai_auth === true,
  )
}
