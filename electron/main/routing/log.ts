import type { RoutingLogEntry } from '../../../shared/routing'

const EMPTY_ERROR = ''

export class RequestLog {
  private entries: RoutingLogEntry[] = []

  constructor(private readonly limit: () => number) {}

  append(entry: Omit<RoutingLogEntry, 'at'> & { at?: string }): void {
    this.entries.push({
      at: entry.at ?? new Date().toISOString(),
      providerId: entry.providerId,
      model: entry.model,
      status: entry.status,
      latencyMs: entry.latencyMs,
      errorCode: entry.errorCode || EMPTY_ERROR,
    })
    const max = Math.max(1, this.limit())
    if (this.entries.length > max) {
      this.entries = this.entries.slice(this.entries.length - max)
    }
  }

  list(): RoutingLogEntry[] {
    return [...this.entries].reverse()
  }
}
