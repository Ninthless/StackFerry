import { describe, expect, it } from 'vitest'
import { isThemePreference } from '../shared/theme'

describe('theme preference', () => {
  it('accepts system, light, and dark', () => {
    expect(isThemePreference('system')).toBe(true)
    expect(isThemePreference('light')).toBe(true)
    expect(isThemePreference('dark')).toBe(true)
    expect(isThemePreference('auto')).toBe(false)
  })
})
