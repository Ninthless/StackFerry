import { describe, expect, it } from 'vitest'
import { overlayBaseUrl } from '../shared/provider-overlay'
import { findPreset } from '../shared/presets'
import { parse } from 'smol-toml'

describe('presets', () => {
  it('includes XFCode with the OrangeCC gateway URL', () => {
    const preset = findPreset('xfcode')
    expect(preset?.name).toBe('XFCode')
    expect(preset?.requiresApiKey).toBe(true)
    expect(overlayBaseUrl(preset!.tomlText)).toBe('https://api.orangecc.cc/v1')
  })

  it('offers an A2Agent Responses overlay without choosing a model or embedding credentials', () => {
    const preset = findPreset('a2agent')
    expect(preset).toMatchObject({ name: 'A2Agent', kind: 'custom', requiresApiKey: true })
    const overlay = parse(preset!.tomlText)
    expect(overlay.model).toBeUndefined()
    expect(overlay.model_provider).toBe('a2agent')
    expect(overlay.model_providers).toMatchObject({
      a2agent: { name: 'A2Agent', base_url: 'https://api.a2agent.me/v1', wire_api: 'responses' },
    })
    expect(preset!.tomlText).not.toContain('sk-')
  })
})
