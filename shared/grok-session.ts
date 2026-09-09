import { AppError } from './app-error'
import { isGrokApiBackend } from './grok-presets'
import {
  isPlainObject,
  parseToml,
  stringifyToml,
  type TomlTable,
} from './provider-overlay'

export const GROK_EFFORT_LEVELS = ['none', 'low', 'medium', 'high', 'xhigh', 'max'] as const
export type GrokEffortLevel = (typeof GROK_EFFORT_LEVELS)[number]

export const GROK_PERMISSION_MODES = ['ask', 'auto', 'always-approve'] as const
export type GrokPermissionMode = (typeof GROK_PERMISSION_MODES)[number]

export const GROK_COMPACT_MIN = 0
export const GROK_COMPACT_MAX = 100

// [models] / [ui] / [permission] 合入 live config.toml 根表；其余键写入当前供应商的 [model.*]。
export const GROK_OVERLAY_ROOT_TABLES = new Set(['models', 'ui', 'permission'])

// [model] 表由 StackFerry 生成；sandbox / MCP / 认证等表也不进入覆盖片段。
// 根上的标量 model 是当前供应商 [model.*] 的模型 ID，不是那张表。
const GROK_OVERLAY_FORBIDDEN_TOP_LEVEL = new Set([
  'sandbox',
  'grok_com_config',
  'mcp_servers',
  'mcp',
  'telemetry',
  'harness',
  'cli',
  'features',
  'tools',
  'plugins',
  'hooks',
  'session',
  'notifications',
  'shell_environment_policy',
  'requirements',
])

export type GrokSessionInput = {
  effortLevel?: string
  permissionMode?: string
  contextWindow?: string
  autoCompact?: string
  overlayToml?: string
}

export type GrokOverlaySession = {
  effortLevel: string
  permissionMode: string
  contextWindow: string
  autoCompact: string
}

export type GrokOverlayIdentity = {
  name: string
  model: string
  baseUrl: string
  apiBackend: string
}

export type GrokPersistInput = GrokSessionInput & Partial<GrokOverlayIdentity>

export type GrokSession = {
  effortLevel: GrokEffortLevel | ''
  permissionMode: GrokPermissionMode | ''
  contextWindow: number | null
  autoCompact: number | null
  overlay: TomlTable | null
}

export function isGrokEffortLevel(value: string): value is GrokEffortLevel {
  return (GROK_EFFORT_LEVELS as readonly string[]).includes(value)
}

export function isGrokPermissionMode(value: string): value is GrokPermissionMode {
  return (GROK_PERMISSION_MODES as readonly string[]).includes(value)
}

export function parseGrokSession(input: GrokSessionInput): GrokSession {
  const overlay = parseGrokOverlayToml(input.overlayToml)
  const fromOverlay = overlay ? sessionFromOverlay(overlay) : emptyParsedSession()
  return {
    effortLevel: fromOverlay.effortLevel || parseEffort(input.effortLevel),
    permissionMode: fromOverlay.permissionMode || parsePermissionMode(input.permissionMode),
    contextWindow: fromOverlay.contextWindow ?? parseOptionalPositiveInt(input.contextWindow, 'context_window'),
    autoCompact: fromOverlay.autoCompact ?? parseCompactPercent(input.autoCompact),
    overlay,
  }
}

export function parseGrokOverlayToml(text: string | undefined): TomlTable | null {
  const trimmed = text?.trim() ?? ''
  if (!trimmed) return null
  const doc = parseToml(trimmed)
  if (Object.keys(doc).length === 0) return null
  for (const [key, value] of Object.entries(doc)) {
    if (GROK_OVERLAY_ROOT_TABLES.has(key)) {
      if (!isPlainObject(value)) throw new AppError('grok_overlay_table', { key })
      continue
    }
    if (key === 'model' && isPlainObject(value)) {
      throw new AppError('grok_overlay_unsupported_top_level', { key })
    }
    if (GROK_OVERLAY_FORBIDDEN_TOP_LEVEL.has(key)) {
      throw new AppError('grok_overlay_unsupported_top_level', { key })
    }
  }
  return doc
}

export function formatGrokOverlayToml(text: string): string {
  const overlay = parseGrokOverlayToml(text)
  if (!overlay) return ''
  return stringifyToml(overlay)
}

export function grokOverlaySession(text: string): GrokOverlaySession {
  try {
    const overlay = parseGrokOverlayToml(text)
    if (!overlay) return emptyOverlaySession()
    const ui = isPlainObject(overlay.ui) ? overlay.ui : {}
    return {
      effortLevel: asTrimmedString(overlay.reasoning_effort),
      permissionMode: asTrimmedString(ui.permission_mode),
      contextWindow: overlay.context_window == null ? '' : String(overlay.context_window),
      autoCompact:
        overlay.auto_compact_threshold_percent == null
          ? ''
          : String(overlay.auto_compact_threshold_percent),
    }
  } catch {
    return emptyOverlaySession()
  }
}

