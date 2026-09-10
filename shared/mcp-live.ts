import {
  cleanStringMap,
  type ClaudeRemoteType,
  type McpServer,
  type McpTarget,
  normalizeMcpServer,
  requireMcpId,
  uniqueMcpTargets,
} from './mcp'
import { isPlainObject, type TomlTable } from './provider-overlay'

export type JsonObject = Record<string, unknown>

export function mergeManagedRecord(
  existing: Record<string, unknown>,
  managedIds: ReadonlySet<string>,
  desired: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = {}
  for (const [id, value] of Object.entries(existing)) {
    if (!managedIds.has(id)) next[id] = value
  }
  for (const [id, value] of Object.entries(desired)) {
    next[id] = value
  }
  return next
}

export function projectTomlMcpServers(
  doc: TomlTable,
  managedIds: ReadonlySet<string>,
  desired: Record<string, TomlTable>,
): TomlTable {
  const existing = isPlainObject(doc.mcp_servers) ? doc.mcp_servers : {}
  const merged = mergeManagedRecord(existing, managedIds, desired)
  const next = { ...doc }
  if (Object.keys(merged).length === 0) delete next.mcp_servers
  else next.mcp_servers = merged
  return next
}

export function projectClaudeMcpServers(
  doc: JsonObject,
  managedIds: ReadonlySet<string>,
  desired: Record<string, JsonObject>,
): JsonObject {
  const existing = isPlainObject(doc.mcpServers) ? doc.mcpServers : {}
  const merged = mergeManagedRecord(existing, managedIds, desired)
  const next = { ...doc }
  if (Object.keys(merged).length === 0) delete next.mcpServers
  else next.mcpServers = merged
  return next
}

export function encodeCodexMcp(server: McpServer): TomlTable {
  if (server.transport === 'stdio') {
    return compactRecord({
      command: server.command,
      args: server.args,
      env: server.env,
      cwd: server.cwd,
    })
  }
  return compactRecord({
    url: server.url,
    http_headers: server.headers,
    bearer_token_env_var: server.bearerTokenEnvVar,
  })
}

export function encodeGrokMcp(server: McpServer): TomlTable {
  if (server.transport === 'stdio') {
    return compactRecord({
      command: server.command,
      args: server.args,
      env: server.env,
      cwd: server.cwd,
    })
  }
  return compactRecord({
    url: server.url,
    headers: server.headers,
  })
}

export function encodeClaudeMcp(server: McpServer): JsonObject {
  if (server.transport === 'stdio') {
    return compactRecord({
      command: server.command,
      args: server.args,
      env: server.env,
    })
  }
  return compactRecord({
    type: server.claudeRemoteType ?? 'http',
    url: server.url,
    headers: server.headers,
  })
}

export function desiredTomlTable(
  servers: readonly McpServer[],
  target: McpTarget,
  encode: (server: McpServer) => TomlTable,
): Record<string, TomlTable> {
  const desired: Record<string, TomlTable> = {}
  for (const server of servers) {
    if (!server.appliedTo.includes(target)) continue
    desired[server.id] = encode(server)
  }
  return desired
}

export function desiredClaudeTable(servers: readonly McpServer[]): Record<string, JsonObject> {
  const desired: Record<string, JsonObject> = {}
  for (const server of servers) {
    if (!server.appliedTo.includes('claude')) continue
    desired[server.id] = encodeClaudeMcp(server)
  }
  return desired
}

export function parseTomlMcpTable(
  value: unknown,
  headersKey: 'http_headers' | 'headers',
): McpServer[] {
  if (!isPlainObject(value)) return []
  const servers: McpServer[] = []
  for (const [id, raw] of Object.entries(value)) {
    const parsed = parseTomlMcpEntry(id, raw, headersKey)
    if (parsed) servers.push(parsed)
  }
  return servers
}

export function mergeImportedServers(
  groups: ReadonlyArray<{ target: McpTarget; servers: readonly McpServer[] }>,
): McpServer[] {
  const byId = new Map<string, McpServer>()
  for (const group of groups) {
    for (const server of group.servers) {
      const existing = byId.get(server.id)
      if (!existing) {
        byId.set(server.id, { ...server, appliedTo: uniqueMcpTargets([group.target]) })
        continue
      }
      existing.appliedTo = uniqueMcpTargets([...existing.appliedTo, group.target])
    }
  }
  return [...byId.values()]
}

export function parseClaudeMcpTable(value: unknown): McpServer[] {
  if (!isPlainObject(value)) return []
  const servers: McpServer[] = []
  for (const [id, raw] of Object.entries(value)) {
    const parsed = parseClaudeMcpEntry(id, raw)
    if (parsed) servers.push(parsed)
  }
  return servers
}

function parseTomlMcpEntry(
  rawId: string,
  raw: unknown,
  headersKey: 'http_headers' | 'headers',
): McpServer | null {
  if (!isPlainObject(raw)) return null
  const id = safeMcpId(rawId)
  if (!id) return null
  const url = stringValue(raw.url)
  const command = stringValue(raw.command)
  if (url) {
    return liveServer({
      id,
      name: id,
      transport: 'http',
      url,
      headers: cleanStringMap(raw[headersKey]),
      bearerTokenEnvVar: stringValue(raw.bearer_token_env_var),
    })
  }
  if (!command) return null
  return liveServer({
    id,
    name: id,
    transport: 'stdio',
    command,
    args: stringList(raw.args),
    env: cleanStringMap(raw.env),
    cwd: stringValue(raw.cwd),
  })
}

function parseClaudeMcpEntry(rawId: string, raw: unknown): McpServer | null {
  if (!isPlainObject(raw)) return null
  const id = safeMcpId(rawId)
  if (!id) return null
  const url = stringValue(raw.url)
  const command = stringValue(raw.command)
  const remoteType = claudeRemoteType(raw.type)
  if (url) {
    if (!remoteType) return null
    return liveServer({
      id,
      name: id,
      transport: 'http',
      url,
      headers: cleanStringMap(raw.headers),
      claudeRemoteType: remoteType,
    })
  }
  if (!command) return null
  return liveServer({
    id,
    name: id,
    transport: 'stdio',
    command,
    args: stringList(raw.args),
    env: cleanStringMap(raw.env),
  })
}

function liveServer(input: {
  id: string
  name: string
  transport: 'stdio' | 'http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  headers?: Record<string, string>
  bearerTokenEnvVar?: string
  claudeRemoteType?: ClaudeRemoteType | null
}): McpServer | null {
  try {
    return normalizeMcpServer({ ...input, appliedTo: [] })
  } catch {
    return null
  }
}

function claudeRemoteType(value: unknown): ClaudeRemoteType | null {
  if (value === 'sse') return 'sse'
  if (value === 'http' || value === 'streamable-http') return 'http'
  return null
}

function safeMcpId(value: string): string | null {
  try {
    return requireMcpId(value)
  } catch {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_')
      .replace(/^[_-]+|[_-]+$/g, '')
    if (!slug) return null
    try {
      return requireMcpId(/^[0-9]/.test(slug) ? `s_${slug}` : slug)
    } catch {
      return null
    }
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
}

function compactRecord(value: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined || item === null || item === '') continue
    if (Array.isArray(item) && item.length === 0) continue
    if (isPlainObject(item) && Object.keys(item).length === 0) continue
    next[key] = item
  }
  return next
}
