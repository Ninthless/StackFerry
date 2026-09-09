import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { atomicWriteFile } from '../codex/writer'

type AnnouncementFile = {
  seenIds: string[]
  seeded: boolean
}

const EMPTY: AnnouncementFile = { seenIds: [], seeded: false }

export class AnnouncementStore {
  constructor(private readonly filePath: string) {}

  async seenIds(): Promise<Set<string>> {
    return new Set((await this.read()).seenIds)
  }

  async seedIfEmpty(ids: string[]): Promise<void> {
    const current = await this.read()
    if (current.seeded) return
    await this.write({
      seenIds: unique([...current.seenIds, ...ids]),
      seeded: true,
    })
  }

  async markRead(ids: string[]): Promise<void> {
    const current = await this.read()
    await this.write({
      seenIds: unique([...current.seenIds, ...ids]),
      seeded: true,
    })
  }

  private async read(): Promise<AnnouncementFile> {
    if (!existsSync(this.filePath)) return EMPTY
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<AnnouncementFile>
      const seenIds = Array.isArray(parsed.seenIds)
        ? parsed.seenIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : []
      return { seenIds, seeded: parsed.seeded === true }
    } catch {
      return EMPTY
    }
  }

  private async write(file: AnnouncementFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true })
    await atomicWriteFile(this.filePath, `${JSON.stringify(file, null, 2)}\n`)
  }
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)]
}
