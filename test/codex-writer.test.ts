import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { enableOfficialLiveConfig, enableRouterLiveConfig, enableThirdPartyLiveConfig } from '../electron/main/codex/writer'

const originalAuth = '{"OPENAI_API_KEY":"keep-me","tokens":{"access_token":"chatgpt"}}'

describe('codex live writer', () => {
  it('merges config, backups live files, and leaves auth.json untouched', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'stackferry-'))
    const codexHome = path.join(root, 'codex')
    const backupRoot = path.join(root, 'backups')
    await mkdir(codexHome, { recursive: true })
    await writeFile(
      path.join(codexHome, 'config.toml'),
      'approval_policy = "on-request"\nmodel = "kept-model"\n',
    )
    await writeFile(path.join(codexHome, 'auth.json'), originalAuth)

    const first = await enableThirdPartyLiveConfig({
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

    const afterFirst = await readFile(path.join(codexHome, 'config.toml'), 'utf8')
    expect(afterFirst).toContain('approval_policy = "on-request"')
    expect(afterFirst).toContain('model = "model-a"')
    expect(afterFirst).toContain('base_url = "https://a.example/v1"')
    expect(afterFirst).toContain('experimental_bearer_token = "key-a"')
    expect(await readFile(path.join(codexHome, 'auth.json'), 'utf8')).toBe(originalAuth)
    expect(await readFile(path.join(first.backupPath, 'auth.json'), 'utf8')).toBe(originalAuth)

    await enableThirdPartyLiveConfig({
      codexHome,
      backupRoot,
      provider: {
        id: 'prov-b',
        name: 'Provider B',
        tomlText: `model = "model-b"
model_provider = "provider_b"

[model_providers.provider_b]
name = "Provider B"
base_url = "https://b.example/v1"
wire_api = "responses"
`,
        apiKey: 'key-b',
      },
    })
    const afterSecond = await readFile(path.join(codexHome, 'config.toml'), 'utf8')
    expect(afterSecond).toContain('key-b')
    expect(afterSecond).not.toContain('key-a')

    await enableOfficialLiveConfig({ codexHome, backupRoot })
    const afterOfficial = await readFile(path.join(codexHome, 'config.toml'), 'utf8')
    expect(afterOfficial).toContain('model_provider = "openai"')
    expect(afterOfficial).toContain('approval_policy = "on-request"')
    expect(afterOfficial).not.toContain('experimental_bearer_token')
    expect(await readFile(path.join(codexHome, 'auth.json'), 'utf8')).toBe(originalAuth)
  })

  it('writes the local router table without copying the api key', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'stackferry-router-'))
    const codexHome = path.join(root, 'codex')
    const backupRoot = path.join(root, 'backups')
    await mkdir(codexHome, { recursive: true })
    await writeFile(path.join(codexHome, 'config.toml'), 'approval_policy = "on-request"\n')

    await enableRouterLiveConfig({
      codexHome,
      backupRoot,
      port: 18765,
      provider: {
        tomlText: `model = "model-r"
model_provider = "provider_r"

[model_providers.provider_r]
name = "Provider R"
base_url = "https://r.example/v1"
wire_api = "responses"
`,
      },
    })

    const written = await readFile(path.join(codexHome, 'config.toml'), 'utf8')
    expect(written).toContain('model_provider = "stackferry_router"')
    expect(written).toContain('base_url = "http://127.0.0.1:18765/v1"')
    expect(written).toContain('wire_api = "responses"')
    expect(written).toContain('model = "model-r"')
    expect(written).not.toContain('r.example')
    expect(written).not.toContain('experimental_bearer_token')
    expect(written).not.toContain('localhost')
  })
})
