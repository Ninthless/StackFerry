import type { Preset } from './types'

export const PRESETS: Preset[] = [
  {
    id: 'official',
    name: 'Codex Official',
    kind: 'official',
    baseUrl: '',
    model: '',
    requiresApiKey: false,
  },
  {
    id: 'openai-api',
    name: 'OpenAI API',
    kind: 'custom',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5.4',
    requiresApiKey: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    kind: 'custom',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-5.4',
    requiresApiKey: true,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    kind: 'custom',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    requiresApiKey: true,
  },
  {
    id: 'custom',
    name: 'Custom',
    kind: 'custom',
    baseUrl: '',
    model: '',
    requiresApiKey: true,
  },
]

export function findPreset(presetId: string | undefined): Preset | undefined {
  if (!presetId) return undefined
  return PRESETS.find((preset) => preset.id === presetId)
}
