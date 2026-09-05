import { parse, stringify } from 'smol-toml'
import { AppError } from './app-error'

export type TomlTable = Record<string, unknown>

export const RESERVED_PROVIDER_IDS = new Set([
  'openai',
  'ollama',
  'lmstudio',
  'amazon-bedrock',
])
export const REASONING_EFFORTS = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra',
  'persistent',
] as const
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
      throw new AppError('toml_root_not_table')
    }
    return parsed
  } catch (error) {
    if (error instanceof AppError) throw error
    const detail = error instanceof Error ? error.message : String(error)
    throw new AppError('toml_parse_failed', { detail })
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
    throw new AppError('overlay_empty')
  }

  for (const key of Object.keys(doc)) {
    if (!ALLOWED_TOP_LEVEL.has(key)) {
      throw new AppError('overlay_unsupported_top_level', { key })
    }
  }

  const providers = doc.model_providers
  if (!isPlainObject(providers)) {
    throw new AppError('overlay_missing_providers')
  }

  const keys = Object.keys(providers)
  if (keys.length !== 1) {
    throw new AppError('overlay_single_provider')
  }

  const tableKey = keys[0]
  if (RESERVED_PROVIDER_IDS.has(tableKey)) {
    throw new AppError('overlay_reserved_provider_id', { name: tableKey })
  }

  const table = providers[tableKey]
  if (!isPlainObject(table)) {
    throw new AppError('overlay_table_not_object')
  }

  const declaredProvider = asTrimmedString(doc.model_provider)
  if (declaredProvider && declaredProvider !== tableKey) {
    throw new AppError('overlay_provider_mismatch')
  }

  const baseUrl = asTrimmedString(table.base_url)
  if ((options.requireBaseUrl ?? true) && !baseUrl) {
    throw new AppError('overlay_missing_base_url')
  }

  const wireApi = table.wire_api
  if (wireApi !== undefined && wireApi !== 'responses') {
    throw new AppError('overlay_wire_api')
  }

  if (hasAuthTable(table) && hasInlineAuth(table)) {
    throw new AppError('overlay_auth_conflict')
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
    throw new AppError('overlay_invalid_reasoning', {
      allowed: REASONING_EFFORTS.join(' / '),
    })
  }
  return effort
}

function parsePositiveInt(value: unknown, key: string): number | null {
  if (value === undefined) return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new AppError('overlay_positive_int', { key })
  }
  return value
}

function parseOptionalPositiveInt(text: string, key: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const value = Number(trimmed)
  if (!Number.isInteger(value) || value <= 0) {
    throw new AppError('overlay_positive_int', { key })
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
