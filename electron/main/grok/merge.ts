import { ROUTER_BIND_HOST, ROUTER_PROVIDER_KEY, ROUTER_PROVIDER_NAME } from '../../../shared/routing'
import { GROK_OFFICIAL_DEFAULT_MODEL } from '../../../shared/grok-presets'
import { parseGrokSession, type GrokSessionInput } from '../../../shared/grok-session'
import { isPlainObject, parseToml, stringifyToml, type TomlTable } from '../../../shared/provider-overlay'
import type { GrokApiBackend } from '../../../shared/types'

const OWNED_MODEL_KEYS = new Set([
  'name',
  'model',
  'base_url',
  'api_backend',
  'api_key',
  'reasoning_effort',
  'supports_reasoning_effort',
  'context_window',
  'auto_compact_threshold_percent',
])

const AUX_MODEL_KEYS = ['web_search', 'session_summary', 'image_description'] as const

export type { TomlTable }
export { parseToml, stringifyToml }

export const STACKFERRY_PREFIX = 'stackferry_'
export const STACKFERRY_META_TABLE = 'stackferry'
export const PREFERRED_AUTH_METHOD = 'preferred_method'
export const PREFERRED_API_KEY = 'api_key'

export type GrokDirectLiveConfig = {
  id: string
  name: string
  model: string
  baseUrl: string
  apiBackend: GrokApiBackend
  apiKey: string
} & GrokSessionInput

export type GrokRouterLiveConfig = {
  port: number
  model: string
} & GrokSessionInput

export function grokModelKey(id: string): string {
  return `${STACKFERRY_PREFIX}${id.replaceAll('-', '')}`
}

export function isStackferryModelKey(key: string): boolean {
  return key.startsWith(STACKFERRY_PREFIX)
}

export function grokDefaultModel(doc: TomlTable): string {
  const models = doc.models
  if (!isPlainObject(models) || typeof models.default !== 'string') return ''
  return models.default.trim()
}

export function applyDirectModel(doc: TomlTable, input: GrokDirectLiveConfig): TomlTable {
  const next = cloneDoc(doc)
  stripStackferryOwned(next)
  unpinByokAuth(next)
  const key = grokModelKey(input.id)
  ensureModelTable(next)[key] = directTable(input)
  pinLiveModel(next, key, input)
  return next
}

export function applyOfficialModel(doc: TomlTable, previousDefault = ''): TomlTable {
  const next = cloneDoc(doc)
  const fromLegacyMeta = leftoverPreviousDefault(next)
  stripStackferryOwned(next)
  unpinByokAuth(next)
  unpinLiveModel(next)
  setDefaultModel(next, previousDefault || fromLegacyMeta || GROK_OFFICIAL_DEFAULT_MODEL)
  return next
}

export function applyRouterModel(doc: TomlTable, input: GrokRouterLiveConfig): TomlTable {
  const next = cloneDoc(doc)
  stripStackferryOwned(next)
  unpinByokAuth(next)
  const table: TomlTable = {
    name: ROUTER_PROVIDER_NAME,
    model: input.model,
    base_url: `http://${ROUTER_BIND_HOST}:${input.port}/v1`,
    api_backend: 'responses',
    api_key: 'stackferry-router',
  }
  applySession(table, input)
  ensureModelTable(next)[ROUTER_PROVIDER_KEY] = table
  pinLiveModel(next, ROUTER_PROVIDER_KEY, input)
  return next
}

function directTable(input: GrokDirectLiveConfig): TomlTable {
  const table: TomlTable = {
    name: input.name,
    model: input.model,
    base_url: input.baseUrl,
    api_backend: input.apiBackend,
  }
  if (input.apiKey.trim()) table.api_key = input.apiKey.trim()
  applySession(table, input)
  return table
}

function applySession(table: TomlTable, input: GrokSessionInput): void {
  const session = parseGrokSession(input)
  if (session.overlay) {
    for (const [key, value] of Object.entries(session.overlay)) {
      if (OWNED_MODEL_KEYS.has(key)) continue
      table[key] = structuredClone(value)
    }
  }
  if (session.effortLevel) {
    table.reasoning_effort = session.effortLevel
    table.supports_reasoning_effort = true
  }
  if (session.contextWindow != null) table.context_window = session.contextWindow
  if (session.autoCompact != null) table.auto_compact_threshold_percent = session.autoCompact
}

function ensureModelTable(doc: TomlTable): TomlTable {
  const existing = doc.model
  if (isPlainObject(existing)) return existing
  const created: TomlTable = {}
  doc.model = created
  return created
}

function ensureModelsTable(doc: TomlTable): TomlTable {
  const existing = doc.models
  if (isPlainObject(existing)) return existing
  const created: TomlTable = {}
  doc.models = created
  return created
}

function ensureUiTable(doc: TomlTable): TomlTable {
  const existing = doc.ui
  if (isPlainObject(existing)) return existing
  const created: TomlTable = {}
  doc.ui = created
  return created
}

// 内置 web_search / 摘要 / fork 默认走 grok.com 会话；钉到当前 BYOK 模型，避免 Custom 主会话仍弹出 /login。
function pinLiveModel(doc: TomlTable, key: string, input: GrokSessionInput): void {
  const models = ensureModelsTable(doc)
  models.default = key
  for (const field of AUX_MODEL_KEYS) models[field] = key
  const effort = parseGrokSession(input).effortLevel
  if (effort) models.default_reasoning_effort = effort
  ensureUiTable(doc).fork_secondary_model = key
}

function unpinLiveModel(doc: TomlTable): void {
  const models = doc.models
  if (isPlainObject(models)) {
    for (const field of AUX_MODEL_KEYS) {
      if (typeof models[field] === 'string' && isStackferryModelKey(models[field])) {
        delete models[field]
      }
    }
  }
  const ui = doc.ui
  if (
    isPlainObject(ui) &&
    typeof ui.fork_secondary_model === 'string' &&
    isStackferryModelKey(ui.fork_secondary_model)
  ) {
    delete ui.fork_secondary_model
  }
  if (isPlainObject(ui) && Object.keys(ui).length === 0) delete doc.ui
}

function stripStackferryOwned(doc: TomlTable): void {
  const models = doc.model
  if (isPlainObject(models)) {
    for (const key of Object.keys(models)) {
      if (isStackferryModelKey(key)) delete models[key]
    }
    if (Object.keys(models).length === 0) delete doc.model
  }
  delete doc[STACKFERRY_META_TABLE]
}

function leftoverPreviousDefault(doc: TomlTable): string {
  const meta = doc[STACKFERRY_META_TABLE]
  if (!isPlainObject(meta) || typeof meta.previous_default !== 'string') return ''
  return meta.previous_default.trim()
}

// 全局 preferred_method=api_key 会禁止官方模型走 /login；密钥只写在 StackFerry 模型表上。
function unpinByokAuth(doc: TomlTable): void {
  const gcc = doc.grok_com_config
  if (!isPlainObject(gcc)) return
  if (gcc[PREFERRED_AUTH_METHOD] === PREFERRED_API_KEY) delete gcc[PREFERRED_AUTH_METHOD]
  if (Object.keys(gcc).length === 0) delete doc.grok_com_config
}

function setDefaultModel(doc: TomlTable, id: string): void {
  ensureModelsTable(doc).default = id
}

function cloneDoc(doc: TomlTable): TomlTable {
  return structuredClone(doc)
}
