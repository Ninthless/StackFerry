import { overwriteGetLocale, isLocale, baseLocale, type Locale } from '../../src/paraglide/runtime.js'
import * as m from '../../src/paraglide/messages.js'

let currentLocale: Locale = baseLocale

overwriteGetLocale(() => currentLocale)

export function setMainLocale(locale: string): Locale {
  currentLocale = isLocale(locale) ? locale : baseLocale
  return currentLocale
}

export { m }
