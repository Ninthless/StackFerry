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
import { resolveGrokHome, grokAuthPath, grokAuthRestorePath, grokConfigPath, grokSkillsRoot } from '../electron/main/grok/home'
import { enableGrokDirectConfig, enableGrokOfficialConfig, patchGrokMediaUrl } from '../electron/main/grok/writer'
import { AppError } from '../shared/app-error'
import { GrokEnableService } from '../electron/main/grok/service'
import { GrokProviderStore, type StoredGrokProvider } from '../electron/main/grok/store'

describe('grok home', () => {
  it('uses GROK_HOME when set', () => {
    expect(resolveGrokHome({ GROK_HOME: '/custom/grok' }, () => '/home/demo')).toBe('/custom/grok')
    expect(grokConfigPath('/home/demo/.grok')).toBe(path.join('/home/demo/.grok', 'config.toml'))
    expect(grokAuthPath('/home/demo/.grok')).toBe(path.join('/home/demo/.grok', 'auth.json'))
    expect(grokAuthRestorePath('/home/demo/.grok')).toBe(
      path.join('/home/demo/.grok', 'auth.json.stackferry-restore'),
    )
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

  it('writes the provider key into auth.json and restores the original on official', async () => {
    const { existsSync } = await import('node:fs')
    const { readFile } = await import('node:fs/promises')
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-grok-auth-'))
    const original = {
      'https://accounts.x.ai/sign-in': {
        key: 'session-token',
        auth_mode: 'oidc',
        create_time: '2026-01-01T00:00:00.000Z',
        user_id: 'u1',
      },
    }
    await writeFile(grokAuthPath(dir), `${JSON.stringify(original, null, 2)}\n`)
    await enableGrokDirectConfig({
      grokHome: dir,
      backupRoot: path.join(dir, 'backups'),
      provider: {
        id: 'aaaa-bbbb',
        name: 'Custom',
        model: 'demo',
        baseUrl: 'https://gateway.test/v1',
        apiBackend: 'responses',
        apiKey: 'secret',
      },
    })
    const live = JSON.parse(await readFile(grokAuthPath(dir), 'utf8')) as {
      'xai::api_key': { key: string; auth_mode: string }
    }
    expect(live['xai::api_key']).toMatchObject({ key: 'secret', auth_mode: 'api_key' })
    expect(existsSync(grokAuthRestorePath(dir))).toBe(true)

    await enableGrokOfficialConfig({ grokHome: dir, backupRoot: path.join(dir, 'backups') })
    expect(JSON.parse(await readFile(grokAuthPath(dir), 'utf8'))).toEqual(original)
    expect(existsSync(grokAuthRestorePath(dir))).toBe(false)
  })

  it('prefers the image API key in auth.json when Imagine is configured', async () => {
    const { readFile } = await import('node:fs/promises')
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-grok-image-'))
    await enableGrokDirectConfig({
      grokHome: dir,
      backupRoot: path.join(dir, 'backups'),
      provider: {
        id: 'img-prov',
        name: 'Custom',
        model: 'demo',
        baseUrl: 'https://gateway.test/v1',
        apiBackend: 'responses',
        apiKey: 'chat-secret',
        media: {
          imageModel: 'flux-schnell',
          baseUrl: 'https://gateway.test/v1',
          apiKey: 'image-secret',
        },
      },
    })
    const live = JSON.parse(await readFile(grokAuthPath(dir), 'utf8')) as {
      'xai::api_key': { key: string }
    }
    expect(live['xai::api_key'].key).toBe('image-secret')
    const config = await readFile(grokConfigPath(dir), 'utf8')
    expect(config).toContain('image_gen_model_override')
    expect(config).toContain('flux-schnell')
    expect(config).toContain('xai_api_base_url = "https://gateway.test/v1"')
    expect(config).not.toContain('127.0.0.1')
  })

  it('rewrites a stale loopback Imagine URL without touching the chat model', async () => {
    const { readFile } = await import('node:fs/promises')
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-grok-media-url-'))
    await writeFile(
      grokConfigPath(dir),
      '[models]\ndefault = "grok-4.6"\n[endpoints]\nxai_api_base_url = "http://127.0.0.1:61325/v1"\n',
    )
    await patchGrokMediaUrl({
      grokHome: dir,
      backupRoot: path.join(dir, 'backups'),
      baseUrl: 'https://gateway.test/v1',
    })
    const text = await readFile(grokConfigPath(dir), 'utf8')
    expect(text).toContain('https://gateway.test/v1')
    expect(text).not.toContain('61325')
    expect(text).not.toContain('127.0.0.1')
    expect(text).toContain('grok-4.6')
  })
})

describe('GrokEnableService media key', () => {
  it('does not fall back to the chat key when the image key cannot be decrypted', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-grok-image-decrypt-'))
    const grok = mediaService(dir, {
      decryptImageApiKey: () => {
        throw new AppError('secret_storage_unavailable_read')
      },
    })
    await expect(grok.writeDirect(mediaProvider())).rejects.toBeInstanceOf(AppError)
  })

  it('uses the chat key for Imagine when no image key is stored', async () => {
    const { readFile } = await import('node:fs/promises')
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-grok-image-fallback-'))
    const grok = mediaService(dir, { decryptImageApiKey: () => '' })
    await grok.writeDirect(mediaProvider({ imageApiKeyPayload: '' }))
    const live = JSON.parse(await readFile(grokAuthPath(dir), 'utf8')) as {
      'xai::api_key': { key: string }
    }
    expect(live['xai::api_key'].key).toBe('chat-secret')
  })
})

function mediaService(
  dir: string,
  store: { decryptImageApiKey: (provider: StoredGrokProvider) => string },
): GrokEnableService {
  return new GrokEnableService({
    store: {
      decryptApiKey: () => 'chat-secret',
      decryptImageApiKey: store.decryptImageApiKey,
      getPreviousDefault: async () => null,
    } as unknown as GrokProviderStore,
    getGrokHome: () => dir,
    backupRoot: path.join(dir, 'backups'),
    isManaged: () => false,
  })
}

function mediaProvider(overrides: Partial<StoredGrokProvider> = {}): StoredGrokProvider {
  return {
    id: 'img',
    name: 'Custom',
    kind: 'custom',
    baseUrl: 'https://gateway.test/v1',
    model: 'demo',
    apiBackend: 'responses',
    imageModel: 'flux-schnell',
    imageBaseUrl: '',
    videoModel: '',
    effortLevel: '',
    permissionMode: '',
    contextWindow: '',
    autoCompact: '',
    overlayToml: '',
    apiKeyPayload: 'chat-payload',
    imageApiKeyPayload: 'image-payload',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
