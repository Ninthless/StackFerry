import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
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

import { ClaudeEnableService } from '../electron/main/claude/service'
import { ClaudeProviderStore } from '../electron/main/claude/store'
import { reapplyClaudeGatewayIfNeeded } from '../electron/main/claude/reapply'
import { GrokEnableService } from '../electron/main/grok/service'
import { GrokProviderStore } from '../electron/main/grok/store'
import { ProviderStore } from '../electron/main/codex/store'
import { RoutingService } from '../electron/main/routing/service'
import { RoutingStore } from '../electron/main/routing/store'
import type { ClaudeIpcContext } from '../electron/main/claude/ipc'

describe('reapply claude gateway after the cli config is gone', () => {
  it('writes the active custom gateway and onboarding flag back', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-claude-reapply-'))
    const claudeHome = path.join(dir, 'claude')
    const userJsonPath = path.join(dir, '.claude.json')
    const backupRoot = path.join(dir, 'backups', 'claude')
    const claudeStore = new ClaudeProviderStore(path.join(dir, 'claude-providers.json'))
    const claude = new ClaudeEnableService({
      store: claudeStore,
      getClaudeHome: () => claudeHome,
      getClaudeUserJsonPath: () => userJsonPath,
      getDesktopLibraries: () => [],
      backupRoot,
      isManaged: async () => false,
    })
    const routing = new RoutingService({
      store: new RoutingStore(path.join(dir, 'routing.json')),
      providers: new ProviderStore(path.join(dir, 'providers.json')),
      claudeStore,
      claude,
      grokStore: new GrokProviderStore(path.join(dir, 'grok-providers.json')),
      grok: new GrokEnableService({
        store: new GrokProviderStore(path.join(dir, 'grok-providers.json')),
        getGrokHome: () => path.join(dir, 'grok'),
        backupRoot: path.join(dir, 'backups', 'grok'),
        isManaged: () => false,
      }),
      getCodexHome: () => path.join(dir, 'codex'),
      backupRoot: path.join(dir, 'backups'),
      setNeedsRestart: () => undefined,
    })
    await mkdir(path.join(dir, 'codex'), { recursive: true })
    await mkdir(path.join(dir, 'grok'), { recursive: true })
    const added = await claudeStore.add({
      name: 'Gateway',
      kind: 'custom',
      baseUrl: 'https://gateway.example/v1',
      model: 'claude-sonnet-4-6',
      authScheme: 'bearer',
      apiKey: 'secret-key',
    })
    const context: ClaudeIpcContext = {
      claudeStore,
      claude,
      routing,
      getNeedsRestart: () => false,
      onClaudeChanged: () => undefined,
    }

    try {
      await routing.enable('claude-code', added.id)
      await rm(path.join(claudeHome, 'settings.json'), { force: true })
      await rm(userJsonPath, { force: true })

      await reapplyClaudeGatewayIfNeeded(context)

      const settings = JSON.parse(await readFile(path.join(claudeHome, 'settings.json'), 'utf8')) as {
        env: Record<string, string>
      }
      const userJson = JSON.parse(await readFile(userJsonPath, 'utf8')) as { hasCompletedOnboarding?: boolean }
      expect(settings.env.ANTHROPIC_BASE_URL).toBe('https://gateway.example/v1')
      expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe('secret-key')
      expect(userJson.hasCompletedOnboarding).toBe(true)

      const backupsAfterRepair = (await readdir(backupRoot)).length
      await reapplyClaudeGatewayIfNeeded(context)
      expect((await readdir(backupRoot)).length).toBe(backupsAfterRepair)
    } finally {
      await routing.restoreOnQuit()
    }
  })
})
