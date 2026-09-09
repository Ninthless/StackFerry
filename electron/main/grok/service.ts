import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { AppError } from '../../../shared/app-error'
import type { GrokAppStatus } from '../../../shared/types'
import { grokConfigPath } from './home'
import {
  grokDefaultModel,
  isStackferryModelKey,
  parseToml,
} from './merge'
import { grokManagedPolicyPresent } from './policy'
import type { GrokProviderStore, StoredGrokProvider } from './store'
import {
  enableGrokDirectConfig,
  enableGrokOfficialConfig,
  enableGrokRouterConfig,
} from './writer'

function liveSession(provider: StoredGrokProvider) {
  return {
    effortLevel: provider.effortLevel,
    permissionMode: provider.permissionMode,
    contextWindow: provider.contextWindow,
    autoCompact: provider.autoCompact,
    overlayToml: provider.overlayToml,
  }
}

export type GrokEnableServiceOptions = {
  store: GrokProviderStore
  getGrokHome: () => string
  backupRoot: string
  isManaged?: () => boolean
}

export class GrokEnableService {
  constructor(private readonly options: GrokEnableServiceOptions) {}

  async writeOfficial(): Promise<void> {
    this.assertWritable()
    const previousDefault = (await this.options.store.getPreviousDefault()) ?? ''
    await enableGrokOfficialConfig({
      grokHome: this.options.getGrokHome(),
      backupRoot: this.options.backupRoot,
      previousDefault,
    })
    await this.options.store.clearPreviousDefault()
  }

  async writeDirect(provider: StoredGrokProvider): Promise<void> {
    this.assertWritable()
    await this.rememberPreviousDefault()
    await enableGrokDirectConfig({
      grokHome: this.options.getGrokHome(),
      backupRoot: this.options.backupRoot,
      provider: {
        id: provider.id,
        name: provider.name,
        model: provider.model,
        baseUrl: provider.baseUrl,
        apiBackend: provider.apiBackend,
        apiKey: this.options.store.decryptApiKey(provider),
        ...liveSession(provider),
      },
    })
  }

  async writeRouter(provider: StoredGrokProvider, port: number): Promise<void> {
    this.assertWritable()
    await this.rememberPreviousDefault()
    await enableGrokRouterConfig({
      grokHome: this.options.getGrokHome(),
      backupRoot: this.options.backupRoot,
      port,
      model: provider.model,
      ...liveSession(provider),
    })
  }

  async status(): Promise<GrokAppStatus> {
    const grokHome = this.options.getGrokHome()
    return {
      grokHome,
      configExists: existsSync(grokConfigPath(grokHome)),
      lastWriteAt: await this.options.store.getLastWriteAt(),
      activeProviderId: await this.options.store.getActiveId(),
      needsRestart: false,
    }
  }

  private async rememberPreviousDefault(): Promise<void> {
    if (await this.options.store.getPreviousDefault()) return
    const configPath = grokConfigPath(this.options.getGrokHome())
    if (!existsSync(configPath)) return
    try {
      const current = grokDefaultModel(parseToml(await readFile(configPath, 'utf8')))
      if (current && !isStackferryModelKey(current)) {
        await this.options.store.setPreviousDefault(current)
      }
    } catch (error) {
      if (error instanceof AppError) throw new AppError('grok_config_corrupt')
      throw error
    }
  }

  private assertWritable(): void {
    const probe = this.options.isManaged ?? (() => grokManagedPolicyPresent(this.options.getGrokHome()))
    if (probe()) throw new AppError('grok_managed_policy')
  }
}
