import type { BreakerStateName, RoutingBreakerView } from '../../../shared/routing'

export type BreakerSettings = {
  failureThreshold: number
  recoveryWaitMs: number
  halfOpenSuccesses: number
}

type Entry = {
  state: BreakerStateName
  failures: number
  openedAt: number
  halfOpenSuccesses: number
  halfOpenInFlight: boolean
}

export class CircuitBreaker {
  private readonly entries = new Map<string, Entry>()

  constructor(
    private readonly settings: () => BreakerSettings,
    private readonly now: () => number = Date.now,
  ) {}

  admit(id: string): boolean {
    const entry = this.ensure(id)
    this.tick(entry)
    if (entry.state === 'open') return false
    if (entry.state === 'halfOpen') {
      if (entry.halfOpenInFlight) return false
      entry.halfOpenInFlight = true
    }
    return true
  }

  recordSuccess(id: string): void {
    const entry = this.ensure(id)
    entry.halfOpenInFlight = false
    if (entry.state === 'halfOpen') {
      entry.halfOpenSuccesses += 1
      if (entry.halfOpenSuccesses >= this.settings().halfOpenSuccesses) {
        this.reset(entry)
      }
      return
    }
    entry.failures = 0
  }

  recordFailure(id: string): void {
    const entry = this.ensure(id)
    entry.halfOpenInFlight = false
    if (entry.state === 'halfOpen' || entry.state === 'open') {
      this.open(entry)
      return
    }
    entry.failures += 1
    if (entry.failures >= this.settings().failureThreshold) {
      this.open(entry)
    }
  }

  snapshot(ids: string[]): RoutingBreakerView[] {
    return ids.map((id) => {
      const entry = this.ensure(id)
      this.tick(entry)
      return { providerId: id, state: entry.state }
    })
  }

  private tick(entry: Entry): void {
    if (entry.state !== 'open') return
    if (this.now() - entry.openedAt < this.settings().recoveryWaitMs) return
    entry.state = 'halfOpen'
    entry.halfOpenSuccesses = 0
    entry.halfOpenInFlight = false
  }

  private open(entry: Entry): void {
    entry.state = 'open'
    entry.openedAt = this.now()
    entry.halfOpenSuccesses = 0
    entry.halfOpenInFlight = false
  }

  private reset(entry: Entry): void {
    entry.state = 'closed'
    entry.failures = 0
    entry.openedAt = 0
    entry.halfOpenSuccesses = 0
    entry.halfOpenInFlight = false
  }

  private ensure(id: string): Entry {
    const existing = this.entries.get(id)
    if (existing) return existing
    const created: Entry = {
      state: 'closed',
      failures: 0,
      openedAt: 0,
      halfOpenSuccesses: 0,
      halfOpenInFlight: false,
    }
    this.entries.set(id, created)
    return created
  }
}
