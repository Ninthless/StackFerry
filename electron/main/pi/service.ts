import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import type { PiAppStatus } from '../../../shared/types'
import { parsePiJson, rememberedPiDefault } from './config'
import { piModelsPath, piSettingsPath } from './home'
import type { PiProviderStore, StoredPiProvider } from './store'
import { enablePiDirectConfig, enablePiOfficialConfig, enablePiRouterConfig } from './writer'

export type PiEnableServiceOptions = {
  store: PiProviderStore
  getPiHome: () => string
  backupRoot: string
}

export class PiEnableService {
  constructor(private readonly options: PiEnableServiceOptions) {}

  async writeOfficial(): Promise<void> {
    await this.rememberPreviousDefault()
    const previous = await this.options.store.getPreviousDefault()
    await enablePiOfficialConfig({
      piHome: this.options.getPiHome(),
      backupRoot: this.options.backupRoot,
      previous,
    })
    await this.options.store.clearPreviousDefault()
  }

  async writeDirect(provider: StoredPiProvider): Promise<void> {
    await this.rememberPreviousDefault()
    await enablePiDirectConfig({
      piHome: this.options.getPiHome(),
      backupRoot: this.options.backupRoot,
      provider: this.live(provider),
    })
  }

  async writeRouter(provider: StoredPiProvider, port: number): Promise<void> {
    await this.rememberPreviousDefault()
    await enablePiRouterConfig({
      piHome: this.options.getPiHome(),
      backupRoot: this.options.backupRoot,
      port,
      provider: this.live(provider),
    })
  }

  async status(): Promise<PiAppStatus> {
    const piHome = this.options.getPiHome()
    return {
      piHome,
      configExists: existsSync(piModelsPath(piHome)) || existsSync(piSettingsPath(piHome)),
      lastWriteAt: await this.options.store.getLastWriteAt(),
      activeProviderId: await this.options.store.getActiveId(),
      needsRestart: false,
    }
  }

  private live(provider: StoredPiProvider) {
    return {
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      model: provider.model,
      api: provider.api,
      apiKey: this.options.store.decryptApiKey(provider),
      thinkingLevel: provider.thinkingLevel,
      contextWindow: provider.contextWindow,
    }
  }

  private async rememberPreviousDefault(): Promise<void> {
    if (await this.options.store.getPreviousDefault()) return
    const settingsPath = piSettingsPath(this.options.getPiHome())
    if (!existsSync(settingsPath)) return
    const previous = rememberedPiDefault(parsePiJson(await readFile(settingsPath, 'utf8')))
    if (previous) await this.options.store.setPreviousDefault(previous)
  }
}
