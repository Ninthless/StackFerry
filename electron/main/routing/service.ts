import {
  ROUTING_LANE_IDS,
  emptyRoutingSettings,
  type RoutingLaneId,
  type RoutingLaneState,
  type RoutingSettings,
  type RoutingSettingsPatch,
  type RoutingSnapshot,
} from '../../../shared/routing'
import type { ClaudeEnableService } from '../claude/service'
import type { ClaudeProviderStore } from '../claude/store'
import type { GrokEnableService } from '../grok/service'
import type { GrokProviderStore } from '../grok/store'
import type { ProviderStore } from '../providers/store'
import { createClaudeAdapter } from './claude-adapter'
import { createCodexAdapter } from './codex-adapter'
import { createGrokAdapter } from './grok-adapter'
import { RoutingLane } from './lane'
import { RoutingStore } from './store'

export class RoutingService {
  private settings: RoutingSettings | null = null
  private readonly lanes: Record<RoutingLaneId, RoutingLane>

  constructor(
    private readonly options: {
      store: RoutingStore
      providers: ProviderStore
      claudeStore: ClaudeProviderStore
      claude: ClaudeEnableService
      grokStore: GrokProviderStore
      grok: GrokEnableService
      getCodexHome: () => string
      backupRoot: string
      setNeedsRestart: (value: boolean) => void
    },
  ) {
    this.lanes = {
      codex: new RoutingLane(createCodexAdapter(options), this.laneOptions('codex', ['responses', 'models'])),
      'claude-code': new RoutingLane(
        createClaudeAdapter({ store: options.claudeStore, claude: options.claude }),
        this.laneOptions('claude-code', ['messages', 'models']),
      ),
      'grok-build': new RoutingLane(
        createGrokAdapter({ store: options.grokStore, grok: options.grok }),
        this.laneOptions('grok-build', ['responses', 'models']),
      ),
    }
  }

  async start(): Promise<void> {
    await this.refresh()
    for (const id of ROUTING_LANE_IDS) await this.lanes[id].reenterIfNeeded()
  }

  async snapshot(): Promise<RoutingSnapshot> {
    const settings = await this.refresh()
    const lanes = {} as Record<RoutingLaneId, RoutingLaneState>
    for (const id of ROUTING_LANE_IDS) lanes[id] = await this.lanes[id].snapshot()
    return {
      failureThreshold: settings.failureThreshold,
      recoveryWaitSeconds: settings.recoveryWaitSeconds,
      halfOpenSuccesses: settings.halfOpenSuccesses,
      logRetention: settings.logRetention,
      lanes,
    }
  }

  async setSettings(patch: RoutingSettingsPatch): Promise<RoutingSnapshot> {
    this.settings = await this.options.store.setSettings(patch)
    return this.snapshot()
  }

  async setQueueOrder(laneId: RoutingLaneId, ids: string[]): Promise<RoutingSnapshot> {
    await this.lane(laneId).setQueueOrder(ids)
    return this.snapshot()
  }

  async resetBreaker(laneId: RoutingLaneId, id: string): Promise<RoutingSnapshot> {
    await this.lane(laneId).resetBreaker(id)
    return this.snapshot()
  }

  async setQueued(laneId: RoutingLaneId, id: string, queued: boolean): Promise<RoutingSnapshot> {
    await this.lane(laneId).setQueued(id, queued)
    return this.snapshot()
  }

  async removeDeleted(laneId: RoutingLaneId, id: string): Promise<void> {
    await this.lane(laneId).removeDeleted(id)
  }

  async enable(laneId: RoutingLaneId, id: string): Promise<void> {
    await this.lane(laneId).enable(id)
  }

  async restoreOnQuit(): Promise<void> {
    for (const id of ROUTING_LANE_IDS) await this.lanes[id].restoreOnQuit()
  }

  private lane(id: RoutingLaneId): RoutingLane {
    return this.lanes[id]
  }

  private laneOptions(id: RoutingLaneId, routes: readonly ['responses', 'models'] | readonly ['messages', 'models']) {
    return {
      persist: () => this.cached().lanes[id],
      policy: () => this.cached(),
      setPort: async (port: number | null) => {
        this.settings = await this.options.store.setPort(id, port)
      },
      setQueue: async (queue: string[]) => {
        this.settings = await this.options.store.setQueue(id, queue)
      },
      setNeedsRestart: this.options.setNeedsRestart,
      routes,
    }
  }

  private async refresh(): Promise<RoutingSettings> {
    this.settings = await this.options.store.get()
    return this.settings
  }

  private cached(): RoutingSettings {
    return this.settings ?? emptyRoutingSettings()
  }
}
