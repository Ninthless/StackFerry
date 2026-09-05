import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { APP_ERROR_CODES } from '../shared/app-error'

const zh = JSON.parse(readFileSync(new URL('../messages/zh.json', import.meta.url), 'utf8')) as Record<
  string,
  string
>
const en = JSON.parse(readFileSync(new URL('../messages/en.json', import.meta.url), 'utf8')) as Record<
  string,
  string
>

describe('i18n messages', () => {
  it('keeps zh and en keys in sync', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('has a message for every AppError code', () => {
    for (const code of APP_ERROR_CODES) {
      expect(zh[`error_${code}`]).toEqual(expect.any(String))
      expect(en[`error_${code}`]).toEqual(expect.any(String))
    }
  })
})
