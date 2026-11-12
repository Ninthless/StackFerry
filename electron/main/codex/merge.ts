import {
  ROUTER_BIND_HOST,
  ROUTER_PROVIDER_NAME,
} from '../../../shared/routing'
import { AppError } from '../../../shared/app-error'
import { catalogPathForToml, isOwnedCatalogPath } from '../../../shared/codex-models'
import { normalizeModelEntries, type ModelEntry } from '../../../shared/model-entry'
import {
  isPlainObject,
  overlayUsesExternalAuth,
  parseProviderOverlay,
  parseToml,
  stringifyToml,
  type TomlTable,
} from '../../../shared/provider-overlay'

export type { TomlTable }
export { parseToml, stringifyToml }

export const STACKFERRY_PREFIX = 'stackferry_'
export const STACKFERRY_LEGACY_LIVE_PROVIDER_KEY = 'custom'
export const STACKFERRY_LIVE_PROVIDER_KEY = 'stackferry'
export const OFFICIAL_MODEL_PROVIDER = 'openai'

export type CatalogLiveConfig = {
  catalogPath?: string
  models?: readonly ModelEntry[]
}

export type RouterLiveConfig = {
  port: number
  tomlText: string
} & CatalogLiveConfig

export type ThirdPartyLiveConfig = {
  id: string
  name: string
  tomlText: string
  apiKey: string
} & CatalogLiveConfig

export function providerKey(id: string): string {
  return `${STACKFERRY_PREFIX}${id.replaceAll('-', '')}`
}

export function isLegacyOwnedCodexProviderKey(key: string): boolean {
  return key === STACKFERRY_LEGACY_LIVE_PROVIDER_KEY || key.startsWith(STACKFERRY_PREFIX)
}

export function isMovableCodexProviderKey(key: string): boolean {
  return key !== STACKFERRY_LIVE_PROVIDER_KEY && isOwnedCodexProviderKey(key)
}

export function isOwnedCodexProviderKey(key: string): boolean {
  return key === STACKFERRY_LIVE_PROVIDER_KEY || isLegacyOwnedCodexProviderKey(key)
}

export function applyThirdPartyProvider(doc: TomlTable, input: ThirdPartyLiveConfig): TomlTable {
  const overlay = parseProviderOverlay(input.tomlText)
  if (overlay.table.wire_api === 'chat') {
    throw new AppError('overlay_wire_api')
  }
  const next = cloneDoc(doc)
  const providers = ensureProviderTable(next)
  const table: TomlTable = {
    ...overlay.table,
    name: typeof overlay.table.name === 'string' && overlay.table.name.trim()
      ? overlay.table.name.trim()
      : input.name,
  }
  if (input.apiKey.trim() && !overlayUsesExternalAuth(table)) {
    table.experimental_bearer_token = input.apiKey.trim()
  }
  providers[STACKFERRY_LIVE_PROVIDER_KEY] = structuredClone(table)
  next.model_provider = STACKFERRY_LIVE_PROVIDER_KEY
  delete next.openai_base_url
  applySessionKeys(next, overlay)
  applyCatalogPointer(next, input)
  return next
}

export function applyGatewayBase(doc: TomlTable, port: number, model = ''): TomlTable {
  const next = cloneDoc(doc)
  next.model_provider = OFFICIAL_MODEL_PROVIDER
  next.openai_base_url = gatewayBaseUrl(port)
  const trimmed = model.trim()
  if (trimmed) next.model = trimmed
  return next
}

export function gatewayBaseUrl(port: number): string {
  return `http://${ROUTER_BIND_HOST}:${port}/v1`
}

export function applyOfficialProvider(doc: TomlTable, catalogPath?: string): TomlTable {
  const next = cloneDoc(doc)
  next.model_provider = OFFICIAL_MODEL_PROVIDER
  applyCatalogPointer(next, { catalogPath, models: [] })
  return next
}

export function applyRouterProvider(doc: TomlTable, input: RouterLiveConfig): TomlTable {
  const overlay = parseProviderOverlay(input.tomlText)
  const next = cloneDoc(doc)
  const providers = ensureProviderTable(next)
  providers[STACKFERRY_LIVE_PROVIDER_KEY] = {
    name: ROUTER_PROVIDER_NAME,
    base_url: gatewayBaseUrl(input.port),
    wire_api: 'responses',
  }
  next.model_provider = STACKFERRY_LIVE_PROVIDER_KEY
  delete next.openai_base_url
  applySessionKeys(next, overlay)
  applyCatalogPointer(next, input)
  return next
}

function applyCatalogPointer(doc: TomlTable, input: CatalogLiveConfig): void {
  const catalogPath = input.catalogPath?.trim() ?? ''
  if (!catalogPath) return
  if (normalizeModelEntries(input.models).length > 0) {
    doc.model_catalog_json = catalogPathForToml(catalogPath)
    return
  }
  if (isOwnedCatalogPath(doc.model_catalog_json, catalogPath)) {
    delete doc.model_catalog_json
  }
}

function ensureProviderTable(doc: TomlTable): TomlTable {
  const existing = doc.model_providers
  if (isPlainObject(existing)) return existing
  const created: TomlTable = {}
  doc.model_providers = created
  return created
}

function cloneDoc(doc: TomlTable): TomlTable {
  return structuredClone(doc)
}

function applySessionKeys(doc: TomlTable, overlay: ReturnType<typeof parseProviderOverlay>): void {
  setOrDelete(doc, 'model', overlay.model || undefined)
  setOrDelete(doc, 'model_reasoning_effort', overlay.reasoningEffort || undefined)
  setOrDelete(doc, 'model_context_window', overlay.contextWindow ?? undefined)
  setOrDelete(doc, 'model_auto_compact_token_limit', overlay.autoCompact ?? undefined)
  setOrDelete(doc, 'approval_policy', overlay.approvalPolicy || undefined)
}

function setOrDelete(doc: TomlTable, key: string, value: string | number | undefined): void {
  if (value === undefined) {
    delete doc[key]
    return
  }
  doc[key] = value
}
