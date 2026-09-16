import { CLI_TOOL_IDS, type CliToolId } from '../../shared/cli-tools'
import type { MicaState } from '../../shared/mica'
import type { LanguagePreference } from '../../shared/types'
import type { ThemePreference } from '../../shared/theme'
import type { ClaudeEnableService } from './claude/service'
import type { ClaudeProviderStore } from './claude/store'
import type { ProviderStore } from './codex/store'
import type { GrokEnableService } from './grok/service'
import type { GrokProviderStore } from './grok/store'
import type { McpService } from './mcp/service'
import type { CcswImportService } from './ccsw/service'
import type { LegacyImportService } from './legacy/service'
import type { AppReleaseService } from './releases/service'
import type { RoutingService } from './routing/service'
import type { SkillService } from './skills/service'

export type AppIpcContext = {
  store: ProviderStore
  routing: RoutingService
  claudeStore: ClaudeProviderStore
  claude: ClaudeEnableService
  grokStore: GrokProviderStore
  grok: GrokEnableService
  getCodexHome: () => string
  getGrokHome: () => string
  backupRoot: string
  getNeedsRestart: () => boolean
  setNeedsRestart: (value: boolean) => void
  onChanged: () => void
  onClaudeChanged: () => void
  onGrokChanged: () => void
  skills: SkillService
  mcp: McpService
  releases: AppReleaseService
  legacyImport: LegacyImportService
  ccswImport: CcswImportService
  onSkillsChanged: () => void
  onMcpsChanged: () => void
  getLocalePreference: () => Promise<LanguagePreference>
  setLocalePreference: (preference: LanguagePreference) => Promise<LanguagePreference>
  getMicaState: () => Promise<MicaState>
  setMicaPreference: (enabled: boolean) => Promise<MicaState>
  getThemePreference: () => Promise<ThemePreference>
  setThemePreference: (preference: ThemePreference) => Promise<ThemePreference>
  getOnboardingCompleted: () => Promise<boolean>
  setOnboardingCompleted: (completed: boolean) => Promise<boolean>
}

export type WriteChains = Record<CliToolId, Promise<void>>

export function emptyWriteChains(): WriteChains {
  return Object.fromEntries(CLI_TOOL_IDS.map((id) => [id, Promise.resolve()])) as WriteChains
}

export function enqueue(chain: Promise<void>, work: () => Promise<void>): Promise<void> {
  return chain.catch(() => undefined).then(work)
}
