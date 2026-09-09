import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
}))

import { ClaudeProviderStore } from '../electron/main/claude/store'
import { ProviderStore } from '../electron/main/providers/store'

describe('provider list order', () => {
  it('persists a Codex provider permutation', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-providers-'))
    const file = path.join(dir, 'providers.json')
    await writeFile(file, `${JSON.stringify(codexFile(['official', 'b', 'c']), null, 2)}\n`)
    const store = new ProviderStore(file)
    const listed = await store.reorder(['c', 'official', 'b'])
    expect(listed.map((item) => item.id)).toEqual(['c', 'official', 'b'])
    const persisted = JSON.parse(await readFile(file, 'utf8')) as { providers: { id: string }[] }
    expect(persisted.providers.map((item) => item.id)).toEqual(['c', 'official', 'b'])
    await expect(store.reorder(['c', 'official'])).rejects.toMatchObject({ code: 'provider_order' })
  })

  it('persists a Claude provider permutation', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-claude-providers-'))
    const file = path.join(dir, 'claude-providers.json')
    await writeFile(file, `${JSON.stringify(claudeFile(['official', 'b', 'c']), null, 2)}\n`)
    const store = new ClaudeProviderStore(file)
    const listed = await store.reorder(['b', 'c', 'official'])
    expect(listed.map((item) => item.id)).toEqual(['b', 'c', 'official'])
    expect(listed.find((item) => item.id === 'b')?.models).toEqual(['demo'])
    const persisted = JSON.parse(await readFile(file, 'utf8')) as { providers: { id: string }[] }
    expect(persisted.providers.map((item) => item.id)).toEqual(['b', 'c', 'official'])
    await expect(store.reorder(['missing'])).rejects.toMatchObject({ code: 'provider_order' })
  })
})

function codexFile(ids: string[]) {
  return {
    version: 2,
    activeProviderId: 'official',
    lastWriteAt: null,
    providers: ids.map((id) => ({
      id,
      name: id,
      kind: id === 'official' ? 'official' : 'custom',
      baseUrl: id === 'official' ? '' : 'https://example.test',
      model: id === 'official' ? '' : 'demo',
      tomlText: id === 'official' ? '' : '[foo]\n',
      apiKeyPayload: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })),
  }
}

function claudeFile(ids: string[]) {
  return {
    version: 1,
    activeProviderId: 'official',
    lastWriteAt: null,
    providers: ids.map((id) => ({
      id,
      name: id,
      kind: id === 'official' ? 'official' : 'custom',
      baseUrl: id === 'official' ? '' : 'https://example.test',
      model: id === 'official' ? '' : 'demo',
      models: id === 'official' ? [] : ['demo'],
      authScheme: 'bearer',
      effortLevel: '',
      permissionMode: '',
      contextWindow: '',
      autoCompact: '',
      overlayJson: '',
      apiKeyPayload: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })),
  }
}
