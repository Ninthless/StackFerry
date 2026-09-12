import { AppError } from './app-error'

export const CLAUDE_EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh'] as const
export type ClaudeEffortLevel = (typeof CLAUDE_EFFORT_LEVELS)[number]

export const CLAUDE_PERMISSION_MODES = [
  'default',
  'acceptEdits',
  'plan',
  'auto',
  'dontAsk',
  'bypassPermissions',
] as const
export type ClaudePermissionMode = (typeof CLAUDE_PERMISSION_MODES)[number]

export const CLAUDE_AUTO_COMPACT_MIN = 100_000
export const CLAUDE_AUTO_COMPACT_MAX = 1_000_000
export const CLAUDE_DESKTOP_1M_TOKENS = 1_000_000

export type ClaudeSessionInput = {
  effortLevel?: string
  permissionMode?: string
  contextWindow?: string
  autoCompact?: string
  overlayJson?: string
}

export type ClaudeOverlayFields = {
  baseUrl: string
  model: string
  effortLevel: string
  permissionMode: string
  contextWindow: string
  autoCompact: string
}

export type ClaudePersistInput = ClaudeSessionInput & {
  baseUrl?: string
  model?: string
}

const ENV_BASE_URL = 'ANTHROPIC_BASE_URL'
const ENV_MODEL = 'ANTHROPIC_MODEL'
const ENV_CONTEXT = 'CLAUDE_CODE_MAX_CONTEXT_TOKENS'

export type ClaudeSession = {
  effortLevel: ClaudeEffortLevel | ''
  permissionMode: ClaudePermissionMode | ''
  contextWindow: number | null
  autoCompact: number | null
  overlay: Record<string, unknown> | null
}

export function isClaudeEffortLevel(value: string): value is ClaudeEffortLevel {
  return (CLAUDE_EFFORT_LEVELS as readonly string[]).includes(value)
}

export function isClaudePermissionMode(value: string): value is ClaudePermissionMode {
  return (CLAUDE_PERMISSION_MODES as readonly string[]).includes(value)
}

export function parseClaudeSession(input: ClaudeSessionInput): ClaudeSession {
  const session: ClaudeSession = {
    effortLevel: parseEffort(input.effortLevel),
    permissionMode: parsePermissionMode(input.permissionMode),
    contextWindow: parseOptionalPositiveInt(input.contextWindow, 'CLAUDE_CODE_MAX_CONTEXT_TOKENS'),
    autoCompact: parseAutoCompact(input.autoCompact),
    overlay: parseClaudeOverlayJson(input.overlayJson),
  }
  dropCopiedCodexCompact(session)
  return session
}

export function parseClaudeOverlayJson(text: string | undefined): Record<string, unknown> | null {
  const trimmed = text?.trim() ?? ''
  if (!trimmed) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new AppError('claude_overlay_json', { detail })
  }
  if (!isPlainObject(parsed)) throw new AppError('claude_overlay_object')
  if (Object.keys(parsed).length === 0) return null
  if (parsed.env !== undefined) assertOverlayEnv(parsed.env)
  return parsed
}

export function formatClaudeOverlayJson(text: string): string {
  const overlay = parseClaudeOverlayJson(text)
  if (!overlay) return ''
  return stringifyOverlay(overlay)
}

export function claudeOverlayFields(text: string): ClaudeOverlayFields {
  try {
    const overlay = parseClaudeOverlayJson(text)
    if (!overlay) return emptyOverlayFields()
    const env = overlayEnv(overlay)
    const permissions = isPlainObject(overlay.permissions) ? overlay.permissions : {}
    return {
      baseUrl: asTrimmedString(env[ENV_BASE_URL]),
      model: asTrimmedString(env[ENV_MODEL]),
      effortLevel: asTrimmedString(overlay.effortLevel),
      permissionMode: asTrimmedString(permissions.defaultMode),
      contextWindow: asTrimmedString(env[ENV_CONTEXT]),
      autoCompact: overlay.autoCompactWindow == null ? '' : String(overlay.autoCompactWindow),
    }
  } catch {
    return emptyOverlayFields()
  }
}

