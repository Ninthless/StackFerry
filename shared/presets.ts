import { starterOverlayToml } from './provider-overlay'
import type { Preset } from './types'

export const PRESETS: Preset[] = [
  {
    id: 'official',
    name: 'Codex Official',
    kind: 'official',
    tomlText: '',
    requiresApiKey: false,
  },
  {
    id: 'openai-api',
    name: 'OpenAI API',
    kind: 'custom',
    tomlText: starterOverlayToml({
      providerId: 'openai_api',
      name: 'OpenAI API',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5.4',
    }),
    requiresApiKey: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    kind: 'custom',
    tomlText: starterOverlayToml({
      providerId: 'openrouter',
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'openai/gpt-5.4',
    }),
    requiresApiKey: true,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    kind: 'custom',
    tomlText: starterOverlayToml({
      providerId: 'deepseek',
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
    }),
    requiresApiKey: true,
  },
  {
    id: 'custom',
    name: 'Custom',
    kind: 'custom',
    tomlText: starterOverlayToml({
      providerId: 'custom',
      name: 'Custom',
      baseUrl: '',
      model: '',
    }),
    requiresApiKey: true,
  },
]

export function findPreset(presetId: string | undefined): Preset | undefined {
  if (!presetId) return undefined
  return PRESETS.find((preset) => preset.id === presetId)
}
