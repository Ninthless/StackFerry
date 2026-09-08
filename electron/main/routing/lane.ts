import { ROUTER_BIND_HOST, isQueuePermutation, type RoutingLanePersist, type RoutingLaneState, type RoutingPolicy } from '../../../shared/routing'
import type { ProviderKind } from '../../../shared/types'
import { CircuitBreaker } from './breaker'
import { RequestLog } from './log'
import {
  displayQueue,
  planAfterQueueChange,
  planEnable,
  planQuit,
  requestOrder,
  type ProxyRoute,
} from './policy'
import { RoutingProxy, type UpstreamTarget } from './proxy'

export type LaneAdapter = {
  listCustomIds(): Promise<string[]>
  peekActive(): Promise<{ id: string; kind: ProviderKind } | null>
  peekKind(id: string): Promise<ProviderKind | null>
  overlayNeedsRouter(id: string): Promise<boolean>
  resolveUpstream(id: string): Promise<UpstreamTarget | null>
  writeOfficial(): Promise<void>
  writeDirect(id: string): Promise<void>
  writeRouter(port: number, activeId: string): Promise<void>
  markEnabled(id: string): Promise<void>
}

export class RoutingLane {
  private readonly breaker: CircuitBreaker
  private readonly log: RequestLog
  private readonly proxy: RoutingProxy
  private live = false

  constructor(
    private readonly adapter: LaneAdapter,
    private readonly options: {
      persist: () => RoutingLanePersist
      policy: () => RoutingPolicy
      setPort: (port: number | null) => Promise<void>
      setQueue: (queue: string[]) => Promise<void>
      setNeedsRestart: (value: boolean) => void
      routes: readonly ProxyRoute[]
    },
  ) {
    this.breaker = new CircuitBreaker(() => {
      const policy = this.options.policy()
      return {
        failureThreshold: policy.failureThreshold,
        recoveryWaitMs: policy.recoveryWaitSeconds * 1000,
        halfOpenSuccesses: policy.halfOpenSuccesses,
      }
    })
    this.log = new RequestLog(() => this.options.policy().logRetention)
    this.proxy = new RoutingProxy({
      listCandidates: () => this.candidates(),
      resolveUpstream: (id) => this.adapter.resolveUpstream(id),
      admit: (id) => this.breaker.admit(id),
      recordSuccess: (id) => this.breaker.recordSuccess(id),
      recordFailure: (id) => this.breaker.recordFailure(id),
      log: (entry) => this.log.append(entry),
      routes: this.options.routes,
    })
  }

  isLive(): boolean {
    return this.live
  }

  async snapshot(): Promise<RoutingLaneState> {
    const persist = this.options.persist()
    const queue = await this.viewQueue(persist.queue)
    return {
      queue,
      port: this.proxy.getPort() ?? persist.port,
      active: this.live,
      logs: this.log.list(),
      breakers: this.breaker.snapshot(queue),
    }
  }

  async setQueueOrder(ids: string[]): Promise<void> {
    const current = await this.viewQueue(this.options.persist().queue)
    if (!Array.isArray(ids) || !isQueuePermutation(current, ids)) return
    await this.options.setQueue(ids)
    const head = ids[0]
    if (!this.live || !head) return
    const kind = await this.adapter.peekKind(head)
    if (kind !== 'custom') return
    const active = await this.adapter.peekActive()
    if (active?.id === head) return
    await this.adapter.markEnabled(head)
  }

  async resetBreaker(id: string): Promise<void> {
    if (typeof id !== 'string' || id.length === 0) return
    this.breaker.close(id)
  }

  async setQueued(id: string, queued: boolean): Promise<void> {
    const kind = await this.adapter.peekKind(id)
    if (kind !== 'custom') return
    const persist = this.options.persist()
    const active = await this.adapter.peekActive()
    const rest = persist.queue.filter((item) => item !== id)
    const queue = queued ? (id === active?.id ? [id, ...rest] : [...rest, id]) : rest
    await this.options.setQueue(queue)
    await this.applyQueuePlan()
  }

