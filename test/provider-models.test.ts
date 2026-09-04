import { describe, expect, it } from 'vitest'
import { modelsUrl, parseModelsResponse } from '../shared/provider-models'

describe('provider models', () => {
  it('appends /models to the provider base url', () => {
    expect(modelsUrl('https://openrouter.ai/api/v1')).toBe(
      'https://openrouter.ai/api/v1/models',
    )
    expect(modelsUrl('https://api.example.com/v1/')).toBe('https://api.example.com/v1/models')
    expect(() => modelsUrl('')).toThrow('请填写 Base URL')
    expect(() => modelsUrl('not-a-url')).toThrow('Base URL 不是有效地址')
    expect(() => modelsUrl('file:///tmp')).toThrow('Base URL 仅支持 http 或 https')
  })

  it('reads OpenAI-compatible model ids and rejects empty payloads', () => {
    expect(
      parseModelsResponse({
        data: [{ id: 'gpt-5.4' }, { id: 'gpt-5.4' }, { id: 'deepseek-chat' }, { name: 'skip' }],
      }),
    ).toEqual(['gpt-5.4', 'deepseek-chat'])
    expect(() => parseModelsResponse({ data: [] })).toThrow('模型列表为空')
    expect(() => parseModelsResponse({})).toThrow('模型列表格式无法解析')
  })
})
