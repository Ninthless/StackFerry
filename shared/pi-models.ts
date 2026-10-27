import { claudeModelsHeaders, claudeModelsUrl } from './claude-models'
import { modelsUrl } from './provider-models'
import type { PiApi } from './types'

export function piModelsRequest(
  baseUrl: string,
  api: PiApi,
  apiKey: string,
): { url: string; headers: Record<string, string> } {
  if (api === 'anthropic-messages') {
    return {
      url: claudeModelsUrl(baseUrl),
      headers: claudeModelsHeaders(apiKey, 'x-api-key'),
    }
  }
  return {
    url: modelsUrl(baseUrl),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  }
}
