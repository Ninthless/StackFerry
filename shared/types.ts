import type { LanguagePreference } from './locale'
import type { MicaState } from './mica'
import type { ThemePreference } from './theme'

export type { LanguagePreference, MicaState, ThemePreference }

export type ProviderKind = 'official' | 'custom'

export type Preset = {
  id: string
  name: string
  kind: ProviderKind
  tomlText: string
  requiresApiKey: boolean
}

export type ProviderDraft = {
  name: string
  kind: ProviderKind
  tomlText?: string
  apiKey?: string
  presetId?: string
}

export type ProviderListItem = {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  model: string
  tomlText: string
  hasApiKey: boolean
  enabled: boolean
}

export type AppStatus = {
  codexHome: string
  configExists: boolean
  authExists: boolean
  lastWriteAt: string | null
  activeProviderId: string | null
  needsRestart: boolean
}

export type StackferryApi = {
  showWindowControls: boolean
  listProviders: () => Promise<ProviderListItem[]>
  listPresets: () => Promise<Preset[]>
  addProvider: (draft: ProviderDraft) => Promise<ProviderListItem>
  updateProvider: (id: string, draft: ProviderDraft) => Promise<ProviderListItem>
  deleteProvider: (id: string) => Promise<void>
  enableProvider: (id: string) => Promise<AppStatus>
  listModels: (input: {
    baseUrl: string
    apiKey?: string
    providerId?: string
  }) => Promise<string[]>
  getStatus: () => Promise<AppStatus>
  openDevTools: () => Promise<void>
  windowMinimize: () => Promise<void>
  windowToggleMaximize: () => Promise<void>
  windowClose: () => Promise<void>
  isWindowMaximized: () => Promise<boolean>
  onWindowMaximizedChange: (listener: (maximized: boolean) => void) => () => void
  onChanged: (listener: () => void) => () => void
  getLocalePreference: () => Promise<LanguagePreference>
  setLocalePreference: (preference: LanguagePreference) => Promise<LanguagePreference>
  getMicaState: () => Promise<MicaState>
  setMicaPreference: (enabled: boolean) => Promise<MicaState>
  getThemePreference: () => Promise<ThemePreference>
  setThemePreference: (preference: ThemePreference) => Promise<ThemePreference>
}
