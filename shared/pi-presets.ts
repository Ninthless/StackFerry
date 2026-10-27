import type { PiPreset } from './types'

export const PI_PRESETS: PiPreset[] = [
  {
    id: 'official',
    name: 'Pi Official',
    kind: 'official',
    baseUrl: '',
    model: '',
    api: 'openai-completions',
    requiresApiKey: false,
  },
  {
    id: 'openai-api',
    name: 'OpenAI API',
    kind: 'custom',
    baseUrl: 'https://api.openai.com/v1',
    model: '',
    api: 'openai-responses',
    requiresApiKey: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    kind: 'custom',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: '',
    api: 'openai-completions',
    requiresApiKey: true,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    kind: 'custom',
    baseUrl: 'https://api.deepseek.com/v1',
    model: '',
    api: 'openai-completions',
    requiresApiKey: true,
  },
  {
    id: 'xfcode',
    name: 'XFCode',
    kind: 'custom',
    baseUrl: 'https://api.orangecc.cc/v1',
    model: '',
    api: 'openai-completions',
    requiresApiKey: true,
  },
  {
    id: 'custom',
    name: 'Custom',
    kind: 'custom',
    baseUrl: '',
    model: '',
    api: 'openai-completions',
    requiresApiKey: true,
  },
]

export function findPiPreset(presetId: string | undefined): PiPreset | undefined {
  if (!presetId) return undefined
  return PI_PRESETS.find((preset) => preset.id === presetId)
}
