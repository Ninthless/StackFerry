import { copyFile, mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { GROK_LIVE_MODEL_KEY, isStackferryModelKey } from './merge'

// 只改 summary.json 的 current_model_id。grok-* catalog / 官方会话不搬。
export const GROK_HISTORY_MIGRATION_NAME = 'grok-history-model-v1'

export type GrokHistoryMigrationOutcome = {
  files: number
  backupPath: string | null
}

export async function migrateGrokHistoryModelBucket(options: {
  grokHome: string
  backupRoot: string
}): Promise<GrokHistoryMigrationOutcome> {
  const backup: { root: string; path: string | null } = { root: options.backupRoot, path: null }
  const files = await collectSummaryFiles(path.join(options.grokHome, 'sessions'), 0, 6)
  let migrated = 0
  for (const filePath of files) {
    if (await rewriteSummary(filePath, options.grokHome, backup)) migrated += 1
  }
  return { files: migrated, backupPath: backup.path }
}

async function collectSummaryFiles(dir: string, depth: number, maxDepth: number): Promise<string[]> {
  if (depth > maxDepth) return []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const files: string[] = []
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectSummaryFiles(fullPath, depth + 1, maxDepth)))
      continue
    }
    if (entry.isFile() && entry.name === 'summary.json') files.push(fullPath)
  }
  return files
}

async function rewriteSummary(
  filePath: string,
  grokHome: string,
  backup: { root: string; path: string | null },
): Promise<boolean> {
  let before
  try {
    before = await stat(filePath)
  } catch {
    return false
  }
  let raw
  try {
    raw = await readFile(filePath, 'utf8')
  } catch {
    return false
  }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return false
  }
  if (!isRecord(value) || typeof value.current_model_id !== 'string') return false
  if (!isStackferryModelKey(value.current_model_id)) return false
  value.current_model_id = GROK_LIVE_MODEL_KEY
  try {
    const after = await stat(filePath)
    if (after.mtimeMs !== before.mtimeMs || after.size !== before.size) return false
    await backupFile(filePath, grokHome, backup)
    await atomicWriteFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
    await utimes(filePath, before.atime, before.mtime)
    return true
  } catch {
    return false
  }
}

async function backupFile(
  filePath: string,
  grokHome: string,
  backup: { root: string; path: string | null },
): Promise<void> {
  if (!backup.path) {
    const stamp = new Date().toISOString().replaceAll(':', '-')
    backup.path = path.join(backup.root, GROK_HISTORY_MIGRATION_NAME, stamp)
  }
  const relative = path.relative(grokHome, filePath)
  const dest = path.join(
    backup.path,
    !relative || relative.startsWith('..') || path.isAbsolute(relative)
      ? path.join('external', path.basename(filePath))
      : relative,
  )
  await mkdir(path.dirname(dest), { recursive: true })
  await copyFile(filePath, dest)
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
