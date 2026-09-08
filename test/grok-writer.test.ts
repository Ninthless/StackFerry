import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
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

import { grokManagedPolicyPresent } from '../electron/main/grok/policy'
import { resolveGrokHome, grokConfigPath, grokSkillsRoot } from '../electron/main/grok/home'
import { enableGrokOfficialConfig } from '../electron/main/grok/writer'
import { AppError } from '../shared/app-error'
import { GrokEnableService } from '../electron/main/grok/service'
import { GrokProviderStore } from '../electron/main/grok/store'

describe('grok home', () => {
  it('uses GROK_HOME when set', () => {
    expect(resolveGrokHome({ GROK_HOME: '/custom/grok' }, () => '/home/demo')).toBe('/custom/grok')
    expect(grokConfigPath('/home/demo/.grok')).toBe(path.join('/home/demo/.grok', 'config.toml'))
    expect(grokSkillsRoot('/home/demo/.grok')).toBe(path.join('/home/demo/.grok', 'skills'))
  })
})

describe('grok managed policy', () => {
  it('refuses writes when managed_config.toml exists', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-grok-managed-'))
    await writeFile(path.join(dir, 'managed_config.toml'), 'x = 1\n')
    expect(grokManagedPolicyPresent(dir)).toBe(true)
    const store = new GrokProviderStore(path.join(dir, 'providers.json'))
    const grok = new GrokEnableService({
      store,
      getGrokHome: () => dir,
      backupRoot: path.join(dir, 'backups'),
    })
    await expect(grok.writeOfficial()).rejects.toBeInstanceOf(AppError)
  })

  it('writes official config when unmanaged', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-grok-write-'))
    await mkdir(dir, { recursive: true })
    await writeFile(
      grokConfigPath(dir),
      '[ui]\ntheme = "auto"\n[models]\ndefault = "my-byok"\n[model.my-byok]\nmodel = "kept"\n',
    )
    await enableGrokOfficialConfig({ grokHome: dir, backupRoot: path.join(dir, 'backups') })
    const text = await (await import('node:fs/promises')).readFile(grokConfigPath(dir), 'utf8')
    expect(text).toContain('theme')
    expect(text).toContain('my-byok')
  })
})
