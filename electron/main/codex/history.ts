import { copyFile, mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  isLegacyOwnedCodexProviderKey,
  STACKFERRY_LEGACY_LIVE_PROVIDER_KEY,
  STACKFERRY_LIVE_PROVIDER_KEY,
  STACKFERRY_PREFIX,
} from './merge'

// 只改 session_meta / threads.model_provider；openai 官方会话不搬，避免 invalid_encrypted_content。
export const HISTORY_MIGRATION_NAME = 'codex-history-provider-v1'

const JSONL_ROOTS = [
  { dir: 'sessions', maxDepth: 8 },
  { dir: 'archived_sessions', maxDepth: 4 },
] as const

const STATE_DB_NAME = /^state_\d+\.sqlite$/
const LEGACY_OWNED_SQL =
  `model_provider = '${STACKFERRY_LEGACY_LIVE_PROVIDER_KEY}' OR model_provider LIKE '${STACKFERRY_PREFIX}%'`

export type HistoryMigrationOutcome = {
  jsonlFiles: number
  stateRows: number
  backupPath: string | null
}

export async function migrateCodexHistoryProviderBucket(options: {
  codexHome: string
  backupRoot: string
  sqliteHome?: string
  env?: NodeJS.ProcessEnv
}): Promise<HistoryMigrationOutcome> {
  const backup: { root: string; path: string | null } = {
    root: options.backupRoot,
    path: null,
  }
  const jsonlFiles = await migrateJsonlFiles(options.codexHome, backup)
  const stateRows = await migrateStateDbs(options, backup)
  return { jsonlFiles, stateRows, backupPath: backup.path }
}

async function migrateJsonlFiles(
  codexHome: string,
  backup: { root: string; path: string | null },
): Promise<number> {
  const files: string[] = []
  for (const root of JSONL_ROOTS) {
    await collectJsonlFiles(path.join(codexHome, root.dir), 0, root.maxDepth, files)
  }
  let migrated = 0
  for (const filePath of files) {
    if (await rewriteJsonlFile(filePath, codexHome, backup)) migrated += 1
  }
  return migrated
}

async function collectJsonlFiles(
  dir: string,
  depth: number,
  maxDepth: number,
  files: string[],
): Promise<void> {
  if (depth > maxDepth) return
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await collectJsonlFiles(fullPath, depth + 1, maxDepth, files)
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(fullPath)
  }
}

async function rewriteJsonlFile(
  filePath: string,
  codexHome: string,
  backup: { root: string; path: string | null },
): Promise<boolean> {
  let before
  try {
    before = await stat(filePath)
  } catch {
    return false
  }
  let content
  try {
    content = await readFile(filePath, 'utf8')
  } catch {
    return false
  }

  let changed = false
  let next = ''
  for (const segment of content.split(/(?<=\n)/)) {
    const hasNewline = segment.endsWith('\n')
    const rawLine = hasNewline ? segment.slice(0, -1) : segment
    const rewritten = rewriteSessionMetaLine(rawLine)
    if (rewritten === null) {
      next += segment
      continue
    }
    changed = true
    next += hasNewline ? `${rewritten}\n` : rewritten
  }
  if (!changed) return false

  try {
    await assertUnchanged(filePath, before)
    await backupFile(filePath, codexHome, backup, 'jsonl')
    await assertUnchanged(filePath, before)
    await atomicWriteFile(filePath, next)
    await utimes(filePath, before.atime, before.mtime)
    return true
  } catch {
    return false
  }
}

