import { AppError } from './app-error'
import { isPlainObject } from './provider-overlay'

export const GROK_EFFORT_LEVELS = ['none', 'low', 'medium', 'high', 'xhigh', 'max'] as const
export type GrokEffortLevel = (typeof GROK_EFFORT_LEVELS)[number]

export const GROK_COMPACT_MIN = 0
export const GROK_COMPACT_MAX = 100

export type GrokSessionInput = {
  effortLevel?: string
  contextWindow?: string
  autoCompact?: string
  overlayJson?: string
}

export type GrokSession = {
  effortLevel: GrokEffortLevel | ''
  contextWindow: number | null
  autoCompact: number | null
  overlay: Record<string, unknown> | null
}

export function isGrokEffortLevel(value: string): value is GrokEffortLevel {
  return (GROK_EFFORT_LEVELS as readonly string[]).includes(value)
}

export function parseGrokSession(input: GrokSessionInput): GrokSession {
  return {
    effortLevel: parseEffort(input.effortLevel),
    contextWindow: parseOptionalPositiveInt(input.contextWindow, 'context_window'),
    autoCompact: parseCompactPercent(input.autoCompact),
    overlay: parseGrokOverlayJson(input.overlayJson),
  }
}

export function parseGrokOverlayJson(text: string | undefined): Record<string, unknown> | null {
  const trimmed = text?.trim() ?? ''
  if (!trimmed) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new AppError('grok_overlay_json', { detail })
  }
  if (!isPlainObject(parsed)) throw new AppError('grok_overlay_object')
  if (Object.keys(parsed).length === 0) return null
  assertTomlValue(parsed)
  return parsed
}

export function formatGrokOverlayJson(text: string): string {
  const overlay = parseGrokOverlayJson(text)
  if (!overlay) return ''
  return `${JSON.stringify(overlay, null, 2)}\n`
}

export function persistGrokSession(input: GrokSessionInput): {
  effortLevel: string
  contextWindow: string
  autoCompact: string
  overlayJson: string
} {
  const session = parseGrokSession(input)
  return {
    effortLevel: session.effortLevel,
    contextWindow: session.contextWindow == null ? '' : String(session.contextWindow),
    autoCompact: session.autoCompact == null ? '' : String(session.autoCompact),
    overlayJson: session.overlay ? `${JSON.stringify(session.overlay, null, 2)}\n` : '',
  }
}

function parseEffort(value: string | undefined): GrokEffortLevel | '' {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return ''
  if (!isGrokEffortLevel(trimmed)) throw new AppError('grok_effort')
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

function assertTomlValue(value: unknown): void {
  if (typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number' && Number.isFinite(value)) return
  if (Array.isArray(value)) {
    for (const item of value) assertTomlValue(item)
    return
  }
  if (isPlainObject(value)) {
    for (const item of Object.values(value)) assertTomlValue(item)
    return
  }
  throw new AppError('grok_overlay_value')
}
