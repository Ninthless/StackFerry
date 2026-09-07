import { describe, expect, it } from 'vitest'
import { CLAUDE_PRESETS, findClaudePreset, isClaudeAuthScheme } from '../shared/claude-presets'

describe('claude presets', () => {
  it('exposes official login and a blank custom gateway', () => {
    expect(findClaudePreset('official')?.kind).toBe('official')
    expect(findClaudePreset('official')?.requiresApiKey).toBe(false)
    const custom = findClaudePreset('custom')
    expect(custom?.kind).toBe('custom')
    expect(custom?.baseUrl).toBe('')
    expect(custom?.requiresApiKey).toBe(true)
    expect(CLAUDE_PRESETS).toHaveLength(2)
    expect(isClaudeAuthScheme('bearer')).toBe(true)
    expect(isClaudeAuthScheme('responses')).toBe(false)
  })
})
