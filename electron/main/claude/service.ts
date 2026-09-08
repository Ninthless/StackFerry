import { existsSync } from 'node:fs'
import { AppError } from '../../../shared/app-error'
import { ROUTER_BIND_HOST, ROUTER_PLACEHOLDER_KEY } from '../../../shared/routing'
import { desktopSupports1m, parseClaudeSession } from '../../../shared/claude-session'
import type { ClaudeAppStatus } from '../../../shared/types'
import { enableCodeGateway, enableCodeOfficial } from './code-writer'
import { enableDesktopGateway, enableDesktopOfficial } from './desktop-writer'
import { claudeSettingsPath } from './home'
import { createWindowsClaudePolicyProbe, type ManagedPolicyProbe } from './policy'
import type { ClaudeProviderStore, StoredClaudeProvider } from './store'

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
    await this.assertWritable()
    const provider = await this.options.store.peek(id)
    if (provider.kind === 'official') await this.writeOfficial()
    else await this.writeDirect(provider)
    await this.options.store.markEnabled(id)
  }

  async writeOfficial(): Promise<void> {
    await this.assertWritable()
    const claudeHome = this.options.getClaudeHome()
    const backupRoot = this.options.backupRoot
    const isManaged = this.probe()
    await enableCodeOfficial({ claudeHome, backupRoot })
    for (const library of this.options.getDesktopLibraries()) {
      await enableDesktopOfficial({ library, backupRoot, isManaged })
    }
  }

  async writeDirect(provider: StoredClaudeProvider): Promise<void> {
    await this.writeGateway(provider, provider.baseUrl, this.options.store.decryptApiKey(provider))
  }

  async writeRouter(provider: StoredClaudeProvider, port: number): Promise<void> {
    await this.writeGateway(provider, `http://${ROUTER_BIND_HOST}:${port}`, ROUTER_PLACEHOLDER_KEY)
  }

  async status(): Promise<ClaudeAppStatus> {
    const claudeHome = this.options.getClaudeHome()
    return {
      claudeHome,
      settingsExists: existsSync(claudeSettingsPath(claudeHome)),
      desktopLibrary: this.options.getDesktopLibraries()[0] ?? '',
      lastWriteAt: await this.options.store.getLastWriteAt(),
      activeProviderId: await this.options.store.getActiveId(),
      needsRestart: false,
    }
  }

  private async writeGateway(
    provider: StoredClaudeProvider,
    baseUrl: string,
    apiKey: string,
  ): Promise<void> {
    await this.assertWritable()
    const session = parseClaudeSession(provider)
    const live = {
      name: provider.name,
      baseUrl,
      apiKey,
      authScheme: provider.authScheme,
      model: provider.model,
      effortLevel: provider.effortLevel,
      contextWindow: provider.contextWindow,
      autoCompact: provider.autoCompact,
      overlayJson: provider.overlayJson,
      supports1m: desktopSupports1m(session.contextWindow),
    }
    const claudeHome = this.options.getClaudeHome()
    const backupRoot = this.options.backupRoot
    const isManaged = this.probe()
    await enableCodeGateway({ claudeHome, backupRoot, provider: live })
    for (const library of this.options.getDesktopLibraries()) {
      await enableDesktopGateway({ library, backupRoot, provider: live, isManaged })
    }
  }

  private probe(): ManagedPolicyProbe {
    return this.options.isManaged ?? createWindowsClaudePolicyProbe()
  }

  private async assertWritable(): Promise<void> {
    if (await this.probe()()) {
      throw new AppError('claude_desktop_managed_policy')
    }
  }
}
