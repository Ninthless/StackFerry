import { describe, expect, it } from 'vitest'
import { applyListedImages, modelsUrl, parseModelsResponse } from '../shared/provider-models'
import { modelEntry } from '../shared/model-entry'
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
    ).toEqual([{ id: 'gpt-5.4' }, { id: 'deepseek-chat' }])
    expectAppError(() => parseModelsResponse({ data: [] }), 'models_empty')
    expectAppError(() => parseModelsResponse({}), 'models_invalid_payload')
  })

  it('reads image input from modalities and leaves an unstated model unmarked', () => {
    expect(
      parseModelsResponse({
        data: [
          { id: 'gpt-5.4', input_modalities: ['text', 'image'] },
          { id: 'deepseek-chat', modalities: { input: ['text'] } },
          { id: 'sees', modalities: { input: ['text', 'image/png', 'application/pdf'] } },
          { id: 'vision', capabilities: [{ type: 'image' }] },
          { id: 'plain' },
        ],
      }),
    ).toEqual([
      { id: 'gpt-5.4', images: true },
      { id: 'deepseek-chat', images: false },
      { id: 'sees', images: true },
      { id: 'vision', images: true },
      { id: 'plain' },
    ])
  })

  it('applies a stated image answer and keeps a model the list did not mention', () => {
    expect(
      applyListedImages(
        [modelEntry('gpt-5.4', false), modelEntry('kept', false), modelEntry('plain')],
        [{ id: 'gpt-5.4', images: true }, { id: 'plain' }],
      ),
    ).toEqual([modelEntry('gpt-5.4'), modelEntry('kept', false), modelEntry('plain')])
  })

  it('keeps a manual image switch and only raises an unstated model from the catalog', () => {
    const manual = modelEntry('deepseek-chat', false, true)
    expect(
      applyListedImages(
        [manual, modelEntry('gpt-5.4', false), modelEntry('unknown', false)],
        [{ id: 'deepseek-chat', images: true }, { id: 'gpt-5.4' }],
        (id) => id === 'gpt-5.4',
      ),
    ).toEqual([manual, modelEntry('gpt-5.4'), modelEntry('unknown', false)])
  })
})
