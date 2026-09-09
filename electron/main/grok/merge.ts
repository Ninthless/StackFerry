import { ROUTER_BIND_HOST, ROUTER_PROVIDER_KEY, ROUTER_PROVIDER_NAME } from '../../../shared/routing'
import { GROK_OFFICIAL_DEFAULT_MODEL } from '../../../shared/grok-presets'
import {
  GROK_OVERLAY_ROOT_TABLES,
  parseGrokSession,
  type GrokSession,
  type GrokSessionInput,
} from '../../../shared/grok-session'
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
const OWNED_MODELS_PIN_KEYS = new Set(['default', ...AUX_MODEL_KEYS])
const OWNED_UI_PIN_KEYS = new Set(['fork_secondary_model', 'permission_mode'])

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
  const session = parseGrokSession(input)
  if (session.overlay) applyOverlayRoot(next, session.overlay)
  const key = attachDirectModel(next, input, directTable(input, session))
  pinLiveModel(next, key, session)
  return next
}

export function applyOfficialModel(doc: TomlTable, previousDefault = ''): TomlTable {
  const next = cloneDoc(doc)
  const fromLegacyMeta = leftoverPreviousDefault(next)
  const owned = stripStackferryOwned(next)
  unpinByokAuth(next)
  unpinLiveModel(next, owned)
  setDefaultModel(next, previousDefault || fromLegacyMeta || GROK_OFFICIAL_DEFAULT_MODEL)
  return next
}

export function applyRouterModel(doc: TomlTable, input: GrokRouterLiveConfig): TomlTable {
  const next = cloneDoc(doc)
  stripStackferryOwned(next)
  unpinByokAuth(next)
  const session = parseGrokSession(input)
  if (session.overlay) applyOverlayRoot(next, session.overlay)
  const table: TomlTable = {
    name: ROUTER_PROVIDER_NAME,
    model: input.model,
    base_url: `http://${ROUTER_BIND_HOST}:${input.port}/v1`,
    api_backend: 'responses',
    api_key: 'stackferry-router',
  }
  applySession(table, session)
  ensureModelTable(next)[ROUTER_PROVIDER_KEY] = table
  pinLiveModel(next, ROUTER_PROVIDER_KEY, session)
  return next
}

function directTable(input: GrokDirectLiveConfig, session: GrokSession): TomlTable {
  const table: TomlTable = {
    name: input.name,
    model: input.model,
    base_url: input.baseUrl,
    api_backend: input.apiBackend,
  }
  if (input.apiKey.trim()) table.api_key = input.apiKey.trim()
  applySession(table, session)
  return table
}

function applySession(table: TomlTable, session: GrokSession): void {
  if (session.overlay) {
    for (const [key, value] of Object.entries(session.overlay)) {
      if (GROK_OVERLAY_ROOT_TABLES.has(key) || OWNED_MODEL_KEYS.has(key)) continue
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

function applyOverlayRoot(doc: TomlTable, overlay: TomlTable): void {
  mergeOverlayTable(doc, 'models', overlay.models, OWNED_MODELS_PIN_KEYS)
  mergeOverlayTable(doc, 'ui', overlay.ui, OWNED_UI_PIN_KEYS)
  mergeOverlayTable(doc, 'permission', overlay.permission, new Set())
}

function mergeOverlayTable(
  doc: TomlTable,
  key: string,
  incoming: unknown,
  skip: Set<string>,
): void {
  if (!isPlainObject(incoming)) return
  const entries = Object.entries(incoming).filter(([field]) => !skip.has(field))
  if (entries.length === 0) return
  const next: TomlTable = isPlainObject(doc[key]) ? { ...doc[key] } : {}
  for (const [field, value] of entries) {
    next[field] = structuredClone(value)
  }
  doc[key] = next
}

// Grok 内置 / 预取 catalog 以 grok- 开头。同名 [model.*] 覆盖那一项，不必再挂 Custom。
function grokCatalogKey(model: string): string {
  const key = model.trim()
  if (!key || isStackferryModelKey(key) || key === ROUTER_PROVIDER_KEY) return ''
  if (key === 'grok' || key.startsWith('grok-') || key.startsWith('grok.')) return key
  return ''
}

function attachDirectModel(doc: TomlTable, input: GrokDirectLiveConfig, table: TomlTable): string {
  const models = ensureModelTable(doc)
  const catalog = grokCatalogKey(input.model)
  if (catalog) {
    const overlay = { ...table }
    delete overlay.name
    models[catalog] = overlay
    doc[STACKFERRY_META_TABLE] = { owned: [catalog] }
    return catalog
  }
  const key = grokModelKey(input.id)
  models[key] = table
  return key
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
function pinLiveModel(doc: TomlTable, key: string, session: GrokSession): void {
  const models = ensureModelsTable(doc)
  models.default = key
  for (const field of AUX_MODEL_KEYS) models[field] = key
  if (session.effortLevel) models.default_reasoning_effort = session.effortLevel
  const ui = ensureUiTable(doc)
  ui.fork_secondary_model = key
  // Grok 的 permission_mode 是用户级 [ui] 键，不能写到 [model.*]。
  if (session.permissionMode) ui.permission_mode = session.permissionMode
  else delete ui.permission_mode
}

function unpinLiveModel(doc: TomlTable, owned: Set<string> = new Set()): void {
  const isOwnedPin = (value: string) => isStackferryModelKey(value) || owned.has(value)
  const models = doc.models
  if (isPlainObject(models)) {
    for (const field of AUX_MODEL_KEYS) {
      if (typeof models[field] === 'string' && isOwnedPin(models[field])) {
        delete models[field]
      }
    }
  }
  const ui = doc.ui
  if (
    isPlainObject(ui) &&
    typeof ui.fork_secondary_model === 'string' &&
    isOwnedPin(ui.fork_secondary_model)
  ) {
    delete ui.fork_secondary_model
  }
  if (isPlainObject(ui) && Object.keys(ui).length === 0) delete doc.ui
}

function stripStackferryOwned(doc: TomlTable): Set<string> {
  const owned = ownedCatalogKeys(doc)
  const models = doc.model
  if (isPlainObject(models)) {
    for (const key of Object.keys(models)) {
      if (!isStackferryModelKey(key)) continue
      const table = models[key]
      if (isPlainObject(table) && typeof table.model === 'string') {
        const catalog = grokCatalogKey(table.model)
        if (catalog) owned.add(catalog)
      }
      delete models[key]
    }
    for (const key of owned) delete models[key]
    if (Object.keys(models).length === 0) delete doc.model
  }
  delete doc[STACKFERRY_META_TABLE]
  return owned
}

function ownedCatalogKeys(doc: TomlTable): Set<string> {
  const owned = new Set<string>()
  const meta = doc[STACKFERRY_META_TABLE]
  if (!isPlainObject(meta) || !Array.isArray(meta.owned)) return owned
  for (const key of meta.owned) {
    if (typeof key === 'string' && key.trim()) owned.add(key.trim())
  }
  return owned
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
