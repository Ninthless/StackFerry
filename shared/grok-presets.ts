import type { GrokApiBackend, GrokPreset } from './types'

export const GROK_API_BACKENDS = ['responses', 'chat_completions'] as const

// CCSW 校验自定义 Grok 快照时要求 context_window 为正整数；用户没填时按同一默认写入 live。
export const GROK_DEFAULT_CONTEXT_WINDOW = 500_000

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
