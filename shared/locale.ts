export const LANGUAGE_PREFERENCES = ['system', 'zh', 'en'] as const
export type LanguagePreference = (typeof LANGUAGE_PREFERENCES)[number]
export type AppLocale = 'zh' | 'en'

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'system' || value === 'zh' || value === 'en'
}

export function isAppLocale(value: unknown): value is AppLocale {
  return value === 'zh' || value === 'en'
}

export function documentLang(locale: AppLocale): string {
  return locale === 'zh' ? 'zh-CN' : 'en'
}

export function localeFromOsTag(tag: string): AppLocale {
  const locale = tag.toLowerCase()
  if (locale === 'zh' || locale.startsWith('zh-')) return 'zh'
  if (isAppLocale(locale)) return locale
  return 'en'
}
