import { describe, expect, it } from 'vitest'
import { findPiPreset, PI_PRESETS } from '../shared/pi-presets'
import { PI_APIS } from '../shared/types'

describe('pi presets', () => {
  it('offers official login and the same custom gateways as the other CLIs', () => {
    expect(PI_PRESETS.map((preset) => preset.id)).toEqual([
      'official',
      'openai-api',
      'openrouter',
      'deepseek',
      'xfcode',
      'custom',
    ])
    expect(PI_PRESETS[0]).toMatchObject({ kind: 'official', requiresApiKey: false })
    expect(findPiPreset('openai-api')?.api).toBe('openai-responses')
    for (const preset of PI_PRESETS) {
      if (preset.kind === 'custom') expect(PI_APIS).toContain(preset.api)
    }
  })
})
