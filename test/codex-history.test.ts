import { mkdirSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, stat, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import {
  HISTORY_MIGRATION_MARKER,
  HISTORY_MIGRATION_NAME,
  migrateCodexHistoryProviderBucket,
} from '../electron/main/codex/history'
import { STACKFERRY_LIVE_PROVIDER_KEY, providerKey } from '../electron/main/codex/merge'
import { enableOfficialLiveConfig, enableThirdPartyLiveConfig } from '../electron/main/codex/writer'

describe('codex history provider bucket', () => {
  it('rewrites owned session tags and sqlite rows onto custom', async () => {
    const { codexHome, backupRoot } = await setupHome()
    const leftover = providerKey('aaaa-bbbb')
    const sessionDir = path.join(codexHome, 'sessions', '2026', '05', '20')
    const archivedDir = path.join(codexHome, 'archived_sessions')
    await mkdir(sessionDir, { recursive: true })
    await mkdir(archivedDir, { recursive: true })
    const ownedPath = path.join(sessionDir, 'owned.jsonl')
    const officialPath = path.join(sessionDir, 'official.jsonl')
    const archivedPath = path.join(archivedDir, 'old.jsonl')
    await writeFile(ownedPath, sessionFile(leftover, 'keep-body'))
    await writeFile(officialPath, sessionFile('openai', 'official-body'))
    await writeFile(archivedPath, sessionFile('stackferry', 'archived-body'))
    const old = new Date('2024-06-01T00:00:00Z')
    await utimes(ownedPath, old, old)

    writeStateDb(path.join(codexHome, 'state_5.sqlite'), [
      ['owned', leftover],
      ['legacy', 'stackferry'],
      ['official', 'openai'],
      ['already', 'custom'],
    ])
    writeStateDb(path.join(codexHome, 'sqlite', 'state_5.sqlite'), [['desktop', leftover]])

    const outcome = await migrateCodexHistoryProviderBucket({ codexHome, backupRoot })
    expect(outcome.jsonlFiles).toBe(2)
    expect(outcome.stateRows).toBe(3)
    expect(outcome.backupPath).toContain(HISTORY_MIGRATION_NAME)

    const owned = JSON.parse((await readFile(ownedPath, 'utf8')).split('\n')[0] ?? '') as {
      payload: { model_provider: string }
    }
    expect(owned.payload.model_provider).toBe(STACKFERRY_LIVE_PROVIDER_KEY)
    expect(await readFile(ownedPath, 'utf8')).toContain('keep-body')
    expect(await readFile(officialPath, 'utf8')).toContain('"model_provider":"openai"')
    const archived = JSON.parse((await readFile(archivedPath, 'utf8')).split('\n')[0] ?? '') as {
      payload: { model_provider: string }
    }
    expect(archived.payload.model_provider).toBe(STACKFERRY_LIVE_PROVIDER_KEY)
    expect(Math.abs((await stat(ownedPath)).mtime.getTime() - old.getTime())).toBeLessThan(2000)

    expect(readProviders(path.join(codexHome, 'state_5.sqlite'))).toEqual({
      already: 'custom',
      legacy: 'custom',
      official: 'openai',
      owned: 'custom',
    })
    expect(readProviders(path.join(codexHome, 'sqlite', 'state_5.sqlite'))).toEqual({
      desktop: 'custom',
    })
    expect(
      await readFile(
        path.join(outcome.backupPath ?? '', 'jsonl', 'sessions', '2026', '05', '20', 'owned.jsonl'),
        'utf8',
      ),
    ).toContain(`"model_provider":"${leftover}"`)

    const second = await migrateCodexHistoryProviderBucket({ codexHome, backupRoot })
    expect(second).toEqual({ jsonlFiles: 0, stateRows: 0, backupPath: null })
    expect(await readFile(path.join(codexHome, HISTORY_MIGRATION_MARKER), 'utf8')).toContain(
      HISTORY_MIGRATION_NAME,
    )

    const extraPath = path.join(sessionDir, 'later.jsonl')
    await writeFile(extraPath, sessionFile(leftover, 'later-body'))
    const skipped = await migrateCodexHistoryProviderBucket({ codexHome, backupRoot })
    expect(skipped).toEqual({ jsonlFiles: 0, stateRows: 0, backupPath: null })
    expect(await readFile(extraPath, 'utf8')).toContain(`"model_provider":"${leftover}"`)
  })

  it('does not rewrite unknown third-party session tags', async () => {
    const { codexHome, backupRoot } = await setupHome()
    const sessionDir = path.join(codexHome, 'sessions')
    await mkdir(sessionDir, { recursive: true })
    await writeFile(path.join(sessionDir, 'other.jsonl'), sessionFile('rightcode', 'body'))
    writeStateDb(path.join(codexHome, 'state_5.sqlite'), [['other', 'rightcode']])

    const outcome = await migrateCodexHistoryProviderBucket({ codexHome, backupRoot })
    expect(outcome).toEqual({ jsonlFiles: 0, stateRows: 0, backupPath: null })
    expect(await readFile(path.join(sessionDir, 'other.jsonl'), 'utf8')).toContain(
      '"model_provider":"rightcode"',
    )
    expect(readProviders(path.join(codexHome, 'state_5.sqlite'))).toEqual({ other: 'rightcode' })
  })

  it('follows sqlite_home from config when enabling a third-party provider', async () => {
    const { root, codexHome, backupRoot } = await setupHome()
    const sqliteHome = path.join(root, 'state-home')
    const sessionDir = path.join(codexHome, 'sessions')
    await mkdir(sessionDir, { recursive: true })
    await mkdir(sqliteHome, { recursive: true })
    await writeFile(path.join(sessionDir, 'owned.jsonl'), sessionFile('stackferry_abc', 'body'))
    await writeFile(path.join(codexHome, 'config.toml'), `sqlite_home = ${JSON.stringify(sqliteHome)}\n`)
    writeStateDb(path.join(sqliteHome, 'state_5.sqlite'), [['from-home', 'stackferry_abc']])

    await enableThirdPartyLiveConfig({
      codexHome,
      backupRoot,
      provider: {
        id: 'prov-a',
        name: 'Provider A',
        tomlText: `model = "model-a"
model_provider = "provider_a"

[model_providers.provider_a]
name = "Provider A"
base_url = "https://a.example/v1"
wire_api = "responses"
`,
        apiKey: 'key-a',
      },
    })

    expect(await readFile(path.join(codexHome, 'config.toml'), 'utf8')).toContain(
      'model_provider = "custom"',
    )
    const session = JSON.parse(
      (await readFile(path.join(sessionDir, 'owned.jsonl'), 'utf8')).split('\n')[0] ?? '',
    ) as { payload: { model_provider: string } }
    expect(session.payload.model_provider).toBe('custom')
    expect(readProviders(path.join(sqliteHome, 'state_5.sqlite'))).toEqual({
      'from-home': 'custom',
    })

    await enableOfficialLiveConfig({ codexHome, backupRoot })
    expect(readProviders(path.join(sqliteHome, 'state_5.sqlite'))).toEqual({
      'from-home': 'custom',
    })
  })

  it('follows CODEX_SQLITE_HOME when scanning state databases', async () => {
    const { root, codexHome, backupRoot } = await setupHome()
    const sqliteHome = path.join(root, 'env-sqlite')
    await mkdir(sqliteHome, { recursive: true })
    writeStateDb(path.join(sqliteHome, 'state_11.sqlite'), [['env-row', 'stackferry']])

    const outcome = await migrateCodexHistoryProviderBucket({
      codexHome,
      backupRoot,
      env: { CODEX_SQLITE_HOME: sqliteHome },
    })
    expect(outcome.stateRows).toBe(1)
    expect(readProviders(path.join(sqliteHome, 'state_11.sqlite'))).toEqual({
      'env-row': 'custom',
    })
  })
})

async function setupHome() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stackferry-history-'))
  return {
    root,
    codexHome: path.join(root, 'codex'),
    backupRoot: path.join(root, 'backups'),
  }
}

function sessionFile(provider: string, body: string): string {
  return `${JSON.stringify({
    type: 'session_meta',
    payload: { id: 's1', model_provider: provider },
  })}\n${JSON.stringify({
    type: 'response_item',
    payload: { content: body },
  })}\n`
}

function writeStateDb(filePath: string, rows: [string, string][]): void {
  mkdirSync(path.dirname(filePath), { recursive: true })
  const db = new DatabaseSync(filePath)
  db.exec('CREATE TABLE threads (id TEXT PRIMARY KEY, model_provider TEXT NOT NULL)')
  const insert = db.prepare('INSERT INTO threads (id, model_provider) VALUES (?, ?)')
  for (const [id, provider] of rows) insert.run(id, provider)
  db.close()
}

function readProviders(filePath: string): Record<string, string> {
  const db = new DatabaseSync(filePath, { readOnly: true })
  const rows = db.prepare('SELECT id, model_provider FROM threads ORDER BY id').all() as {
    id: string
    model_provider: string
  }[]
  db.close()
  return Object.fromEntries(rows.map((row) => [row.id, row.model_provider]))
}
