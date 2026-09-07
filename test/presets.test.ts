import { describe, expect, it } from 'vitest'
import { overlayBaseUrl } from '../shared/provider-overlay'
import { findPreset } from '../shared/presets'

describe('presets', () => {
  it('includes XFCode with the OrangeCC gateway URL', () => {
    const preset = findPreset('xfcode')
    expect(preset?.name).toBe('XFCode')
    expect(preset?.requiresApiKey).toBe(true)
    expect(overlayBaseUrl(preset!.tomlText)).toBe('https://api.orangecc.cc/v1')
  })
})
