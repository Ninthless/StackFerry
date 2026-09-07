import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ClaudeEnableService } from '../electron/main/claude/service'
import { STACKFERRY_DESKTOP_PROFILE_ID } from '../electron/main/claude/desktop-merge'
import type { ClaudeProviderStore, StoredClaudeProvider } from '../electron/main/claude/store'

const provider: StoredClaudeProvider = {
  id: 'gw',
  name: 'Corp Gateway',
  kind: 'custom',
  baseUrl: 'https://gateway.example/v1',
  model: 'claude-sonnet-4-6',
  authScheme: 'bearer',
  effortLevel: '',
  contextWindow: '',
  autoCompact: '',
  overlayJson: '',
  apiKeyPayload: 'payload',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('ClaudeEnableService', () => {
  it('writes Desktop 3P into every resolved library', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'stackferry-claude-svc-'))
    const first = path.join(root, 'local', 'configLibrary')
    const second = path.join(root, 'msix', 'configLibrary')
    const store = {
      peek: async () => provider,
      decryptApiKey: () => 'gw-key',
      markEnabled: async () => provider,
      getLastWriteAt: async () => null,
      getActiveId: async () => provider.id,
    } as unknown as ClaudeProviderStore

    const service = new ClaudeEnableService({
      store,
      getClaudeHome: () => path.join(root, 'claude'),
      getDesktopLibraries: () => [first, second],
      backupRoot: path.join(root, 'backups'),
      isManaged: async () => false,
    })

    await service.enable(provider.id)

    for (const library of [first, second]) {
      const meta = JSON.parse(await readFile(path.join(library, '_meta.json'), 'utf8')) as {
        appliedId: string
      }
      const appConfig = JSON.parse(
        await readFile(path.join(path.dirname(library), 'claude_desktop_config.json'), 'utf8'),
      ) as { deploymentMode: string }
      expect(meta.appliedId).toBe(STACKFERRY_DESKTOP_PROFILE_ID)
      expect(appConfig.deploymentMode).toBe('3p')
    }
  })
})
