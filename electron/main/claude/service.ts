import { existsSync } from 'node:fs'
import { AppError } from '../../../shared/app-error'
import { desktopSupports1m, parseClaudeSession } from '../../../shared/claude-session'
import type { ClaudeAppStatus } from '../../../shared/types'
import { enableCodeGateway, enableCodeOfficial } from './code-writer'
import { enableDesktopGateway, enableDesktopOfficial } from './desktop-writer'
import { claudeSettingsPath } from './home'
import { createWindowsClaudePolicyProbe, type ManagedPolicyProbe } from './policy'
import type { ClaudeProviderStore } from './store'

export type ClaudeEnableServiceOptions = {
  store: ClaudeProviderStore
  getClaudeHome: () => string
  getDesktopLibraries: () => string[]
  backupRoot: string
  isManaged?: ManagedPolicyProbe
}

export class ClaudeEnableService {
  constructor(private readonly options: ClaudeEnableServiceOptions) {}

  async enable(id: string): Promise<void> {
    const probe = this.options.isManaged ?? createWindowsClaudePolicyProbe()
    if (await probe()) {
      throw new AppError('claude_desktop_managed_policy')
    }
    const provider = await this.options.store.peek(id)
    const claudeHome = this.options.getClaudeHome()
    const libraries = this.options.getDesktopLibraries()
    const backupRoot = this.options.backupRoot
    const isManaged = probe
    if (provider.kind === 'official') {
      await enableCodeOfficial({ claudeHome, backupRoot })
      for (const library of libraries) {
        await enableDesktopOfficial({ library, backupRoot, isManaged })
      }
    } else {
      const apiKey = this.options.store.decryptApiKey(provider)
      const session = parseClaudeSession(provider)
      const live = {
        name: provider.name,
        baseUrl: provider.baseUrl,
        apiKey,
        authScheme: provider.authScheme,
        model: provider.model,
        effortLevel: provider.effortLevel,
        contextWindow: provider.contextWindow,
        autoCompact: provider.autoCompact,
        overlayJson: provider.overlayJson,
        supports1m: desktopSupports1m(session.contextWindow),
      }
      await enableCodeGateway({ claudeHome, backupRoot, provider: live })
      for (const library of libraries) {
        await enableDesktopGateway({ library, backupRoot, provider: live, isManaged })
      }
    }
    await this.options.store.markEnabled(id)
  }

  async status(): Promise<ClaudeAppStatus> {
    const claudeHome = this.options.getClaudeHome()
    return {
      claudeHome,
      settingsExists: existsSync(claudeSettingsPath(claudeHome)),
      desktopLibrary: this.options.getDesktopLibraries()[0] ?? '',
      lastWriteAt: await this.options.store.getLastWriteAt(),
      activeProviderId: await this.options.store.getActiveId(),
    }
  }
}
