export type ProviderKind = 'official' | 'custom'

export type Preset = {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  model: string
  requiresApiKey: boolean
}

export type ProviderDraft = {
  name: string
  kind: ProviderKind
  baseUrl: string
  model: string
  apiKey?: string
  presetId?: string
}

export type ProviderListItem = {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  model: string
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
  listProviders: () => Promise<ProviderListItem[]>
  listPresets: () => Promise<Preset[]>
  addProvider: (draft: ProviderDraft) => Promise<ProviderListItem>
  updateProvider: (id: string, draft: ProviderDraft) => Promise<ProviderListItem>
  deleteProvider: (id: string) => Promise<void>
  enableProvider: (id: string) => Promise<AppStatus>
  getStatus: () => Promise<AppStatus>
  onChanged: (listener: () => void) => () => void
}
