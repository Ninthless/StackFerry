import {
  DEFAULT_ROUTING_SETTINGS,
  ROUTER_BIND_HOST,
  type RoutingSettings,
  type RoutingSettingsPatch,
  type RoutingState,
} from '../../../shared/routing'
import { isPlainObject, parseProviderOverlay } from '../../../shared/provider-overlay'
import type { StoredProvider } from '../providers/store'
import type { ProviderStore } from '../providers/store'
import {
  enableOfficialLiveConfig,
  enableRouterLiveConfig,
  enableThirdPartyLiveConfig,
} from '../codex/writer'
import { CircuitBreaker } from './breaker'
import { RequestLog } from './log'
import { planAfterQueueChange, planEnable, planQuit, requestOrder } from './policy'
import { RoutingProxy, type UpstreamTarget } from './proxy'
import { RoutingStore } from './store'

type LiveHomes = {
  codexHome: string
  backupRoot: string
}

export class RoutingService {
  private readonly breaker: CircuitBreaker
  private readonly log: RequestLog
  private readonly proxy: RoutingProxy
  private settings: RoutingSettings | null = null
  private live = false

  constructor(
    private readonly options: {
      store: RoutingStore
      providers: ProviderStore
      getCodexHome: () => string
      backupRoot: string
      setNeedsRestart: (value: boolean) => void
    },
  ) {
    this.breaker = new CircuitBreaker(() => {
      const current = this.cached()
      return {
        failureThreshold: current.failureThreshold,
        recoveryWaitMs: current.recoveryWaitSeconds * 1000,
        halfOpenSuccesses: current.halfOpenSuccesses,
      }
    })
    this.log = new RequestLog(() => this.cached().logRetention)
    this.proxy = new RoutingProxy({
      listCandidates: () => this.candidates(),
      resolveUpstream: (id) => this.resolveUpstream(id),
      admit: (id) => this.breaker.admit(id),
      recordSuccess: (id) => this.breaker.recordSuccess(id),
      recordFailure: (id) => this.breaker.recordFailure(id),
      log: (entry) => this.log.append(entry),
    })
  }

  isLive(): boolean {
    return this.live
  }

  async start(): Promise<void> {
    await this.refresh()
    await this.reenterIfNeeded()
  }

  async snapshot(): Promise<RoutingState> {
    const settings = await this.refresh()
    return {
      ...settings,
      active: this.live,
      port: this.proxy.getPort() ?? settings.port,
      logs: this.log.list(),
      breakers: this.breaker.snapshot(settings.queue),
    }
  }

  async setSettings(patch: RoutingSettingsPatch): Promise<RoutingState> {
    this.settings = await this.options.store.setSettings(patch)
    return this.snapshot()
  }

  async setQueued(id: string, queued: boolean): Promise<RoutingState> {
    const provider = await this.options.providers.peek(id)
    if (provider.kind !== 'custom') return this.snapshot()
    const settings = await this.refresh()
    const activeId = await this.options.providers.getActiveId()
    const rest = settings.queue.filter((item) => item !== id)
    const queue = queued ? (id === activeId ? [id, ...rest] : [...rest, id]) : rest
    this.settings = await this.options.store.setQueue(queue)
    await this.applyQueuePlan()
    return this.snapshot()
  }

  async removeDeleted(id: string): Promise<void> {
    const settings = await this.refresh()
    if (!settings.queue.includes(id)) return
    this.settings = await this.options.store.setQueue(settings.queue.filter((item) => item !== id))
    await this.applyQueuePlan()
  }

  async enable(id: string): Promise<void> {
    const provider = await this.options.providers.peek(id)
    const settings = await this.refresh()
    if (provider.kind === 'custom' && settings.queue.includes(id) && settings.queue[0] !== id) {
      this.settings = await this.options.store.setQueue([
        id,
        ...settings.queue.filter((item) => item !== id),
      ])
    }
    const queueLength = (this.settings ?? settings).queue.length
    const plan = planEnable(provider.kind, queueLength, this.live)
    await this.executeEnable(plan, provider)
    await this.options.providers.markEnabled(id)
    this.options.setNeedsRestart(plan.needsRestart)
  }

  async restoreOnQuit(): Promise<void> {
    if (planQuit(this.live) === 'restore-direct') {
      await this.restoreDirect(await this.peekActive())
      this.live = false
    }
    await this.proxy.close()
  }

  private async executeEnable(
    plan: ReturnType<typeof planEnable>,
    provider: StoredProvider,
  ): Promise<void> {
    const homes = this.homes()
    if (plan.action === 'official') {
      await enableOfficialLiveConfig(homes)
      this.live = false
      return
    }
    if (plan.action === 'direct') {
      await this.writeDirect(provider, homes)
      this.live = false
      return
    }
    if (plan.action === 'pointer') return
    const port = await this.ensureProxy()
    await enableRouterLiveConfig({
      ...homes,
      port,
      provider: { tomlText: provider.tomlText },
    })
    this.live = true
  }

