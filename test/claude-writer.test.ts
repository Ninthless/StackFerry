import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AppError } from '../shared/app-error'
import { enableCodeGateway, enableCodeOfficial } from '../electron/main/claude/code-writer'
import { STACKFERRY_DESKTOP_PROFILE_ID } from '../electron/main/claude/desktop-merge'
import { enableDesktopGateway, enableDesktopOfficial } from '../electron/main/claude/desktop-writer'

describe('claude live writers', () => {
  it('merges Claude Code settings and restores official without wiping permissions', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'stackferry-claude-code-'))
    const claudeHome = path.join(root, 'claude')
    const backupRoot = path.join(root, 'backups')
    await mkdir(claudeHome, { recursive: true })
    await writeFile(
      path.join(claudeHome, 'settings.json'),
      `${JSON.stringify({ permissions: { allow: ['Read'] }, env: { KEEP_ME: 'yes' } }, null, 2)}\n`,
    )

    const first = await enableCodeGateway({
      claudeHome,
      backupRoot,
      provider: {
        baseUrl: 'https://a.example/v1',
        apiKey: 'key-a',
        authScheme: 'bearer',
        model: 'model-a',
      },
    })

    const afterFirst = JSON.parse(await readFile(path.join(claudeHome, 'settings.json'), 'utf8')) as {
      permissions: unknown
      env: Record<string, string>
    }
    expect(afterFirst.permissions).toEqual({ allow: ['Read'] })
    expect(afterFirst.env).toMatchObject({
      KEEP_ME: 'yes',
      ANTHROPIC_BASE_URL: 'https://a.example/v1',
      ANTHROPIC_AUTH_TOKEN: 'key-a',
      ANTHROPIC_MODEL: 'model-a',
      CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
      CLAUDE_CODE_ATTRIBUTION_HEADER: '0',
      CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: '1',
    })
    expect(JSON.parse(await readFile(path.join(first.backupPath, 'settings.json'), 'utf8'))).toMatchObject({
      env: { KEEP_ME: 'yes' },
    })

    await enableCodeOfficial({ claudeHome, backupRoot })
    const afterOfficial = JSON.parse(await readFile(path.join(claudeHome, 'settings.json'), 'utf8')) as {
      permissions: unknown
      env: Record<string, string>
    }
    expect(afterOfficial.permissions).toEqual({ allow: ['Read'] })
    expect(afterOfficial.env).toEqual({ KEEP_ME: 'yes' })
  })

  it('writes Desktop 3P configLibrary and deactivates stackferry on official', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'stackferry-claude-desktop-'))
    const library = path.join(root, 'configLibrary')
    const backupRoot = path.join(root, 'backups')
    await mkdir(library, { recursive: true })
    await writeFile(
      path.join(library, '_meta.json'),
      `${JSON.stringify({ appliedId: 'other-profile', entries: [{ id: 'other-profile', name: 'Bedrock' }] }, null, 2)}\n`,
    )

    await enableDesktopGateway({
      library,
      backupRoot,
      isManaged: async () => false,
      provider: {
        name: 'Corp Gateway',
        baseUrl: 'https://gateway.example/v1',
        apiKey: 'gw-key',
        authScheme: 'bearer',
        model: 'claude-sonnet-4-6',
      },
    })

    const meta = JSON.parse(await readFile(path.join(library, '_meta.json'), 'utf8')) as {
      appliedId: string
      entries: { id: string; name: string }[]
    }
    const profile = JSON.parse(
      await readFile(path.join(library, `${STACKFERRY_DESKTOP_PROFILE_ID}.json`), 'utf8'),
    ) as Record<string, unknown>
    expect(meta.appliedId).toBe(STACKFERRY_DESKTOP_PROFILE_ID)
    expect(meta.entries).toEqual([
      { id: 'other-profile', name: 'Bedrock' },
      { id: STACKFERRY_DESKTOP_PROFILE_ID, name: 'Corp Gateway' },
    ])
    expect(profile.inferenceProvider).toBe('gateway')
    expect(profile.inferenceGatewayApiKey).toBe('gw-key')
    expect(profile.disableDeploymentModeChooser).toBe(true)
    expect(profile.inferenceModels).toBeUndefined()
    const appConfig = JSON.parse(
      await readFile(path.join(root, 'claude_desktop_config.json'), 'utf8'),
    ) as { deploymentMode: string }
    expect(appConfig.deploymentMode).toBe('3p')

    await enableDesktopOfficial({
      library,
      backupRoot,
      isManaged: async () => false,
    })
    const afterOfficial = JSON.parse(await readFile(path.join(library, '_meta.json'), 'utf8')) as {
      appliedId: string | null
      entries: { id: string }[]
    }
    expect(afterOfficial.appliedId).toBeNull()
    expect(afterOfficial.entries).toHaveLength(2)
    expect(existsSync(path.join(library, `${STACKFERRY_DESKTOP_PROFILE_ID}.json`))).toBe(true)
    expect(
      JSON.parse(await readFile(path.join(root, 'claude_desktop_config.json'), 'utf8')),
    ).toMatchObject({ deploymentMode: '1p' })
  })

  it('removes the legacy stackferry profile file after writing the UUID profile', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'stackferry-claude-legacy-'))
    const library = path.join(root, 'configLibrary')
    await mkdir(library, { recursive: true })
    await writeFile(path.join(library, 'stackferry.json'), `${JSON.stringify({ inferenceProvider: 'gateway' }, null, 2)}\n`)
    await writeFile(
      path.join(library, '_meta.json'),
      `${JSON.stringify({ appliedId: 'stackferry', entries: [{ id: 'stackferry', name: 'Old' }] }, null, 2)}\n`,
    )

    await enableDesktopGateway({
      library,
      backupRoot: path.join(root, 'backups'),
      isManaged: async () => false,
      provider: {
        name: 'Corp Gateway',
        baseUrl: 'https://gateway.example/v1',
        apiKey: 'gw-key',
        authScheme: 'bearer',
        model: 'claude-sonnet-4-6',
      },
    })

    expect(existsSync(path.join(library, 'stackferry.json'))).toBe(false)
    expect(existsSync(path.join(library, `${STACKFERRY_DESKTOP_PROFILE_ID}.json`))).toBe(true)
    const meta = JSON.parse(await readFile(path.join(library, '_meta.json'), 'utf8')) as {
      appliedId: string
      entries: { id: string }[]
    }
    expect(meta.appliedId).toBe(STACKFERRY_DESKTOP_PROFILE_ID)
    expect(meta.entries.map((entry) => entry.id)).toEqual([STACKFERRY_DESKTOP_PROFILE_ID])
  })

  it('refuses to write Desktop 3P when a managed policy is present', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'stackferry-claude-policy-'))
    const library = path.join(root, 'configLibrary')
    await expect(
      enableDesktopGateway({
        library,
        backupRoot: path.join(root, 'backups'),
        isManaged: async () => true,
        provider: {
          name: 'Corp Gateway',
          baseUrl: 'https://gateway.example/v1',
          apiKey: 'gw-key',
          authScheme: 'bearer',
          model: '',
        },
      }),
    ).rejects.toMatchObject({ code: 'claude_desktop_managed_policy' } satisfies Partial<AppError>)
    expect(existsSync(path.join(library, '_meta.json'))).toBe(false)
  })
})
