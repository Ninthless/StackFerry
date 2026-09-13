import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  GROK_HISTORY_MIGRATION_MARKER,
  GROK_HISTORY_MIGRATION_NAME,
  migrateGrokHistoryModelBucket,
} from '../electron/main/grok/history'
import { GROK_LIVE_MODEL_KEY, grokModelKey } from '../electron/main/grok/merge'
import { enableGrokDirectConfig, enableGrokOfficialConfig } from '../electron/main/grok/writer'

describe('grok history model bucket', () => {
  it('rewrites owned summary model ids onto custom', async () => {
    const { grokHome, backupRoot } = await setupHome()
    const leftover = grokModelKey('aaaa-bbbb')
    const ownedDir = path.join(grokHome, 'sessions', 'proj', 'sess-owned')
    const officialDir = path.join(grokHome, 'sessions', 'proj', 'sess-official')
    await mkdir(ownedDir, { recursive: true })
    await mkdir(officialDir, { recursive: true })
    await writeFile(path.join(ownedDir, 'summary.json'), summaryFile(leftover))
    await writeFile(path.join(officialDir, 'summary.json'), summaryFile('grok-4.6'))

    const outcome = await migrateGrokHistoryModelBucket({ grokHome, backupRoot })
    expect(outcome.files).toBe(1)
    expect(outcome.backupPath).toContain(GROK_HISTORY_MIGRATION_NAME)
    expect(JSON.parse(await readFile(path.join(ownedDir, 'summary.json'), 'utf8'))).toMatchObject({
      current_model_id: GROK_LIVE_MODEL_KEY,
      title: 'kept',
    })
    expect(JSON.parse(await readFile(path.join(officialDir, 'summary.json'), 'utf8'))).toMatchObject({
      current_model_id: 'grok-4.6',
    })

    const second = await migrateGrokHistoryModelBucket({ grokHome, backupRoot })
    expect(second).toEqual({ files: 0, backupPath: null })
    expect(await readFile(path.join(grokHome, GROK_HISTORY_MIGRATION_MARKER), 'utf8')).toContain(
      GROK_HISTORY_MIGRATION_NAME,
    )

    const extraDir = path.join(grokHome, 'sessions', 'proj', 'sess-later')
    await mkdir(extraDir, { recursive: true })
    await writeFile(path.join(extraDir, 'summary.json'), summaryFile(leftover))
    const skipped = await migrateGrokHistoryModelBucket({ grokHome, backupRoot })
    expect(skipped).toEqual({ files: 0, backupPath: null })
    expect(JSON.parse(await readFile(path.join(extraDir, 'summary.json'), 'utf8'))).toMatchObject({
      current_model_id: leftover,
    })
  })

  it('rewrites leftover session tags when enabling a third-party provider', async () => {
    const { grokHome, backupRoot } = await setupHome()
    const sessionDir = path.join(grokHome, 'sessions', 'proj', 'sess-1')
    await mkdir(sessionDir, { recursive: true })
    await writeFile(path.join(sessionDir, 'summary.json'), summaryFile('stackferry_router'))

    await enableGrokDirectConfig({
      grokHome,
      backupRoot,
      provider: {
        id: 'prov-a',
        name: 'Custom',
        model: 'demo',
        baseUrl: 'https://gateway.test/v1',
        apiBackend: 'responses',
        apiKey: 'secret',
      },
    })
    expect(JSON.parse(await readFile(path.join(sessionDir, 'summary.json'), 'utf8'))).toMatchObject({
      current_model_id: GROK_LIVE_MODEL_KEY,
    })

    await enableGrokOfficialConfig({ grokHome, backupRoot, previousDefault: 'grok-build' })
    expect(JSON.parse(await readFile(path.join(sessionDir, 'summary.json'), 'utf8'))).toMatchObject({
      current_model_id: GROK_LIVE_MODEL_KEY,
    })
  })
})

async function setupHome() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stackferry-grok-history-'))
  return {
    grokHome: path.join(root, 'grok'),
    backupRoot: path.join(root, 'backups'),
  }
}

function summaryFile(modelId: string): string {
  return `${JSON.stringify({ title: 'kept', current_model_id: modelId }, null, 2)}\n`
}
