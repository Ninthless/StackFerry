import { AppError } from './app-error'

export const CLAUDE_EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh'] as const
export type ClaudeEffortLevel = (typeof CLAUDE_EFFORT_LEVELS)[number]

export const CLAUDE_AUTO_COMPACT_MIN = 100_000
export const CLAUDE_AUTO_COMPACT_MAX = 1_000_000
export const CLAUDE_DESKTOP_1M_TOKENS = 1_000_000

export type ClaudeSessionInput = {
  effortLevel?: string
  contextWindow?: string
  autoCompact?: string
  overlayJson?: string
}

export type ClaudeSession = {
  effortLevel: ClaudeEffortLevel | ''
  contextWindow: number | null
  autoCompact: number | null
  overlay: Record<string, unknown> | null
}

export function isClaudeEffortLevel(value: string): value is ClaudeEffortLevel {
  return (CLAUDE_EFFORT_LEVELS as readonly string[]).includes(value)
}

export function parseClaudeSession(input: ClaudeSessionInput): ClaudeSession {
  return {
    effortLevel: parseEffort(input.effortLevel),
    contextWindow: parseOptionalPositiveInt(input.contextWindow, 'CLAUDE_CODE_MAX_CONTEXT_TOKENS'),
    autoCompact: parseAutoCompact(input.autoCompact),
    overlay: parseClaudeOverlayJson(input.overlayJson),
  }
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
  return `${JSON.stringify(overlay, null, 2)}\n`
}

export function persistClaudeSession(input: ClaudeSessionInput): {
  effortLevel: string
  contextWindow: string
  autoCompact: string
  overlayJson: string
} {
  const session = parseClaudeSession(input)
  return {
    effortLevel: session.effortLevel,
    contextWindow: session.contextWindow == null ? '' : String(session.contextWindow),
    autoCompact: session.autoCompact == null ? '' : String(session.autoCompact),
    overlayJson: session.overlay ? `${JSON.stringify(session.overlay, null, 2)}\n` : '',
  }
}

export function suggestedClaudeAutoCompact(contextWindow: number): number | null {
  const suggested = Math.floor((contextWindow * 9) / 10)
  if (suggested < CLAUDE_AUTO_COMPACT_MIN || suggested > CLAUDE_AUTO_COMPACT_MAX) return null
  return suggested
}

export function syncedClaudeAutoCompact(
  nextContextWindow: string,
  previousContextWindow: string,
  currentAutoCompact: string,
): string | undefined {
  const previous = parsedPositiveInt(previousContextWindow)
  const compact = currentAutoCompact.trim()
  const previousSuggested = previous == null ? null : suggestedClaudeAutoCompact(previous)
  const previousSuggestedText = previousSuggested == null ? null : String(previousSuggested)
  if (compact !== '' && compact !== previousSuggestedText) return undefined

  const next = parsedPositiveInt(nextContextWindow)
  if (next == null) return compact === '' ? undefined : ''
  const suggested = suggestedClaudeAutoCompact(next)
  return suggested == null ? '' : String(suggested)
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

function assertOverlayEnv(value: unknown): void {
  if (!isPlainObject(value)) throw new AppError('claude_overlay_env')
  for (const item of Object.values(value)) {
    if (typeof item !== 'string') throw new AppError('claude_overlay_env')
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
