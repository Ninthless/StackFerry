import { describe, expect, it } from 'vitest'
import { documentLang, isLanguagePreference, localeFromOsTag } from '../shared/locale'

describe('locale', () => {
  it('maps OS language tags to app locales', () => {
    expect(localeFromOsTag('zh-CN')).toBe('zh')
    expect(localeFromOsTag('zh')).toBe('zh')
    expect(localeFromOsTag('en-US')).toBe('en')
    expect(localeFromOsTag('ja-JP')).toBe('en')
  })

  it('maps locales to document lang and accepts preferences', () => {
    expect(documentLang('zh')).toBe('zh-CN')
    expect(documentLang('en')).toBe('en')
    expect(isLanguagePreference('system')).toBe(true)
    expect(isLanguagePreference('fr')).toBe(false)
  })
})
