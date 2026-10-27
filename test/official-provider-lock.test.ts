import { mkdtemp } from 'node:fs/promises'
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
import { ProviderStore } from '../electron/main/codex/store'
import { GrokProviderStore } from '../electron/main/grok/store'
import { PiProviderStore } from '../electron/main/pi/store'

describe('official login lock', () => {
  it('rejects edits and deletes for every CLI official login', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-official-lock-'))
    const codex = new ProviderStore(path.join(dir, 'codex.json'))
    const claude = new ClaudeProviderStore(path.join(dir, 'claude.json'))
    const grok = new GrokProviderStore(path.join(dir, 'grok.json'))
    const pi = new PiProviderStore(path.join(dir, 'pi.json'))
    await codex.add({ name: 'Codex Official', kind: 'official', presetId: 'official' })
    await claude.add({ name: 'Claude Official', kind: 'official', presetId: 'official' })
    await grok.add({ name: 'Grok Official', kind: 'official', presetId: 'official' })
    await pi.add({ name: 'Pi Official', kind: 'official' })

    await expect(codex.update('official', { name: 'Renamed', kind: 'official' })).rejects.toMatchObject({
      code: 'official_locked',
    })
    await expect(claude.update('official', { name: 'Renamed', kind: 'official' })).rejects.toMatchObject({
      code: 'official_locked',
    })
    await expect(grok.update('official', { name: 'Renamed', kind: 'official' })).rejects.toMatchObject({
      code: 'official_locked',
    })
    await expect(pi.update('official', { name: 'Renamed', kind: 'official' })).rejects.toMatchObject({
      code: 'official_locked',
    })
    await expect(codex.delete('official')).rejects.toMatchObject({ code: 'official_locked' })
    await expect(claude.delete('official')).rejects.toMatchObject({ code: 'official_locked' })
    await expect(grok.delete('official')).rejects.toMatchObject({ code: 'official_locked' })
    await expect(pi.delete('official')).rejects.toMatchObject({ code: 'official_locked' })

    await expect(codex.list()).resolves.toMatchObject([{ id: 'official', name: 'Codex Official' }])
    await expect(claude.list()).resolves.toMatchObject([{ id: 'official', name: 'Claude Official' }])
    await expect(grok.list()).resolves.toMatchObject([{ id: 'official', name: 'Grok Official' }])
    await expect(pi.list()).resolves.toMatchObject([{ id: 'official', name: 'Pi Official' }])
  })
})