export function withGrokOverlaySession(text: string, patch: Partial<GrokOverlaySession>): string {
  const overlay = parseGrokOverlayToml(text) ?? {}
  if (patch.effortLevel !== undefined) {
    const effort = parseEffort(patch.effortLevel)
    if (effort) overlay.reasoning_effort = effort
    else delete overlay.reasoning_effort
  }
  if (patch.contextWindow !== undefined) {
    const value = parseOptionalPositiveInt(patch.contextWindow, 'context_window')
    if (value == null) delete overlay.context_window
    else overlay.context_window = value
  }
  if (patch.autoCompact !== undefined) {
    const value = parseCompactPercent(patch.autoCompact)
    if (value == null) delete overlay.auto_compact_threshold_percent
    else overlay.auto_compact_threshold_percent = value
  }
  if (patch.permissionMode !== undefined) applyPermissionPatch(overlay, patch.permissionMode)
  return stringifyToml(overlay)
}

export function grokOverlayIdentity(text: string): GrokOverlayIdentity {
  try {
    const overlay = parseGrokOverlayToml(text)
    if (!overlay) return emptyOverlayIdentity()
    return {
      name: asTrimmedString(overlay.name),
      model: asTrimmedString(overlay.model),
      baseUrl: asTrimmedString(overlay.base_url),
      apiBackend: asTrimmedString(overlay.api_backend),
    }
  } catch {
    return emptyOverlayIdentity()
  }
}

export function withGrokOverlayIdentity(text: string, patch: Partial<GrokOverlayIdentity>): string {
  const overlay = parseGrokOverlayToml(text) ?? {}
  if (patch.name !== undefined) overlay.name = patch.name.trim()
  if (patch.model !== undefined) overlay.model = patch.model.trim()
  if (patch.baseUrl !== undefined) overlay.base_url = patch.baseUrl.trim()
  if (patch.apiBackend !== undefined) {
    const backend = patch.apiBackend.trim()
    if (backend && !isGrokApiBackend(backend)) throw new AppError('grok_api_backend')
    overlay.api_backend = backend
  }
  return stringifyToml(overlay)
}

export function hydrateGrokOverlayIdentity(overlayToml: string, columns: GrokOverlayIdentity): string {
  try {
    const overlay = parseGrokOverlayToml(overlayToml) ?? {}
    const patch: Partial<GrokOverlayIdentity> = {}
    if (!('name' in overlay)) patch.name = columns.name
    if (!('model' in overlay)) patch.model = columns.model
    if (!('base_url' in overlay)) patch.baseUrl = columns.baseUrl
    if (!('api_backend' in overlay)) patch.apiBackend = columns.apiBackend
    if (Object.keys(patch).length === 0) return overlayToml
    return withGrokOverlayIdentity(overlayToml, patch)
  } catch {
    return overlayToml
  }
}

export function hydrateGrokOverlaySession(overlayToml: string, columns: GrokOverlaySession): string {
  const current = grokOverlaySession(overlayToml)
  const patch: Partial<GrokOverlaySession> = {}
  if (!current.effortLevel && columns.effortLevel) patch.effortLevel = columns.effortLevel
  if (!current.permissionMode && columns.permissionMode) patch.permissionMode = columns.permissionMode
  if (!current.contextWindow && columns.contextWindow) patch.contextWindow = columns.contextWindow
  if (!current.autoCompact && columns.autoCompact) patch.autoCompact = columns.autoCompact
  if (Object.keys(patch).length === 0) return overlayToml
  try {
    return withGrokOverlaySession(overlayToml, patch)
  } catch {
    return overlayToml
  }
}

export function hydrateGrokOverlay(
  overlayToml: string,
  columns: GrokOverlayIdentity & GrokOverlaySession,
): string {
  return hydrateGrokOverlaySession(hydrateGrokOverlayIdentity(overlayToml, columns), columns)
}

export function migrateGrokOverlayText(text: string | undefined): string {
  const trimmed = text?.trim() ?? ''
  if (!trimmed) return ''
  if (!trimmed.startsWith('{')) return typeof text === 'string' ? text : trimmed
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!isPlainObject(parsed)) return typeof text === 'string' ? text : trimmed
    if (Object.keys(parsed).length === 0) return ''
    return stringifyToml(parsed)
  } catch {
    return typeof text === 'string' ? text : trimmed
  }
}

