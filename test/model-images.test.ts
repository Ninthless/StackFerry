import { describe, expect, it } from 'vitest'
import { imageVotes, seesImages } from '../shared/model-images'

describe('model image catalog', () => {
  const votes = imageVotes([
    { models: { 'openai/gpt-5.4': { modalities: { input: ['text', 'image'] } } } },
    { models: { 'relay/gpt-5.4': { modalities: { input: ['text', 'image/png'] } } } },
    { models: { 'other/gpt-5.4': { modalities: { input: ['text'] } } } },
    { models: { 'deepseek/deepseek-chat': { modalities: { input: ['text'] } } } },
    { models: { 'tied/kimi-k2': { modalities: { input: ['text', 'image'] } } } },
    { models: { 'other/kimi-k2': { modalities: { input: ['text'] } } } },
    { models: { 'anthropic/claude-sonnet-4-5': { modalities: { input: ['text', 'image/png'] } } } },
  ])

  it('keeps a model when most listed providers say it sees images', () => {
    expect(seesImages('openai/gpt-5.4', votes)).toBe(true)
    expect(seesImages('GPT-5.4(high)', votes)).toBe(true)
    expect(seesImages('claude-sonnet-4-5[1m]', votes)).toBe(true)
    expect(seesImages('gw-claude-sonnet-4-5', votes)).toBe(true)
    expect(seesImages('kimi-k2', votes)).toBe(false)
    expect(seesImages('deepseek-chat', votes)).toBe(false)
    expect(seesImages('unknown-model', votes)).toBe(false)
  })
})
