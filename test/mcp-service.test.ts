import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { McpService } from '../electron/main/mcp/service'
import { parseToml } from '../shared/provider-overlay'

async function tempService() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stackferry-mcp-'))
  const userData = path.join(root, 'user')
  const codexHome = path.join(root, 'codex')
  const grokHome = path.join(root, 'grok')
  const homedir = path.join(root, 'home')
  await mkdir(userData, { recursive: true })
  await mkdir(codexHome, { recursive: true })
  await mkdir(grokHome, { recursive: true })
  await mkdir(homedir, { recursive: true })
  const service = new McpService({
    userData,
    getCodexHome: () => codexHome,
    getGrokHome: () => grokHome,
    getHomedir: () => homedir,
  })
  return { service, userData, codexHome, grokHome, homedir }
}

describe('mcp service', () => {
  it('projects stdio and http servers into each CLI format and leaves unmanaged keys', async () => {
    const { service, codexHome, grokHome, homedir } = await tempService()
    await writeFile(
      path.join(codexHome, 'config.toml'),
      `[mcp_servers.keep]\ncommand = "keep-mcp"\n\n[model_providers.openai]\nname = "OpenAI"\n`,
    )
    await service.add({
      id: 'docs',
      name: 'Docs',
      transport: 'stdio',
      command: 'docs-mcp',
      args: ['--port', '9'],
      appliedTo: ['codex', 'claude', 'grok'],
    })
    await service.add({
      id: 'linear',
      name: 'Linear',
      transport: 'http',
      url: 'https://mcp.linear.app/mcp',
      headers: { Authorization: 'Bearer x' },
      bearerTokenEnvVar: 'LINEAR_TOKEN',
      appliedTo: ['codex', 'claude', 'grok'],
    })

    const codex = parseToml(await readFile(path.join(codexHome, 'config.toml'), 'utf8'))
    const grok = parseToml(await readFile(path.join(grokHome, 'config.toml'), 'utf8'))
    const claude = JSON.parse(await readFile(path.join(homedir, '.claude.json'), 'utf8')) as {
      mcpServers: Record<string, Record<string, unknown>>
    }
    const servers = codex.mcp_servers as Record<string, Record<string, unknown>>
    expect(servers.keep).toEqual({ command: 'keep-mcp' })
    expect(servers.docs).toEqual({ command: 'docs-mcp', args: ['--port', '9'] })
    expect(servers.linear).toEqual({
      url: 'https://mcp.linear.app/mcp',
      http_headers: { Authorization: 'Bearer x' },
      bearer_token_env_var: 'LINEAR_TOKEN',
    })
    expect(codex.model_providers).toEqual({ openai: { name: 'OpenAI' } })

    const grokServers = grok.mcp_servers as Record<string, Record<string, unknown>>
    expect(grokServers.linear).toEqual({
      url: 'https://mcp.linear.app/mcp',
      headers: { Authorization: 'Bearer x' },
    })
    expect(grokServers.linear).not.toHaveProperty('http_headers')
    expect(grokServers.linear).not.toHaveProperty('type')

    expect(claude.mcpServers.docs).toEqual({ command: 'docs-mcp', args: ['--port', '9'] })
    expect(claude.mcpServers.docs).not.toHaveProperty('type')
    expect(claude.mcpServers.linear).toEqual({
      type: 'http',
      url: 'https://mcp.linear.app/mcp',
      headers: { Authorization: 'Bearer x' },
    })
    expect(existsSync(path.join(homedir, '.claude', 'settings.json'))).toBe(false)
  })

  it('imports live servers once without overwriting an edited catalog entry', async () => {
    const { service, codexHome, grokHome, homedir } = await tempService()
    await writeFile(path.join(codexHome, 'config.toml'), `[mcp_servers.docs]\ncommand = "from-codex"\n`)
    await writeFile(path.join(grokHome, 'config.toml'), `[mcp_servers.docs]\ncommand = "from-grok"\n`)
    await writeFile(
      path.join(homedir, '.claude.json'),
      `${JSON.stringify({ mcpServers: { extra: { command: 'claude-mcp' } } }, null, 2)}\n`,
    )
    const first = await service.list()
    expect(first.map((item) => item.id).sort()).toEqual(['docs', 'extra'])
    const docs = first.find((item) => item.id === 'docs')
    expect(docs?.command).toBe('from-codex')
    expect(docs?.appliedTo).toEqual(['codex', 'grok'])
    await service.update('docs', {
      id: 'docs',
      name: 'Docs',
      transport: 'stdio',
      command: 'edited',
      appliedTo: ['codex'],
    })
    await writeFile(path.join(codexHome, 'config.toml'), `[mcp_servers.docs]\ncommand = "later-live"\n`)
    const imported = await service.importFromLive()
    expect(imported.find((item) => item.id === 'docs')?.command).toBe('edited')
    const listed = await service.list()
    expect(listed).toHaveLength(2)
  })

  it('turns a CLI target off without deleting the catalog record', async () => {
    const { service, grokHome } = await tempService()
    await service.add({
      id: 'docs',
      name: 'Docs',
      transport: 'stdio',
      command: 'docs-mcp',
      appliedTo: ['codex', 'grok'],
    })
    await service.setTarget('docs', 'grok', false)
    const items = await service.list()
    expect(items[0]?.appliedTo).toEqual(['codex'])
    expect(existsSync(path.join(grokHome, 'config.toml'))).toBe(true)
    const grok = parseToml(await readFile(path.join(grokHome, 'config.toml'), 'utf8'))
    expect(grok.mcp_servers).toBeUndefined()
  })

  it('rejects a duplicate id', async () => {
    const { service } = await tempService()
    await service.add({
      id: 'docs',
      name: 'Docs',
      transport: 'stdio',
      command: 'docs-mcp',
    })
    await expect(
      service.add({
        id: 'docs',
        name: 'Other',
        transport: 'stdio',
        command: 'other',
      }),
    ).rejects.toMatchObject({ code: 'mcp_id_exists' })
  })
})
