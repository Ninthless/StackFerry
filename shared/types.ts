import type { CliToolId, CliToolStatus } from './cli-tools'
import type { LanguagePreference } from './locale'
import type { MicaState } from './mica'
import type { RoutingSettingsPatch, RoutingSnapshot, RoutingLaneState } from './routing'
import type {
  SkillDocument,
  SkillDraft,
  SkillImportCandidate,
  SkillListItem,
  SkillRepo,
  SkillRepoDraft,
  SkillTarget,
} from './skills'
import type { ThemePreference } from './theme'

export type { CliInstallMethod, CliToolId, CliToolStatus } from './cli-tools'

export type {
  SkillDocument,
  SkillDraft,
  SkillImportCandidate,
  SkillListItem,
  SkillOrigin,
  SkillRepo,
  SkillRepoDraft,
  SkillTarget,
} from './skills'

export type { LanguagePreference, MicaState, RoutingLaneState, RoutingSettingsPatch, RoutingSnapshot, ThemePreference }

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

export type ClaudeAuthScheme = 'bearer' | 'x-api-key'

export type ClaudePreset = {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  model: string
  authScheme: ClaudeAuthScheme
  requiresApiKey: boolean
}

export type ClaudeProviderDraft = {
  name: string
  kind: ProviderKind
  baseUrl?: string
  model?: string
  authScheme?: ClaudeAuthScheme
  apiKey?: string
  presetId?: string
  effortLevel?: string
  contextWindow?: string
  autoCompact?: string
  overlayJson?: string
}

export type ClaudeProviderListItem = {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  model: string
  authScheme: ClaudeAuthScheme
  effortLevel: string
  contextWindow: string
  autoCompact: string
  overlayJson: string
  hasApiKey: boolean
  enabled: boolean
}

export type ClaudeAppStatus = {
  claudeHome: string
  settingsExists: boolean
  desktopLibrary: string
  lastWriteAt: string | null
  activeProviderId: string | null
  needsRestart: boolean
}

export type GrokApiBackend = 'responses' | 'chat_completions'

export type GrokPreset = {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  model: string
  apiBackend: GrokApiBackend
  requiresApiKey: boolean
}

export type GrokProviderDraft = {
  name: string
  kind: ProviderKind
  baseUrl?: string
  model?: string
  apiBackend?: GrokApiBackend
  apiKey?: string
  presetId?: string
  effortLevel?: string
  contextWindow?: string
  autoCompact?: string
  overlayJson?: string
}

export type GrokProviderListItem = {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  model: string
  apiBackend: GrokApiBackend
  effortLevel: string
  contextWindow: string
  autoCompact: string
  overlayJson: string
  hasApiKey: boolean
  enabled: boolean
}

export type GrokAppStatus = {
  grokHome: string
  configExists: boolean
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
  reorderProviders: (ids: string[]) => Promise<ProviderListItem[]>
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
  getRouting: () => Promise<RoutingSnapshot>
  setRoutingSettings: (patch: RoutingSettingsPatch) => Promise<RoutingSnapshot>
  setProviderQueued: (cliId: CliToolId, id: string, queued: boolean) => Promise<RoutingSnapshot>
  setQueueOrder: (cliId: CliToolId, ids: string[]) => Promise<RoutingSnapshot>
  resetBreaker: (cliId: CliToolId, id: string) => Promise<RoutingSnapshot>
  listClaudeProviders: () => Promise<ClaudeProviderListItem[]>
  listClaudePresets: () => Promise<ClaudePreset[]>
  addClaudeProvider: (draft: ClaudeProviderDraft) => Promise<ClaudeProviderListItem>
  updateClaudeProvider: (id: string, draft: ClaudeProviderDraft) => Promise<ClaudeProviderListItem>
  deleteClaudeProvider: (id: string) => Promise<void>
  reorderClaudeProviders: (ids: string[]) => Promise<ClaudeProviderListItem[]>
  enableClaudeProvider: (id: string) => Promise<ClaudeAppStatus>
  getClaudeStatus: () => Promise<ClaudeAppStatus>
  listClaudeModels: (input: {
    baseUrl: string
    apiKey?: string
    providerId?: string
    authScheme?: ClaudeAuthScheme
  }) => Promise<string[]>
  onClaudeChanged: (listener: () => void) => () => void
  listGrokProviders: () => Promise<GrokProviderListItem[]>
  listGrokPresets: () => Promise<GrokPreset[]>
  addGrokProvider: (draft: GrokProviderDraft) => Promise<GrokProviderListItem>
  updateGrokProvider: (id: string, draft: GrokProviderDraft) => Promise<GrokProviderListItem>
  deleteGrokProvider: (id: string) => Promise<void>
  reorderGrokProviders: (ids: string[]) => Promise<GrokProviderListItem[]>
  enableGrokProvider: (id: string) => Promise<GrokAppStatus>
  getGrokStatus: () => Promise<GrokAppStatus>
  listGrokModels: (input: {
    baseUrl: string
    apiKey?: string
    providerId?: string
  }) => Promise<string[]>
  onGrokChanged: (listener: () => void) => () => void
  listSkills: () => Promise<SkillListItem[]>
  refreshSkills: () => Promise<SkillListItem[]>
  installSkill: (name: string) => Promise<SkillListItem[]>
  uninstallSkill: (name: string) => Promise<SkillListItem[]>
  setSkillTarget: (name: string, target: SkillTarget, enabled: boolean) => Promise<SkillListItem[]>
  checkSkillUpdates: () => Promise<SkillListItem[]>
  updateSkill: (name: string) => Promise<SkillListItem[]>
  updateAllSkills: () => Promise<SkillListItem[]>
  listSkillRepos: () => Promise<SkillRepo[]>
  addSkillRepo: (draft: SkillRepoDraft) => Promise<SkillRepo[]>
  removeSkillRepo: (id: string) => Promise<SkillRepo[]>
  adoptSkill: (name: string) => Promise<SkillListItem[]>
  chooseSkillImport: () => Promise<SkillImportCandidate[] | null>
  importSkills: (directories: string[]) => Promise<SkillListItem[]>
  onSkillsChanged: (listener: () => void) => () => void
  listCliTools: () => Promise<CliToolStatus[]>
  installCliTool: (id: CliToolId) => Promise<CliToolStatus[]>
  updateCliTool: (id: CliToolId) => Promise<CliToolStatus[]>
  uninstallCliTool: (id: CliToolId) => Promise<CliToolStatus[]>
}
