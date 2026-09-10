import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { AppError } from '../../../shared/app-error'
import type { McpServer } from '../../../shared/mcp'
import {
  desiredClaudeTable,
  desiredTomlTable,
  encodeCodexMcp,
  encodeGrokMcp,
  mergeImportedServers,
  parseClaudeMcpTable,
  parseTomlMcpTable,
  projectClaudeMcpServers,
  projectTomlMcpServers,
  type JsonObject,
} from '../../../shared/mcp-live'
import { isPlainObject, parseToml, stringifyToml, type TomlTable } from '../../../shared/provider-overlay'
import { atomicWriteFile } from '../codex/writer'

export type McpLivePaths = {
  codexConfigPath: string
  grokConfigPath: string
  claudeUserJsonPath: string
}

export async function readLiveMcpServers(paths: McpLivePaths): Promise<McpServer[]> {
  const [codex, grok, claude] = await Promise.all([
    readTomlServers(paths.codexConfigPath, 'http_headers'),
    readTomlServers(paths.grokConfigPath, 'headers'),
    readClaudeServers(paths.claudeUserJsonPath),
  ])
  return mergeImportedServers([
    { target: 'codex', servers: codex },
    { target: 'claude', servers: claude },
    { target: 'grok', servers: grok },
  ])
}

export async function writeLiveMcpServers(paths: McpLivePaths, servers: readonly McpServer[]): Promise<void> {
  const managedIds = new Set(servers.map((server) => server.id))
  await writeTomlMcp(paths.codexConfigPath, managedIds, desiredTomlTable(servers, 'codex', encodeCodexMcp))
  await writeTomlMcp(paths.grokConfigPath, managedIds, desiredTomlTable(servers, 'grok', encodeGrokMcp))
  await writeClaudeMcp(paths.claudeUserJsonPath, managedIds, desiredClaudeTable(servers))
}

async function readTomlServers(
  filePath: string,
  headersKey: 'http_headers' | 'headers',
): Promise<McpServer[]> {
  const doc = await readTomlOrEmpty(filePath)
  return parseTomlMcpTable(doc.mcp_servers, headersKey)
}

async function readClaudeServers(filePath: string): Promise<McpServer[]> {
  const doc = await readJsonOrEmpty(filePath)
  return parseClaudeMcpTable(doc.mcpServers)
}

async function writeTomlMcp(
  filePath: string,
  managedIds: ReadonlySet<string>,
  desired: Record<string, TomlTable>,
): Promise<void> {
  const current = await readTomlOrEmpty(filePath)
  const next = projectTomlMcpServers(current, managedIds, desired)
  if (Object.keys(current).length === 0 && Object.keys(next).length === 0) return
  await mkdirFor(filePath)
  await atomicWriteFile(filePath, stringifyToml(next))
}

async function writeClaudeMcp(
  filePath: string,
  managedIds: ReadonlySet<string>,
  desired: Record<string, JsonObject>,
): Promise<void> {
  const current = await readJsonOrEmpty(filePath)
  const next = projectClaudeMcpServers(current, managedIds, desired)
  if (Object.keys(current).length === 0 && Object.keys(next).length === 0) return
  await mkdirFor(filePath)
  await atomicWriteFile(filePath, `${JSON.stringify(next, null, 2)}\n`)
}

async function readTomlOrEmpty(filePath: string): Promise<TomlTable> {
  if (!existsSync(filePath)) return {}
  try {
    return parseToml(await readFile(filePath, 'utf8'))
  } catch (error) {
    if (error instanceof AppError) throw error
    throw error
  }
}

async function readJsonOrEmpty(filePath: string): Promise<JsonObject> {
  if (!existsSync(filePath)) return {}
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as unknown
    if (!isPlainObject(parsed)) throw new AppError('mcp_claude_json_corrupt')
    return parsed
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError('mcp_claude_json_corrupt')
  }
}

async function mkdirFor(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
}
