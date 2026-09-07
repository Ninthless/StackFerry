import type { ClaudeAuthScheme, ClaudePreset } from './types'

export const CLAUDE_AUTH_SCHEMES = ['bearer', 'x-api-key'] as const

export const CLAUDE_PRESETS: ClaudePreset[] = [
  {
    id: 'official',
    name: 'Claude Official',
    kind: 'official',
    baseUrl: '',
    model: '',
    authScheme: 'bearer',
    requiresApiKey: false,
  },
  {
    id: 'custom',
    name: 'Custom',
    kind: 'custom',
    baseUrl: '',
    model: '',
    authScheme: 'bearer',
    requiresApiKey: true,
  },
]

export function findClaudePreset(presetId: string | undefined): ClaudePreset | undefined {
  if (!presetId) return undefined
  return CLAUDE_PRESETS.find((preset) => preset.id === presetId)
}

export function isClaudeAuthScheme(value: unknown): value is ClaudeAuthScheme {
  return typeof value === 'string' && (CLAUDE_AUTH_SCHEMES as readonly string[]).includes(value)
}
