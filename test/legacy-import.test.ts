import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
}))

import { ClaudeProviderStore } from '../electron/main/claude/store'
import { ProviderStore } from '../electron/main/codex/store'
import { LegacyImportService } from '../electron/main/legacy/service'

describe('LegacyImportService', () => {
  it('previews both a stackferry.db file and its containing directory', async () => {
    const { dbPath, dir, service } = await setup()
    const filePreview = await service.preview(dbPath)
    expect(filePreview).toMatchObject({ dbPath, codex: 1, claude: 1, skipped: 1 })
    const dirPreview = await service.preview(dir)
    expect(dirPreview).toMatchObject({ dbPath, codex: 1, claude: 1, skipped: 1 })
  })

  it('detects ~/.stackferry/stackferry.db and returns null when it is missing', async () => {
    const { homedir, service } = await setup()
    expect(await service.detect()).toMatchObject({
      dbPath: path.join(homedir, '.stackferry', 'stackferry.db'),
      codex: 1,
      claude: 1,
    })
    const emptyHome = await mkdtemp(path.join(os.tmpdir(), 'stackferry-legacy-empty-'))
    const missing = new LegacyImportService({
      getHomedir: () => emptyHome,
      providerStore: null as never,
      claudeStore: null as never,
    })
    expect(await missing.detect()).toBeNull()
  })

  it('throws legacy_import_not_found for missing paths', async () => {
    const { service } = await setup()
    await expect(service.preview(path.join(os.tmpdir(), 'stackferry-does-not-exist-xyz')))
      .rejects.toMatchObject({ code: 'legacy_import_not_found' })
  })

  it('throws legacy_import_corrupt for unreadable databases', async () => {
    const { service } = await setup()
    const junk = path.join(await mkdtemp(path.join(os.tmpdir(), 'stackferry-legacy-junk-')), 'stackferry.db')
    await writeFile(junk, 'not sqlite')
    await expect(service.preview(junk)).rejects.toMatchObject({ code: 'legacy_import_corrupt' })
  })

  it('imports custom providers, skips official, unsupported, and duplicates', async () => {
    const { dir, providerStore, claudeStore } = await setup()
    await providerStore.add({ name: 'Codex Official', kind: 'official', presetId: 'official' })
    await providerStore.add({
      name: 'Existing Codex',
      kind: 'custom',
      apiKey: 'seed-key',
      tomlText: starterToml('existing', 'https://existing.test'),
    })
    await claudeStore.add({ name: 'Claude Official', kind: 'official', presetId: 'official' })
    await claudeStore.add({
      name: 'Existing Claude',
      kind: 'custom',
      baseUrl: 'https://existing-claude.test',
      authScheme: 'bearer',
      apiKey: 'seed-claude',
    })

    writeLegacyDb(path.join(dir, 'stackferry.db'), [
      officialRow(),
      grokRow(),
      codexRow('dup-codex', 'Existing Codex', 'https://existing.test', 'dup-key'),
      claudeRow('dup-claude', 'Existing Claude', 'https://existing-claude.test', 'dup-tok'),
      codexRow('new-codex', 'From Old Codex', 'https://old-codex.test', 'new-codex-key'),
      claudeRow('new-claude', 'From Old Claude', 'https://old-claude.test', 'new-claude-tok'),
    ])

    const service = new LegacyImportService({
      getHomedir: () => dir,
      providerStore,
      claudeStore,
    })
    const result = await service.importFrom(dir)
    expect(result.importedCodex).toBe(1)
    expect(result.importedClaude).toBe(1)
    expect(result.skipped).toBe(4)

    const codex = await providerStore.list()
    expect(codex.map((item) => item.name).sort()).toEqual(['Codex Official', 'Existing Codex', 'From Old Codex'])
    expect(codex.find((item) => item.name === 'From Old Codex')).toMatchObject({
      baseUrl: 'https://old-codex.test',
      hasApiKey: true,
    })

    const claude = await claudeStore.list()
    expect(claude.map((item) => item.name).sort()).toEqual(['Claude Official', 'Existing Claude', 'From Old Claude'])
    expect(claude.find((item) => item.name === 'From Old Claude')).toMatchObject({
      baseUrl: 'https://old-claude.test',
      hasApiKey: true,
    })
  })

  it('throws legacy_no_providers when nothing can be imported', async () => {
    const { dir, service } = await setup()
    writeLegacyDb(path.join(dir, 'stackferry.db'), [officialRow(), grokRow()])
    await expect(service.importFrom(dir)).rejects.toMatchObject({ code: 'legacy_no_providers' })
  })
})

async function setup() {
  const homedir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-legacy-home-'))
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-legacy-store-'))
  const dir = path.join(homedir, '.stackferry')
  await mkdir(dir, { recursive: true })
  const dbPath = path.join(dir, 'stackferry.db')
  writeLegacyDb(dbPath, [
    officialRow(),
    codexRow('old-codex', 'Acme Codex', 'https://example.test/v1', 'codex-key'),
    claudeRow('old-claude', 'Acme Claude', 'https://claude.test', 'claude-tok'),
  ])
  const providerStore = new ProviderStore(path.join(storeDir, 'providers.json'))
  const claudeStore = new ClaudeProviderStore(path.join(storeDir, 'claude-providers.json'))
  const service = new LegacyImportService({
    getHomedir: () => homedir,
    providerStore,
    claudeStore,
  })
  return { homedir, dir, dbPath, providerStore, claudeStore, service }
}

function writeLegacyDb(
  filePath: string,
  rows: { id: string; appType: string; name: string; category: string; settingsConfig: string }[],
): void {
  const db = new DatabaseSync(filePath)
  db.exec(`
    create table if not exists providers (
      id text primary key,
      app_type text,
      name text,
      category text,
      settings_config text,
      sort_index integer
    );
    delete from providers;
  `)
  const insert = db.prepare(
    'insert into providers (id, app_type, name, category, settings_config, sort_index) values (?, ?, ?, ?, ?, ?)',
  )
  for (const [index, row] of rows.entries()) {
    insert.run(row.id, row.appType, row.name, row.category, row.settingsConfig, index)
  }
  db.close()
}

function officialRow() {
  return {
    id: 'openai-official',
    appType: 'codex',
    name: 'Codex Official',
    category: 'official',
    settingsConfig: '{}',
  }
}

function grokRow() {
  return {
    id: 'grok-1',
    appType: 'grokbuild',
    name: 'Grok',
    category: 'custom',
    settingsConfig: '{}',
  }
}

function codexRow(id: string, name: string, baseUrl: string, apiKey: string) {
  return {
    id,
    appType: 'codex',
    name,
    category: 'custom',
    settingsConfig: JSON.stringify({
      config: starterToml(id, baseUrl),
      auth: { OPENAI_API_KEY: apiKey },
    }),
  }
}

function claudeRow(id: string, name: string, baseUrl: string, token: string) {
  return {
    id,
    appType: 'claude',
    name,
    category: 'custom',
    settingsConfig: JSON.stringify({
      env: { ANTHROPIC_BASE_URL: baseUrl, ANTHROPIC_AUTH_TOKEN: token },
    }),
  }
}

function starterToml(id: string, baseUrl: string): string {
  return [
    `model_provider = "${id}"`,
    'model = "demo"',
    '',
    `[model_providers.${id}]`,
    `name = "${id}"`,
    `base_url = "${baseUrl}"`,
    'wire_api = "responses"',
    '',
  ].join('\n')
}
