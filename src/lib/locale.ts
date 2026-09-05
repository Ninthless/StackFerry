import { documentLang, isAppLocale, type LanguagePreference } from "@shared/locale"
import { getLocale, localStorageKey, setLocale } from "../paraglide/runtime.js"

export function currentLanguagePreference(): LanguagePreference {
  const stored = localStorage.getItem(localStorageKey)
  return isAppLocale(stored) ? stored : "system"
}

export function applyDocumentLang(): void {
  document.documentElement.lang = documentLang(getLocale())
}

export async function applyLanguagePreference(preference: LanguagePreference): Promise<void> {
  await window.stackferry?.setLocalePreference(preference)
  if (preference === "system") {
    localStorage.removeItem(localStorageKey)
    window.location.reload()
    return
  }
  setLocale(preference)
}
