import { describe, expect, it } from 'vitest'
import { normalizeMcpServer, suggestMcpId } from '../shared/mcp'
import {
  encodeClaudeMcp,
  encodeCodexMcp,
  encodeGrokMcp,
  mergeImportedServers,
  mergeManagedRecord,
  parseClaudeMcpTable,
  parseTomlMcpTable,
  projectClaudeMcpServers,
  projectTomlMcpServers,
} from '../shared/mcp-live'
import { expectAppError } from './expect-app-error'

const stdio = normalizeMcpServer({
  id: 'filesystem',
  name: 'Filesystem',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
  env: { TOKEN: 'secret' },
  appliedTo: ['codex', 'claude', 'grok'],
})

const remote = normalizeMcpServer({
  id: 'linear',
  name: 'Linear',
  transport: 'http',
  url: 'https://mcp.linear.app/mcp',
  headers: { Authorization: 'Bearer x' },
  bearerTokenEnvVar: 'LINEAR_TOKEN',
  claudeRemoteType: 'sse',
  appliedTo: ['codex', 'claude', 'grok'],
})

describe('mcp normalize', () => {
  it('rejects ids that do not start with a letter', () => {
    expectAppError(() => requireId('1docs'), 'mcp_id_invalid')
  })

  it('suggests a lowercase id from the display name', () => {
    expect(suggestMcpId('GitHub Tools')).toBe('github_tools')
  })
})

describe('mcp live projection', () => {
  it('encodes Codex HTTP headers as http_headers and Grok as headers', () => {
    expect(encodeCodexMcp(remote)).toEqual({
      url: 'https://mcp.linear.app/mcp',
      http_headers: { Authorization: 'Bearer x' },
      bearer_token_env_var: 'LINEAR_TOKEN',
    })
    expect(encodeGrokMcp(remote)).toEqual({
      url: 'https://mcp.linear.app/mcp',
      headers: { Authorization: 'Bearer x' },
    })
    expect(encodeGrokMcp(remote)).not.toHaveProperty('http_headers')
    expect(encodeGrokMcp(remote)).not.toHaveProperty('type')
    expect(encodeGrokMcp(remote)).not.toHaveProperty('bearer_token_env_var')
  })

  it('omits type for Claude stdio and writes type for remote servers', () => {
    expect(encodeClaudeMcp(stdio)).toEqual({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      env: { TOKEN: 'secret' },
    })
    expect(encodeClaudeMcp(stdio)).not.toHaveProperty('type')
    expect(encodeClaudeMcp(remote)).toEqual({
      type: 'sse',
      url: 'https://mcp.linear.app/mcp',
      headers: { Authorization: 'Bearer x' },
    })
  })

  it('keeps unmanaged servers and only removes managed ids that are not desired', () => {
    const merged = mergeManagedRecord(
      { keep: { command: 'keep-mcp' }, docs: { command: 'old' } },
      new Set(['docs', 'gone']),
      { docs: { command: 'new' } },
    )
    expect(merged).toEqual({
      keep: { command: 'keep-mcp' },
      docs: { command: 'new' },
    })
    const toml = projectTomlMcpServers(
      { model: 'gpt-5', mcp_servers: { keep: { command: 'keep-mcp' }, docs: { command: 'old' } } },
      new Set(['docs']),
      {},
    )
    expect(toml.model).toBe('gpt-5')
    expect(toml.mcp_servers).toEqual({ keep: { command: 'keep-mcp' } })
  })

  it('omits empty mcp tables after the last managed server is removed', () => {
    const toml = projectTomlMcpServers({ mcp_servers: { docs: { command: 'docs-mcp' } } }, new Set(['docs']), {})
    expect(toml.mcp_servers).toBeUndefined()
    const json = projectClaudeMcpServers({ mcpServers: { docs: { command: 'docs-mcp' } } }, new Set(['docs']), {})
    expect(json.mcpServers).toBeUndefined()
  })

  it('parses Codex http_headers and Claude sse, and skips a url without type', () => {
    const fromToml = parseTomlMcpTable(
      {
        linear: {
          url: 'https://mcp.linear.app/mcp',
          http_headers: { Authorization: 'Bearer x' },
          bearer_token_env_var: 'LINEAR_TOKEN',
        },
      },
      'http_headers',
    )
    expect(fromToml[0]?.headers).toEqual({ Authorization: 'Bearer x' })
    expect(fromToml[0]?.bearerTokenEnvVar).toBe('LINEAR_TOKEN')
    const fromClaude = parseClaudeMcpTable({
      linear: { type: 'sse', url: 'https://mcp.linear.app/mcp' },
      broken: { url: 'https://mcp.example.com/mcp' },
    })
    expect(fromClaude).toHaveLength(1)
    expect(fromClaude[0]?.claudeRemoteType).toBe('sse')
  })

  it('unions CLI targets when the same id is imported from multiple files', () => {
    const merged = mergeImportedServers([
      { target: 'codex', servers: [{ ...stdio, appliedTo: [] }] },
      { target: 'grok', servers: [{ ...stdio, command: 'ignored', appliedTo: [] }] },
    ])
    expect(merged).toEqual([{ ...stdio, appliedTo: ['codex', 'grok'] }])
  })
})

function requireId(id: string): void {
  normalizeMcpServer({ id, name: 'Demo', transport: 'stdio', command: 'echo' })
}
