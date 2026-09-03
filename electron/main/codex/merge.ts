import { parse, stringify } from 'smol-toml'

export type TomlTable = Record<string, unknown>

export const STACKFERRY_PREFIX = 'stackferry_'
export const OFFICIAL_MODEL_PROVIDER = 'openai'

export type ThirdPartyLiveConfig = {
  id: string
  name: string
  baseUrl: string
  model: string
  apiKey: string
}

export function providerKey(id: string): string {
  return `${STACKFERRY_PREFIX}${id.replaceAll('-', '')}`
}

export function parseToml(text: string): TomlTable {
  const trimmed = text.trim()
  if (!trimmed) return {}
  const parsed = parse(trimmed)
  if (!isPlainObject(parsed)) {
    throw new Error('config.toml 根节点必须是表')
  }
  return parsed
}

export function stringifyToml(doc: TomlTable): string {
  const rendered = stringify(doc).trim()
  return rendered ? `${rendered}\n` : ''
}

export function applyThirdPartyProvider(doc: TomlTable, input: ThirdPartyLiveConfig): TomlTable {
  const next = cloneDoc(doc)
  stripStackferryProviders(next)
  const key = providerKey(input.id)
  const providers = ensureProviderTable(next)
  providers[key] = {
    name: input.name,
    base_url: input.baseUrl,
    wire_api: 'responses',
    experimental_bearer_token: input.apiKey,
  }
  next.model_provider = key
  if (input.model.trim()) {
    next.model = input.model.trim()
  }
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

function isPlainObject(value: unknown): value is TomlTable {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
