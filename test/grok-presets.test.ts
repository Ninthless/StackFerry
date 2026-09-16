import { describe, expect, it } from 'vitest'
import { findGrokPreset, GROK_PRESETS } from '../shared/grok-presets'

describe('grok presets', () => {
  it('includes XFCode with the OrangeCC OpenAI-compatible gateway URL', () => {
    expect(findGrokPreset('official')?.kind).toBe('official')
    const xfcode = findGrokPreset('xfcode')
    expect(xfcode?.name).toBe('XFCode')
    expect(xfcode?.kind).toBe('custom')
    expect(xfcode?.baseUrl).toBe('https://api.orangecc.cc/v1')
    expect(xfcode?.apiBackend).toBe('responses')
    expect(xfcode?.requiresApiKey).toBe(true)
    expect(findGrokPreset('custom')?.baseUrl).toBe('')
    expect(GROK_PRESETS).toHaveLength(3)
  })
})