export function withClaudeOverlayFields(text: string, patch: Partial<ClaudeOverlayFields>): string {
  const overlay = parseClaudeOverlayJson(text) ?? {}
  if (patch.baseUrl !== undefined) writeEnv(overlay, ENV_BASE_URL, patch.baseUrl.trim(), true)
  if (patch.model !== undefined) writeEnv(overlay, ENV_MODEL, patch.model.trim(), false)
  if (patch.contextWindow !== undefined) {
    const value = parseOptionalPositiveInt(patch.contextWindow, 'CLAUDE_CODE_MAX_CONTEXT_TOKENS')
    writeEnv(overlay, ENV_CONTEXT, value == null ? '' : String(value), false)
  }
  if (patch.effortLevel !== undefined) {
    const effort = parseEffort(patch.effortLevel)
    if (effort) overlay.effortLevel = effort
    else delete overlay.effortLevel
  }
  if (patch.autoCompact !== undefined) {
    const value = parseAutoCompact(patch.autoCompact)
    if (value == null) delete overlay.autoCompactWindow
    else overlay.autoCompactWindow = value
  }
  if (patch.permissionMode !== undefined) applyPermissionPatch(overlay, patch.permissionMode)
  return stringifyOverlay(overlay)
}

export function hydrateClaudeOverlay(overlayJson: string, columns: ClaudeOverlayFields): string {
  try {
    const overlay = parseClaudeOverlayJson(overlayJson) ?? {}
    const env = overlayEnv(overlay)
    const permissions = isPlainObject(overlay.permissions) ? overlay.permissions : {}
    const patch: Partial<ClaudeOverlayFields> = {}
    if (!(ENV_BASE_URL in env)) patch.baseUrl = columns.baseUrl
    if (!(ENV_MODEL in env) && columns.model) patch.model = columns.model
    if (overlay.effortLevel == null && columns.effortLevel) patch.effortLevel = columns.effortLevel
    if (permissions.defaultMode == null && columns.permissionMode) {
      patch.permissionMode = columns.permissionMode
    }
    if (!(ENV_CONTEXT in env) && columns.contextWindow) patch.contextWindow = columns.contextWindow
    if (overlay.autoCompactWindow == null && columns.autoCompact) {
      if (!isCopiedCodexCompactLimit(
        parsedPositiveInt(columns.contextWindow),
        parsedPositiveInt(columns.autoCompact),
      )) {
        patch.autoCompact = columns.autoCompact
      }
    }
    if (Object.keys(patch).length === 0) return overlayJson
    return withClaudeOverlayFields(overlayJson, patch)
  } catch {
    return overlayJson
  }
}

export function persistClaudeSession(input: ClaudePersistInput): {
  effortLevel: string
  permissionMode: string
  contextWindow: string
  autoCompact: string
  overlayJson: string
} {
  const folded = foldColumnsIntoOverlay(input)
  const session = parseClaudeSession({ ...input, overlayJson: folded })
  return {
    effortLevel: session.effortLevel,
    permissionMode: session.permissionMode,
    contextWindow: session.contextWindow == null ? '' : String(session.contextWindow),
    autoCompact: session.autoCompact == null ? '' : String(session.autoCompact),
    overlayJson: session.overlay ? stringifyOverlay(session.overlay) : '',
  }
}

export function desktopSupports1m(contextWindow: number | null): boolean {
  return contextWindow != null && contextWindow >= CLAUDE_DESKTOP_1M_TOKENS
}

function parseEffort(value: string | undefined): ClaudeEffortLevel | '' {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return ''
  if (!isClaudeEffortLevel(trimmed)) throw new AppError('claude_effort')
  return trimmed
}

function parsePermissionMode(value: string | undefined): ClaudePermissionMode | '' {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return ''
  if (!isClaudePermissionMode(trimmed)) throw new AppError('claude_permission')
  return trimmed
}

