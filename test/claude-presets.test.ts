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
    const xfcode = findClaudePreset('xfcode')
    expect(xfcode?.name).toBe('XFCode')
    expect(xfcode?.kind).toBe('custom')
    expect(xfcode?.baseUrl).toBe('https://api.orangecc.cc')
    expect(xfcode?.authScheme).toBe('bearer')
    expect(xfcode?.requiresApiKey).toBe(true)
    expect(CLAUDE_PRESETS).toHaveLength(4)
    expect(isClaudeAuthScheme('bearer')).toBe(true)
    expect(isClaudeAuthScheme('responses')).toBe(false)
  })

  it('offers A2Agent with bearer auth and leaves model selection to the user', () => {
    expect(findClaudePreset('a2agent')).toEqual({
      id: 'a2agent', name: 'A2Agent', kind: 'custom',
      baseUrl: 'https://api.a2agent.me', model: '',
      authScheme: 'bearer', requiresApiKey: true,
    })
  })
})
