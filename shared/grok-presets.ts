import type { GrokApiBackend, GrokPreset } from './types'

export const GROK_API_BACKENDS = ['responses', 'chat_completions'] as const

export const GROK_OFFICIAL_DEFAULT_MODEL = 'grok-build'

export const GROK_PRESETS: GrokPreset[] = [
  {
    id: 'official',
    name: 'Grok Official',
    kind: 'official',
    baseUrl: '',
    model: '',
    apiBackend: 'responses',
    requiresApiKey: false,
  },
  {
    id: 'custom',
    name: 'Custom',
    kind: 'custom',
    baseUrl: '',
    model: '',
    apiBackend: 'responses',
    requiresApiKey: true,
  },
]

export function findGrokPreset(presetId: string | undefined): GrokPreset | undefined {
  if (!presetId) return undefined
  return GROK_PRESETS.find((preset) => preset.id === presetId)
}

export function isGrokApiBackend(value: unknown): value is GrokApiBackend {
  return typeof value === 'string' && (GROK_API_BACKENDS as readonly string[]).includes(value)
}
