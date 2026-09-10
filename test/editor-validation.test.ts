import { describe, expect, it } from 'vitest'
import { missingText, nonHttpUrl } from '../src/features/providers/editor-validation'

describe('editor-validation', () => {
  it('treats blank and whitespace as missing', () => {
    expect(missingText('')).toBe(true)
    expect(missingText('   ')).toBe(true)
    expect(missingText(undefined)).toBe(true)
    expect(missingText('codex')).toBe(false)
  })

  it('rejects non-http URLs only when a value is present', () => {
    expect(nonHttpUrl('')).toBe(false)
    expect(nonHttpUrl('https://api.example.com')).toBe(false)
    expect(nonHttpUrl('http://localhost:8080')).toBe(false)
    expect(nonHttpUrl('ftp://api.example.com')).toBe(true)
    expect(nonHttpUrl('not a url')).toBe(true)
  })
})