function rewriteSessionMetaLine(line: string): string | null {
  const trimmed = line.endsWith('\r') ? line.slice(0, -1) : line
  if (!trimmed.includes('"session_meta"') || !trimmed.includes('"model_provider"')) return null
  let value: unknown
  try {
    value = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (!isRecord(value) || value.type !== 'session_meta' || !isRecord(value.payload)) return null
  const current = value.payload.model_provider
  if (typeof current !== 'string' || !isLegacyOwnedCodexProviderKey(current)) return null
  value.payload.model_provider = STACKFERRY_LIVE_PROVIDER_KEY
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

async function migrateStateDbs(
  options: {
    codexHome: string
    sqliteHome?: string
    env?: NodeJS.ProcessEnv
  },
  backup: { root: string; path: string | null },
): Promise<number> {
  const dbPaths = await collectStateDbPaths(options)
  let migrated = 0
  for (const dbPath of dbPaths) {
    migrated += await migrateStateDb(dbPath, options.codexHome, backup)
  }
  return migrated
}

async function collectStateDbPaths(options: {
  codexHome: string
  sqliteHome?: string
  env?: NodeJS.ProcessEnv
}): Promise<string[]> {
  const dirs = new Set<string>()
  dirs.add(options.codexHome)
  dirs.add(path.join(options.codexHome, 'sqlite'))
  const fromToml = resolveSqliteHome(options.sqliteHome, options.codexHome)
  if (fromToml) dirs.add(fromToml)
  const fromEnv = resolveSqliteHome(options.env?.CODEX_SQLITE_HOME, options.codexHome)
  if (fromEnv) dirs.add(fromEnv)

  const files: string[] = []
  const seen = new Set<string>()
  for (const dir of dirs) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isFile() || !STATE_DB_NAME.test(entry.name)) continue
      const fullPath = path.join(dir, entry.name)
      if (seen.has(fullPath)) continue
      seen.add(fullPath)
      files.push(fullPath)
    }
  }
  return files
}

function resolveSqliteHome(value: string | undefined, codexHome: string): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return path.isAbsolute(trimmed) ? trimmed : path.resolve(codexHome, trimmed)
}

async function migrateStateDb(
  dbPath: string,
  codexHome: string,
  backup: { root: string; path: string | null },
): Promise<number> {
  if (!existsSync(dbPath)) return 0
  let db: DatabaseSync | null = null
  try {
    db = new DatabaseSync(dbPath)
    if (!hasThreadsProviderColumn(db)) return 0
    const row = db.prepare(`SELECT COUNT(*) AS n FROM threads WHERE ${LEGACY_OWNED_SQL}`).get() as
      | { n: number }
      | undefined
    const matching = Number(row?.n ?? 0)
    if (matching === 0) return 0
    db.close()
    db = null
    await backupFile(dbPath, codexHome, backup, 'state')
    db = new DatabaseSync(dbPath)
    db.exec('BEGIN')
    try {
      db.prepare(
        `UPDATE threads SET model_provider = ? WHERE ${LEGACY_OWNED_SQL}`,
      ).run(STACKFERRY_LIVE_PROVIDER_KEY)
      db.exec('COMMIT')
    } catch (error) {
      try {
        db.exec('ROLLBACK')
      } catch {
        // 事务可能已经结束，忽略回滚失败。
      }
      throw error
    }
    return matching
  } catch {
    return 0
  } finally {
    db?.close()
  }
}

function hasThreadsProviderColumn(db: DatabaseSync): boolean {
  const table = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'threads'")
    .get()
  if (!table) return false
  const columns = db.prepare('PRAGMA table_info(threads)').all() as { name: string }[]
  return columns.some((column) => column.name === 'model_provider')
}

async function backupFile(
  filePath: string,
  codexHome: string,
  backup: { root: string; path: string | null },
  kind: 'jsonl' | 'state',
): Promise<void> {
  if (!backup.path) {
    const stamp = new Date().toISOString().replaceAll(':', '-')
    backup.path = path.join(backup.root, HISTORY_MIGRATION_NAME, stamp)
  }
  const dest = path.join(backup.path, kind, backupRelative(filePath, codexHome))
  await mkdir(path.dirname(dest), { recursive: true })
  await copyFile(filePath, dest)
}

function backupRelative(filePath: string, codexHome: string): string {
  const relative = path.relative(codexHome, filePath)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return path.join('external', path.basename(filePath))
  }
  return relative
}

async function assertUnchanged(filePath: string, before: { mtimeMs: number; size: number }): Promise<void> {
  const after = await stat(filePath)
  if (after.mtimeMs !== before.mtimeMs || after.size !== before.size) {
    throw new Error('session-changed')
  }
}

async function atomicWriteFile(filePath: string, contents: string): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tempPath, contents, 'utf8')
  try {
    await rename(tempPath, filePath)
  } catch {
    await writeFile(filePath, contents, 'utf8')
    await rm(tempPath, { force: true })
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