  private async applyQueuePlan(): Promise<void> {
    const settings = await this.refresh()
    const active = await this.peekActive()
    const plan = planAfterQueueChange({
      queueLength: settings.queue.length,
      routerLive: this.live,
      activeKind: active?.kind ?? null,
    })
    if (plan.action === 'none') return
    if (plan.action === 'enter-router' && active?.kind === 'custom') {
      const port = await this.ensureProxy()
      await enableRouterLiveConfig({
        ...this.homes(),
        port,
        provider: { tomlText: active.tomlText },
      })
      this.live = true
      this.options.setNeedsRestart(true)
      return
    }
    if (plan.action === 'leave-router') {
      await this.restoreDirect(active)
      this.live = false
      this.options.setNeedsRestart(true)
    }
  }

  private async reenterIfNeeded(): Promise<void> {
    const settings = await this.refresh()
    const active = await this.peekActive()
    if (active?.kind !== 'custom' || settings.queue.length < 1) return
    const port = await this.ensureProxy()
    await enableRouterLiveConfig({
      ...this.homes(),
      port,
      provider: { tomlText: active.tomlText },
    })
    this.live = true
    this.options.setNeedsRestart(true)
  }

  private async restoreDirect(active: StoredProvider | null): Promise<void> {
    const homes = this.homes()
    if (!active || active.kind === 'official') {
      await enableOfficialLiveConfig(homes)
      return
    }
    await this.writeDirect(active, homes)
  }

  private async writeDirect(provider: StoredProvider, homes: LiveHomes): Promise<void> {
    await enableThirdPartyLiveConfig({
      ...homes,
      provider: {
        id: provider.id,
        name: provider.name,
        tomlText: provider.tomlText,
        apiKey: this.options.providers.decryptApiKey(provider),
      },
    })
  }

  private async ensureProxy(): Promise<number> {
    const settings = await this.refresh()
    const port = await this.proxy.listen(ROUTER_BIND_HOST, settings.port)
    if (settings.port !== port) {
      this.settings = await this.options.store.setPort(port)
    }
    return port
  }

  private async candidates(): Promise<string[]> {
    const settings = this.cached()
    const providers = await this.options.providers.list()
    const customIds = new Set(providers.filter((item) => item.kind === 'custom').map((item) => item.id))
    const active = providers.find((item) => item.enabled && item.kind === 'custom')
    return requestOrder(active?.id ?? null, settings.queue.filter((id) => customIds.has(id)))
  }

  private async resolveUpstream(id: string): Promise<UpstreamTarget | null> {
    try {
      const provider = await this.options.providers.peek(id)
      if (provider.kind !== 'custom') return null
      const overlay = parseProviderOverlay(provider.tomlText)
      const baseUrl = typeof overlay.table.base_url === 'string' ? overlay.table.base_url.trim() : ''
      if (!baseUrl) return null
      let apiKey = ''
      try {
        apiKey = this.options.providers.decryptApiKey(provider)
      } catch {
        apiKey = ''
      }
      return {
        id: provider.id,
        baseUrl,
        apiKey,
        queryParams: stringRecord(overlay.table.query_params),
      }
    } catch {
      return null
    }
  }

  private async peekActive(): Promise<StoredProvider | null> {
    const id = await this.options.providers.getActiveId()
    if (!id) return null
    try {
      return await this.options.providers.peek(id)
    } catch {
      return null
    }
  }

  private async refresh(): Promise<RoutingSettings> {
    this.settings = await this.options.store.get()
    return this.settings
  }

  private cached(): RoutingSettings {
    if (this.settings) return this.settings
    return {
      queue: [],
      failureThreshold: DEFAULT_ROUTING_SETTINGS.failureThreshold,
      recoveryWaitSeconds: DEFAULT_ROUTING_SETTINGS.recoveryWaitSeconds,
      halfOpenSuccesses: DEFAULT_ROUTING_SETTINGS.halfOpenSuccesses,
      logRetention: DEFAULT_ROUTING_SETTINGS.logRetention,
      port: null,
    }
  }

  private homes(): LiveHomes {
    return {
      codexHome: this.options.getCodexHome(),
      backupRoot: this.options.backupRoot,
    }
  }
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!isPlainObject(value)) return undefined
  const record: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' || typeof item === 'number') {
      record[key] = String(item)
    }
  }
  return Object.keys(record).length > 0 ? record : undefined
}
