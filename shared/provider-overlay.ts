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

export const APPROVAL_POLICIES = ['untrusted', 'on-request', 'never'] as const
export type ApprovalPolicy = (typeof APPROVAL_POLICIES)[number]

const ALLOWED_TOP_LEVEL = new Set([
  'model',
  'model_provider',
  'model_providers',
  'model_reasoning_effort',
  'model_context_window',
  'model_auto_compact_token_limit',
  'approval_policy',
])

export type ProviderOverlay = {
  model: string
  reasoningEffort: string
  contextWindow: number | null
  autoCompact: number | null
  approvalPolicy: string
  tableKey: string
  table: TomlTable
}

export type OverlaySession = {
  model: string
  reasoningEffort: string
  contextWindow: string
  autoCompact: string
  approvalPolicy: string
}

export type OverlaySummary = {
  model: string
  baseUrl: string
  usesExternalAuth: boolean
}

export const OVERLAY_WIRE_APIS = ['responses', 'chat'] as const
export type OverlayWireApi = (typeof OVERLAY_WIRE_APIS)[number]

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
  return stringifyToml(doc).replace(
    /(wire_api = "responses"\n)/,
    '$1http_headers = { "x-openai-actor-authorization" = "custom" }\n',
  )
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

  parseOverlayWireApi(table.wire_api)

  if (hasAuthTable(table) && hasInlineAuth(table)) {
    throw new AppError('overlay_auth_conflict')
  }

  return {
    model: asTrimmedString(doc.model),
    reasoningEffort: parseReasoningEffort(doc.model_reasoning_effort),
    contextWindow: parsePositiveInt(doc.model_context_window, 'model_context_window'),
    autoCompact: parsePositiveInt(doc.model_auto_compact_token_limit, 'model_auto_compact_token_limit'),
    approvalPolicy: parseApprovalPolicy(doc.approval_policy),
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
  if (overlay.approvalPolicy) doc.approval_policy = overlay.approvalPolicy
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

export function overlayWireApi(text: string): OverlayWireApi {
  try {
    return parseOverlayWireApi(
      parseProviderOverlay(text, { requireBaseUrl: false }).table.wire_api,
    )
  } catch (error) {
    if (error instanceof AppError && error.code === 'overlay_wire_api') throw error
    return 'responses'
  }
}

export function overlayNeedsRouter(text: string): boolean {
  try {
    return overlayWireApi(text) === 'chat'
  } catch {
    return false
  }
}

export function isOverlayWireApi(value: unknown): value is OverlayWireApi {
  return value === 'responses' || value === 'chat'
}

export function overlaySession(text: string): OverlaySession {
  try {
    const overlay = parseProviderOverlay(text, { requireBaseUrl: false })
    return {
      model: overlay.model,
      reasoningEffort: overlay.reasoningEffort,
      contextWindow: overlay.contextWindow == null ? '' : String(overlay.contextWindow),
      autoCompact: overlay.autoCompact == null ? '' : String(overlay.autoCompact),
      approvalPolicy: overlay.approvalPolicy,
    }
  } catch {
    return { model: '', reasoningEffort: '', contextWindow: '', autoCompact: '', approvalPolicy: '' }
  }
}

export function withOverlayBaseUrl(text: string, baseUrl: string): string {
  return patchOverlay(text, (overlay) => {
    overlay.table.base_url = baseUrl.trim()
  })
}

export function withOverlayWireApi(text: string, wireApi: OverlayWireApi): string {
  return patchOverlay(text, (overlay) => {
    overlay.table.wire_api = wireApi
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
    if (patch.approvalPolicy !== undefined) overlay.approvalPolicy = parseApprovalPolicy(patch.approvalPolicy)
  })
}

export function suggestedAutoCompactLimit(contextWindow: number): number {
  return Math.max(1, Math.floor((contextWindow * 9) / 10))
}

export function syncedAutoCompactValue(
  nextContextWindow: string,
  previousContextWindow: string,
  currentAutoCompact: string,
): string | undefined {
  const previous = parsedPositiveInt(previousContextWindow)
  const compact = currentAutoCompact.trim()
  const previousSuggested = previous == null ? null : String(suggestedAutoCompactLimit(previous))
  if (compact !== '' && compact !== previousSuggested) return undefined

  const next = parsedPositiveInt(nextContextWindow)
  if (next == null) return compact === '' ? undefined : ''
  return String(suggestedAutoCompactLimit(next))
}

function patchOverlay(text: string, mutate: (overlay: ProviderOverlay) => void): string {
  const overlay = parseProviderOverlay(text, { requireBaseUrl: false })
  mutate(overlay)
  return serializeProviderOverlay(overlay)
}

export function overlayUsesExternalAuth(table: TomlTable): boolean {
  return Boolean(asTrimmedString(table.env_key) || hasAuthTable(table))
}

function parseOverlayWireApi(value: unknown): OverlayWireApi {
  if (value === undefined || value === 'responses') return 'responses'
  if (value === 'chat') return 'chat'
  throw new AppError('overlay_wire_api')
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function isApprovalPolicy(value: string): value is ApprovalPolicy {
  return (APPROVAL_POLICIES as readonly string[]).includes(value)
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

function parseApprovalPolicy(value: unknown): string {
  const policy = asTrimmedString(value)
  if (!policy) return ''
  if (!isApprovalPolicy(policy)) {
    throw new AppError('overlay_invalid_approval', {
      allowed: APPROVAL_POLICIES.join(' / '),
    })
  }
  return policy
}

function parsePositiveInt(value: unknown, key: string): number | null {
  if (value === undefined) return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new AppError('overlay_positive_int', { key })
  }
  return value
}

function parseOptionalPositiveInt(text: string, key: string): number | null {
  const value = parsedPositiveInt(text)
  if (text.trim() && value == null) {
    throw new AppError('overlay_positive_int', { key })
  }
  return value
}

function parsedPositiveInt(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const value = Number(trimmed)
  if (!Number.isInteger(value) || value <= 0) return null
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