function dropCopiedCodexCompact(session: ClaudeSession): void {
  // autoCompactWindow 是压缩预算，只能缩小；90% 配对是误套 Codex 阈值，启用时必须丢掉。
  if (!isCopiedCodexCompactLimit(session.contextWindow, session.autoCompact)) return
  session.autoCompact = null
  if (session.overlay) delete session.overlay.autoCompactWindow
}

function isCopiedCodexCompactLimit(contextWindow: number | null, autoCompact: number | null): boolean {
  return contextWindow != null && autoCompact != null && Math.floor((contextWindow * 9) / 10) === autoCompact
}

function parseAutoCompact(text: string | undefined): number | null {
  const value = parseOptionalPositiveInt(text, 'autoCompactWindow')
  if (value == null) return null
  if (value < CLAUDE_AUTO_COMPACT_MIN || value > CLAUDE_AUTO_COMPACT_MAX) {
    throw new AppError('claude_compact_range', {
      min: String(CLAUDE_AUTO_COMPACT_MIN),
      max: String(CLAUDE_AUTO_COMPACT_MAX),
    })
  }
  return value
}

function parseOptionalPositiveInt(text: string | undefined, key: string): number | null {
  const trimmed = text?.trim() ?? ''
  if (!trimmed) return null
  const value = parsedPositiveInt(trimmed)
  if (value == null) throw new AppError('overlay_positive_int', { key })
  return value
}

function parsedPositiveInt(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const value = Number(trimmed)
  if (!Number.isInteger(value) || value <= 0) return null
  return value
}

function foldColumnsIntoOverlay(input: ClaudePersistInput): string {
  const patch: Partial<ClaudeOverlayFields> = {}
  if (input.baseUrl !== undefined) patch.baseUrl = input.baseUrl
  if (input.model !== undefined) patch.model = input.model
  if (input.effortLevel !== undefined) patch.effortLevel = input.effortLevel
  if (input.permissionMode !== undefined) patch.permissionMode = input.permissionMode
  if (input.contextWindow !== undefined) patch.contextWindow = input.contextWindow
  if (input.autoCompact !== undefined) patch.autoCompact = input.autoCompact
  if (Object.keys(patch).length === 0) return input.overlayJson ?? ''
  return withClaudeOverlayFields(input.overlayJson ?? '', patch)
}

function applyPermissionPatch(overlay: Record<string, unknown>, raw: string): void {
  const mode = parsePermissionMode(raw)
  const current = isPlainObject(overlay.permissions) ? { ...overlay.permissions } : {}
  if (mode) current.defaultMode = mode
  else delete current.defaultMode
  if (Object.keys(current).length === 0) delete overlay.permissions
  else overlay.permissions = current
}

function writeEnv(
  overlay: Record<string, unknown>,
  key: string,
  value: string,
  keepEmpty: boolean,
): void {
  const env = isPlainObject(overlay.env) ? { ...overlay.env } : {}
  if (value || keepEmpty) env[key] = value
  else delete env[key]
  if (Object.keys(env).length === 0) delete overlay.env
  else overlay.env = env
}

function overlayEnv(overlay: Record<string, unknown>): Record<string, unknown> {
  return isPlainObject(overlay.env) ? overlay.env : {}
}

function stringifyOverlay(overlay: Record<string, unknown>): string {
  if (Object.keys(overlay).length === 0) return ''
  return `${JSON.stringify(overlay, null, 2)}\n`
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function emptyOverlayFields(): ClaudeOverlayFields {
  return {
    baseUrl: '',
    model: '',
    effortLevel: '',
    permissionMode: '',
    contextWindow: '',
    autoCompact: '',
  }
}

function assertOverlayEnv(value: unknown): void {
  if (!isPlainObject(value)) throw new AppError('claude_overlay_env')
  for (const item of Object.values(value)) {
    if (typeof item !== 'string') throw new AppError('claude_overlay_env')
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