export function persistGrokSession(input: GrokPersistInput): {
  effortLevel: string
  permissionMode: string
  contextWindow: string
  autoCompact: string
  overlayToml: string
} {
  const folded = foldColumnsIntoOverlay(input)
  const session = parseGrokSession({ overlayToml: folded })
  return {
    effortLevel: session.effortLevel,
    permissionMode: session.permissionMode,
    contextWindow: session.contextWindow == null ? '' : String(session.contextWindow),
    autoCompact: session.autoCompact == null ? '' : String(session.autoCompact),
    overlayToml: session.overlay ? stringifyToml(session.overlay) : '',
  }
}

function foldColumnsIntoOverlay(input: GrokPersistInput): string {
  let next = input.overlayToml ?? ''
  const identity: Partial<GrokOverlayIdentity> = {}
  if (input.name !== undefined) identity.name = input.name
  if (input.model !== undefined) identity.model = input.model
  if (input.baseUrl !== undefined) identity.baseUrl = input.baseUrl
  if (input.apiBackend !== undefined) identity.apiBackend = input.apiBackend
  if (Object.keys(identity).length > 0) next = withGrokOverlayIdentity(next, identity)
  const session: Partial<GrokOverlaySession> = {}
  if (input.effortLevel !== undefined) session.effortLevel = input.effortLevel
  if (input.permissionMode !== undefined) session.permissionMode = input.permissionMode
  if (input.contextWindow !== undefined) session.contextWindow = input.contextWindow
  if (input.autoCompact !== undefined) session.autoCompact = input.autoCompact
  if (Object.keys(session).length === 0) return next
  return withGrokOverlaySession(next, session)
}

function sessionFromOverlay(overlay: TomlTable): Omit<GrokSession, 'overlay'> {
  const ui = isPlainObject(overlay.ui) ? overlay.ui : {}
  return {
    effortLevel: parseEffort(asTrimmedString(overlay.reasoning_effort)),
    permissionMode: parsePermissionMode(asTrimmedString(ui.permission_mode)),
    contextWindow: parseOverlayPositiveInt(overlay.context_window, 'context_window'),
    autoCompact: parseOverlayCompact(overlay.auto_compact_threshold_percent),
  }
}

function applyPermissionPatch(overlay: TomlTable, raw: string): void {
  const mode = parsePermissionMode(raw)
  const ui = isPlainObject(overlay.ui) ? { ...overlay.ui } : {}
  if (mode) ui.permission_mode = mode
  else delete ui.permission_mode
  if (Object.keys(ui).length === 0) delete overlay.ui
  else overlay.ui = ui
}

function parseEffort(value: string | undefined): GrokEffortLevel | '' {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return ''
  if (!isGrokEffortLevel(trimmed)) throw new AppError('grok_effort')
  return trimmed
}

function parsePermissionMode(value: string | undefined): GrokPermissionMode | '' {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return ''
  if (!isGrokPermissionMode(trimmed)) throw new AppError('grok_permission')
  return trimmed
}

function parseCompactPercent(text: string | undefined): number | null {
  const trimmed = text?.trim() ?? ''
  if (!trimmed) return null
  const value = Number(trimmed)
  if (!Number.isInteger(value) || value < GROK_COMPACT_MIN || value > GROK_COMPACT_MAX) {
    throw new AppError('grok_compact_range', {
      min: String(GROK_COMPACT_MIN),
      max: String(GROK_COMPACT_MAX),
    })
  }
  return value
}

function parseOptionalPositiveInt(text: string | undefined, key: string): number | null {
  const trimmed = text?.trim() ?? ''
  if (!trimmed) return null
  const value = Number(trimmed)
  if (!Number.isInteger(value) || value <= 0) throw new AppError('overlay_positive_int', { key })
  return value
}

function parseOverlayPositiveInt(value: unknown, key: string): number | null {
  if (value === undefined) return null
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value <= 0) throw new AppError('overlay_positive_int', { key })
    return value
  }
  return parseOptionalPositiveInt(asTrimmedString(value), key)
}

function parseOverlayCompact(value: unknown): number | null {
  if (value === undefined) return null
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < GROK_COMPACT_MIN || value > GROK_COMPACT_MAX) {
      throw new AppError('grok_compact_range', {
        min: String(GROK_COMPACT_MIN),
        max: String(GROK_COMPACT_MAX),
      })
    }
    return value
  }
  return parseCompactPercent(asTrimmedString(value))
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function emptyOverlaySession(): GrokOverlaySession {
  return { effortLevel: '', permissionMode: '', contextWindow: '', autoCompact: '' }
}

function emptyOverlayIdentity(): GrokOverlayIdentity {
  return { name: '', model: '', baseUrl: '', apiBackend: '' }
}

function emptyParsedSession(): Omit<GrokSession, 'overlay'> {
  return { effortLevel: '', permissionMode: '', contextWindow: null, autoCompact: null }
}
