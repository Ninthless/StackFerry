import { AppError } from './app-error'

export const MCP_TARGETS = ['claude', 'codex', 'grok'] as const
export type McpTarget = (typeof MCP_TARGETS)[number]

export const MCP_TRANSPORTS = ['stdio', 'http'] as const
export type McpTransport = (typeof MCP_TRANSPORTS)[number]

export type ClaudeRemoteType = 'http' | 'sse'

export type McpServer = {
  id: string
  name: string
  transport: McpTransport
  command: string
  args: string[]
  env: Record<string, string>
  cwd: string
  url: string
  headers: Record<string, string>
  bearerTokenEnvVar: string
  claudeRemoteType: ClaudeRemoteType | null
  appliedTo: McpTarget[]
}

export type McpDraft = {
  id: string
  name: string
  transport: McpTransport
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  headers?: Record<string, string>
  bearerTokenEnvVar?: string
  claudeRemoteType?: ClaudeRemoteType | null
  appliedTo?: McpTarget[]
}

export type McpListItem = McpServer

export const MCP_ID_MAX = 64

const MCP_ID_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/

export function isMcpTarget(value: unknown): value is McpTarget {
  return typeof value === 'string' && (MCP_TARGETS as readonly string[]).includes(value)
}

export function isMcpTransport(value: unknown): value is McpTransport {
  return typeof value === 'string' && (MCP_TRANSPORTS as readonly string[]).includes(value)
}

export function requireMcpId(value: string): string {
  const id = value.trim()
  if (!MCP_ID_PATTERN.test(id) || id.length > MCP_ID_MAX) {
    throw new AppError('mcp_id_invalid')
  }
  return id
}

export function uniqueMcpTargets(values: readonly unknown[]): McpTarget[] {
  const seen = new Set<McpTarget>()
  for (const value of values) {
    if (isMcpTarget(value)) seen.add(value)
  }
  return MCP_TARGETS.filter((target) => seen.has(target))
}

export function suggestMcpId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, MCP_ID_MAX)
  if (!slug) return ''
  if (/^[0-9]/.test(slug)) return `s_${slug}`.slice(0, MCP_ID_MAX)
  return slug
}

export function parseArgList(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean)
}

export function formatArgList(args: readonly string[]): string {
  return args.join(' ')
}

export function cleanStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const next: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    const name = key.trim()
    if (!name || typeof item !== 'string') continue
    next[name] = item
  }
  return next
}

export function normalizeMcpServer(input: McpDraft): McpServer {
  const id = requireMcpId(input.id)
  const name = input.name.trim()
  if (!name) throw new AppError('mcp_name_required')
  if (!isMcpTransport(input.transport)) throw new AppError('mcp_transport')
  const appliedTo = uniqueMcpTargets(input.appliedTo ?? [])
  const args = Array.isArray(input.args)
    ? input.args.map((item) => item.trim()).filter(Boolean)
    : []
  const env = cleanStringMap(input.env)
  const headers = cleanStringMap(input.headers)
  const command = (input.command ?? '').trim()
  const cwd = (input.cwd ?? '').trim()
  const url = (input.url ?? '').trim()
  const bearerTokenEnvVar = (input.bearerTokenEnvVar ?? '').trim()
  if (input.transport === 'stdio') {
    if (!command) throw new AppError('mcp_command_required')
    return {
      id,
      name,
      transport: 'stdio',
      command,
      args,
      env,
      cwd,
      url: '',
      headers: {},
      bearerTokenEnvVar: '',
      claudeRemoteType: null,
      appliedTo,
    }
  }
  if (!isHttpUrl(url)) throw new AppError('mcp_url_invalid')
  return {
    id,
    name,
    transport: 'http',
    command: '',
    args: [],
    env: {},
    cwd: '',
    url,
    headers,
    bearerTokenEnvVar,
    claudeRemoteType: input.claudeRemoteType === 'sse' ? 'sse' : 'http',
    appliedTo,
  }
}

export function serversForTarget(servers: readonly McpServer[], target: McpTarget): McpServer[] {
  return servers.filter((server) => server.appliedTo.includes(target))
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
