import { existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { AppError } from '../../../shared/app-error'
import {
  CCSW_DB_FILE_NAME,
  CCSW_DIR_NAME,
  parseCcswRows,
  type CcswImportCandidate,
  type CcswImportResult,
  type CcswProviderRow,
} from '../../../shared/ccsw-import'
import type { ClaudeProviderStore } from '../claude/store'
import type { ProviderStore } from '../codex/store'

type CcswServiceDeps = {
  getHomedir: () => string
  providerStore: ProviderStore
  claudeStore: ClaudeProviderStore
}

type ProviderRowRecord = {
  id: unknown
  app_type: unknown
  name: unknown
  category: unknown
  settings_config: unknown
}

export class CcswImportService {
  constructor(private readonly deps: CcswServiceDeps) {}

  defaultDbPath(): string {
    return path.join(this.deps.getHomedir(), CCSW_DIR_NAME, CCSW_DB_FILE_NAME)
  }

  async detect(): Promise<CcswImportCandidate | null> {
    const dbPath = this.defaultDbPath()
    if (!existsSync(dbPath)) return null
    try {
      return await this.preview(dbPath)
    } catch {
      return null
    }
  }

  async preview(inputPath: string): Promise<CcswImportCandidate> {
    const dbPath = await this.resolveDbFile(inputPath)
    const rows = this.readRows(dbPath)
    const batch = parseCcswRows(rows)
    return {
      dbPath,
      codex: batch.codex.length,
      claude: batch.claude.length,
      skipped: batch.skipped.length,
    }
  }

  async importFrom(inputPath: string): Promise<CcswImportResult> {
    const dbPath = await this.resolveDbFile(inputPath)
    const rows = this.readRows(dbPath)
    const batch = parseCcswRows(rows)
    if (batch.codex.length === 0 && batch.claude.length === 0) {
      throw new AppError('ccsw_no_providers')
    }
    const [codexResult, claudeResult] = await Promise.all([
      this.deps.providerStore.importDrafts(batch.codex.map((item) => item.draft)),
      this.deps.claudeStore.importDrafts(batch.claude.map((item) => item.draft)),
    ])
    return {
      dbPath,
      importedCodex: codexResult.imported,
      importedClaude: claudeResult.imported,
      skipped: batch.skipped.length + codexResult.skipped + claudeResult.skipped,
    }
  }

  private readRows(dbPath: string): CcswProviderRow[] {
    let db: DatabaseSync | null = null
    try {
      db = new DatabaseSync(dbPath, { readOnly: true })
      const records = db
        .prepare(
          'select id, app_type, name, category, settings_config from providers order by app_type, sort_index',
        )
        .all() as ProviderRowRecord[]
      return records.map(normalizeRow)
    } catch (error) {
      if (error instanceof AppError) throw error
      throw new AppError('ccsw_db_corrupt')
    } finally {
      db?.close()
    }
  }

  private async resolveDbFile(inputPath: string): Promise<string> {
    const trimmed = inputPath.trim()
    if (!trimmed) throw new AppError('ccsw_not_found')
    let info
    try {
      info = await stat(trimmed)
    } catch {
      throw new AppError('ccsw_not_found')
    }
    if (info.isFile()) return trimmed
    if (info.isDirectory()) return path.join(trimmed, CCSW_DB_FILE_NAME)
    throw new AppError('ccsw_not_found')
  }
}

function normalizeRow(record: ProviderRowRecord): CcswProviderRow {
  return {
    id: typeof record.id === 'string' ? record.id : '',
    appType: typeof record.app_type === 'string' ? record.app_type : '',
    name: typeof record.name === 'string' ? record.name : '',
    category: typeof record.category === 'string' ? record.category : null,
    settingsConfig: typeof record.settings_config === 'string' ? record.settings_config : '',
  }
}
