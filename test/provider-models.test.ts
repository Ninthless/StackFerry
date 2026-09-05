import { describe, expect, it } from 'vitest'
import { modelsUrl, parseModelsResponse } from '../shared/provider-models'
import { expectAppError } from './expect-app-error'

describe('provider models', () => {
  it('appends /models to the provider base url', () => {
    expect(modelsUrl('https://openrouter.ai/api/v1')).toBe(
      'https://openrouter.ai/api/v1/models',
    )
    expect(modelsUrl('https://api.example.com/v1/')).toBe('https://api.example.com/v1/models')
    expectAppError(() => modelsUrl(''), 'models_missing_base_url')
    expectAppError(() => modelsUrl('not-a-url'), 'models_invalid_url')
    expectAppError(() => modelsUrl('file:///tmp'), 'models_unsupported_protocol')
  })

  it('reads OpenAI-compatible model ids and rejects empty payloads', () => {
    expect(
      parseModelsResponse({
        data: [{ id: 'gpt-5.4' }, { id: 'gpt-5.4' }, { id: 'deepseek-chat' }, { name: 'skip' }],
      }),
    ).toEqual(['gpt-5.4', 'deepseek-chat'])
    expectAppError(() => parseModelsResponse({ data: [] }), 'models_empty')
    expectAppError(() => parseModelsResponse({}), 'models_invalid_payload')
  })
})
