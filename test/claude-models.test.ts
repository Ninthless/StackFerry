import { describe, expect, it } from 'vitest'
import { ANTHROPIC_API_VERSION, claudeModelsHeaders, claudeModelsUrl } from '../shared/claude-models'
import { expectAppError } from './expect-app-error'

describe('claude models url', () => {
  it('adds /v1/models when the base has no version path', () => {
    expect(claudeModelsUrl('https://api.anthropic.com')).toBe(
      'https://api.anthropic.com/v1/models?limit=1000',
    )
    expect(claudeModelsUrl('https://gateway.example.com/')).toBe(
      'https://gateway.example.com/v1/models?limit=1000',
    )
  })

  it('appends /models when the base already ends with /v1', () => {
    expect(claudeModelsUrl('https://gateway.example.com/v1')).toBe(
      'https://gateway.example.com/v1/models?limit=1000',
    )
    expect(claudeModelsUrl('https://gateway.example.com/anthropic/v1/')).toBe(
      'https://gateway.example.com/anthropic/v1/models?limit=1000',
    )
  })

  it('does not double /models', () => {
    expect(claudeModelsUrl('https://api.anthropic.com/v1/models')).toBe(
      'https://api.anthropic.com/v1/models?limit=1000',
    )
  })

  it('rejects empty or invalid bases', () => {
    expectAppError(() => claudeModelsUrl(''), 'models_missing_base_url')
    expectAppError(() => claudeModelsUrl('not-a-url'), 'models_invalid_url')
    expectAppError(() => claudeModelsUrl('file:///tmp'), 'models_unsupported_protocol')
  })
})

describe('claude models headers', () => {
  it('sends anthropic-version with bearer or x-api-key', () => {
    expect(claudeModelsHeaders('sk-gateway', 'bearer')).toEqual({
      Accept: 'application/json',
      'anthropic-version': ANTHROPIC_API_VERSION,
      Authorization: 'Bearer sk-gateway',
    })
    expect(claudeModelsHeaders('sk-ant', 'x-api-key')).toEqual({
      Accept: 'application/json',
      'anthropic-version': ANTHROPIC_API_VERSION,
      'x-api-key': 'sk-ant',
    })
  })
})