  async removeDeleted(id: string): Promise<void> {
    const persist = this.options.persist()
    if (!persist.queue.includes(id)) return
    await this.options.setQueue(persist.queue.filter((item) => item !== id))
    await this.applyQueuePlan()
  }

  async enable(id: string): Promise<void> {
    const kind = await this.adapter.peekKind(id)
    if (!kind) return
    const persist = this.options.persist()
    const needsRouter = await this.adapter.overlayNeedsRouter(id)
    const plan = planEnable(kind, persist.queue.length, this.live, needsRouter)
    await this.executeEnable(plan, id)
    await this.adapter.markEnabled(id)
    this.options.setNeedsRestart(plan.needsRestart)
  }

  async restoreOnQuit(): Promise<void> {
    const active = await this.adapter.peekActive()
    const needsRouter = active ? await this.adapter.overlayNeedsRouter(active.id) : false
    const quit = planQuit(this.live, needsRouter)
    if (quit === 'restore-direct') {
      await this.restoreDirect(active)
    }
    this.live = false
    await this.proxy.close()
  }

  async reenterIfNeeded(): Promise<void> {
    const persist = this.options.persist()
    const active = await this.adapter.peekActive()
    if (active?.kind !== 'custom') return
    const needsRouter = await this.adapter.overlayNeedsRouter(active.id)
    if (persist.queue.length < 1 && !needsRouter) return
    const port = await this.ensureProxy()
    await this.adapter.writeRouter(port, active.id)
    this.live = true
    this.options.setNeedsRestart(true)
  }

  private async executeEnable(plan: ReturnType<typeof planEnable>, id: string): Promise<void> {
    if (plan.action === 'official') {
      await this.adapter.writeOfficial()
      this.live = false
      return
    }
    if (plan.action === 'direct') {
      await this.adapter.writeDirect(id)
      this.live = false
      return
    }
    if (plan.action === 'pointer') return
    const port = await this.ensureProxy()
    await this.adapter.writeRouter(port, id)
    this.live = true
  }

  private async applyQueuePlan(): Promise<void> {
    const persist = this.options.persist()
    const active = await this.adapter.peekActive()
    const needsRouter = active ? await this.adapter.overlayNeedsRouter(active.id) : false
    const plan = planAfterQueueChange({
      queueLength: persist.queue.length,
      routerLive: this.live,
      activeKind: active?.kind ?? null,
      needsRouter,
    })
    if (plan.action === 'none') return
    if (plan.action === 'enter-router' && active?.kind === 'custom') {
      const port = await this.ensureProxy()
      await this.adapter.writeRouter(port, active.id)
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

  private async restoreDirect(active: { id: string; kind: ProviderKind } | null): Promise<void> {
    if (!active || active.kind === 'official') {
      await this.adapter.writeOfficial()
      return
    }
    await this.adapter.writeDirect(active.id)
  }

  private async ensureProxy(): Promise<number> {
    const persist = this.options.persist()
    const port = await this.proxy.listen(ROUTER_BIND_HOST, persist.port)
    if (persist.port !== port) await this.options.setPort(port)
    return port
  }

  private async candidates(): Promise<string[]> {
    const [activeId, queue] = await this.routeParts(this.options.persist().queue)
    return requestOrder(activeId, queue)
  }

  private async viewQueue(queue: string[]): Promise<string[]> {
    const [activeId, filtered] = await this.routeParts(queue)
    return displayQueue(activeId, filtered, this.live)
  }

  private async routeParts(queue: string[]): Promise<[string | null, string[]]> {
    const customIds = new Set(await this.adapter.listCustomIds())
    const active = await this.adapter.peekActive()
    const activeId = active?.kind === 'custom' ? active.id : null
    return [activeId, queue.filter((id) => customIds.has(id))]
  }
}
