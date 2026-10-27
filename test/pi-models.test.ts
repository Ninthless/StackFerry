import { describe, expect, it } from 'vitest'
import { piModelsRequest } from '../shared/pi-models'

describe('pi model list requests', () => {
  it('uses a bearer token for OpenAI APIs and x-api-key for Anthropic Messages', () => {
    const openai = piModelsRequest('https://api.openai.com/v1', 'openai-responses', 'sk-test')
    expect(openai.url).toBe('https://api.openai.com/v1/models')
    expect(openai.headers.Authorization).toBe('Bearer sk-test')
    const anthropic = piModelsRequest('https://api.anthropic.com', 'anthropic-messages', 'sk-ant')
    expect(anthropic.url).toBe('https://api.anthropic.com/v1/models?limit=1000')
    expect(anthropic.headers['x-api-key']).toBe('sk-ant')
    expect(anthropic.headers.Authorization).toBeUndefined()
  })
})
