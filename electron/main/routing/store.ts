import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  DEFAULT_ROUTING_SETTINGS,
  type RoutingSettings,
  type RoutingSettingsPatch,
} from '../../../shared/routing'
import { atomicWriteFile } from '../codex/writer'

const STORE_VERSION = 1

type RoutingFile = RoutingSettings & {
  version: number
}

export class RoutingStore {
  constructor(private readonly filePath: string) {}

  async get(): Promise<RoutingSettings> {
    return this.toSettings(await this.read())
  }

  async setQueue(queue: string[]): Promise<RoutingSettings> {
    const current = await this.read()
    current.queue = uniqueIds(queue)
    await this.write(current)
    return this.toSettings(current)
  }

  async setSettings(patch: RoutingSettingsPatch): Promise<RoutingSettings> {
    const current = await this.read()
    if (patch.failureThreshold !== undefined) {
      current.failureThreshold = clampInt(patch.failureThreshold, 1, 20, current.failureThreshold)
    }
    if (patch.recoveryWaitSeconds !== undefined) {
      current.recoveryWaitSeconds = clampInt(patch.recoveryWaitSeconds, 1, 3600, current.recoveryWaitSeconds)
    }
    if (patch.halfOpenSuccesses !== undefined) {
      current.halfOpenSuccesses = clampInt(patch.halfOpenSuccesses, 1, 10, current.halfOpenSuccesses)
    }
    await this.write(current)
    return this.toSettings(current)
  }

  async setPort(port: number | null): Promise<RoutingSettings> {
    const current = await this.read()
    current.port = normalizePort(port)
    await this.write(current)
    return this.toSettings(current)
  }

  private toSettings(file: RoutingFile): RoutingSettings {
    return {
      queue: [...file.queue],
      failureThreshold: file.failureThreshold,
      recoveryWaitSeconds: file.recoveryWaitSeconds,
      halfOpenSuccesses: file.halfOpenSuccesses,
      logRetention: file.logRetention,
      port: file.port,
    }
  }

  private async read(): Promise<RoutingFile> {
    if (!existsSync(this.filePath)) return this.emptyFile()
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<RoutingFile>
      return {
        version: STORE_VERSION,
        queue: uniqueIds(parsed.queue),
        failureThreshold: clampInt(parsed.failureThreshold, 1, 20, DEFAULT_ROUTING_SETTINGS.failureThreshold),
        recoveryWaitSeconds: clampInt(
          parsed.recoveryWaitSeconds,
          1,
          3600,
          DEFAULT_ROUTING_SETTINGS.recoveryWaitSeconds,
        ),
        halfOpenSuccesses: clampInt(
          parsed.halfOpenSuccesses,
          1,
          10,
          DEFAULT_ROUTING_SETTINGS.halfOpenSuccesses,
        ),
        logRetention: clampInt(parsed.logRetention, 10, 200, DEFAULT_ROUTING_SETTINGS.logRetention),
        port: normalizePort(parsed.port),
      }
    } catch {
      return this.emptyFile()
    }
  }

  private async write(file: RoutingFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true })
    file.version = STORE_VERSION
    await atomicWriteFile(this.filePath, `${JSON.stringify(file, null, 2)}\n`)
  }

  private emptyFile(): RoutingFile {
    return {
      version: STORE_VERSION,
      queue: [],
      failureThreshold: DEFAULT_ROUTING_SETTINGS.failureThreshold,
      recoveryWaitSeconds: DEFAULT_ROUTING_SETTINGS.recoveryWaitSeconds,
      halfOpenSuccesses: DEFAULT_ROUTING_SETTINGS.halfOpenSuccesses,
      logRetention: DEFAULT_ROUTING_SETTINGS.logRetention,
      port: null,
    }
  }
}

function uniqueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const ids: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const id = item.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    return fallback
  }
  return value
}

function normalizePort(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65535) {
    return null
  }
  return value
}
