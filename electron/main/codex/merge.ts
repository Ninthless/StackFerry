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
export const OFFICIAL_MODEL_PROVIDER = 'openai'

export type ThirdPartyLiveConfig = {
  id: string
  name: string
  tomlText: string
  apiKey: string
}

export function providerKey(id: string): string {
  return `${STACKFERRY_PREFIX}${id.replaceAll('-', '')}`
}

export function applyThirdPartyProvider(doc: TomlTable, input: ThirdPartyLiveConfig): TomlTable {
  const overlay = parseProviderOverlay(input.tomlText)
  const next = cloneDoc(doc)
  stripStackferryProviders(next)
  const key = providerKey(input.id)
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
  providers[key] = table
  next.model_provider = key
  applySessionKeys(next, overlay)
  return next
}

export function applyOfficialProvider(doc: TomlTable): TomlTable {
  const next = cloneDoc(doc)
  stripStackferryProviders(next)
  next.model_provider = OFFICIAL_MODEL_PROVIDER
  return next
}

function ensureProviderTable(doc: TomlTable): TomlTable {
  const existing = doc.model_providers
  if (isPlainObject(existing)) return existing
  const created: TomlTable = {}
  doc.model_providers = created
  return created
}

function stripStackferryProviders(doc: TomlTable): void {
  const providers = doc.model_providers
  if (!isPlainObject(providers)) return
  for (const key of Object.keys(providers)) {
    if (key.startsWith(STACKFERRY_PREFIX)) {
      delete providers[key]
    }
  }
  if (Object.keys(providers).length === 0) {
    delete doc.model_providers
  }
}

function cloneDoc(doc: TomlTable): TomlTable {
  return structuredClone(doc)
}

function applySessionKeys(doc: TomlTable, overlay: ReturnType<typeof parseProviderOverlay>): void {
  setOrDelete(doc, 'model', overlay.model || undefined)
  setOrDelete(doc, 'model_reasoning_effort', overlay.reasoningEffort || undefined)
  setOrDelete(doc, 'model_context_window', overlay.contextWindow ?? undefined)
  setOrDelete(doc, 'model_auto_compact_token_limit', overlay.autoCompact ?? undefined)
}

function setOrDelete(doc: TomlTable, key: string, value: string | number | undefined): void {
  if (value === undefined) {
    delete doc[key]
    return
  }
  doc[key] = value
}
