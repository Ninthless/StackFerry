import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { AppError } from '../../../shared/app-error'
import { normalizeMcpServer, type McpServer } from '../../../shared/mcp'
import { atomicWriteFile } from '../codex/writer'

const STORE_VERSION = 1

export type McpFile = {
  version: number
  importedFromLive: boolean
  order: string[]
  servers: Record<string, McpServer>
}

export function mcpStorePath(userData: string): string {
  return path.join(userData, 'mcp.json')
}

export class McpStore {
  constructor(private readonly filePath: string) {}

  async read(): Promise<McpFile> {
    if (!existsSync(this.filePath)) return this.emptyFile()
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<McpFile>
      return this.normalize(parsed)
    } catch (error) {
      if (error instanceof AppError) throw error
      throw new AppError('mcp_store_corrupt')
    }
  }

  async write(file: McpFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true })
    await atomicWriteFile(this.filePath, `${JSON.stringify(this.normalize(file), null, 2)}\n`)
  }

  list(file: McpFile): McpServer[] {
    return file.order.flatMap((id) => {
      const server = file.servers[id]
      return server ? [server] : []
    })
  }

  upsert(file: McpFile, server: McpServer, isNew: boolean): McpFile {
    const servers = { ...file.servers, [server.id]: server }
    const order = isNew ? [...file.order.filter((id) => id !== server.id), server.id] : file.order
    return this.normalize({ ...file, servers, order })
  }

  remove(file: McpFile, id: string): McpFile {
    const servers = { ...file.servers }
    delete servers[id]
    return this.normalize({
      ...file,
      servers,
      order: file.order.filter((item) => item !== id),
    })
  }

  private emptyFile(): McpFile {
    return { version: STORE_VERSION, importedFromLive: false, order: [], servers: {} }
  }

  private normalize(parsed: Partial<McpFile>): McpFile {
    const servers: Record<string, McpServer> = {}
    const rawServers = parsed.servers && typeof parsed.servers === 'object' ? parsed.servers : {}
    for (const [id, value] of Object.entries(rawServers)) {
      try {
        const server = normalizeMcpServer({ ...value, id: value?.id?.trim() ? value.id : id })
        servers[server.id] = server
      } catch {
        throw new AppError('mcp_store_corrupt')
      }
    }
    const seen = new Set<string>()
    const order: string[] = []
    const rawOrder = Array.isArray(parsed.order) ? parsed.order : Object.keys(servers)
    for (const id of rawOrder) {
      if (typeof id !== 'string' || !servers[id] || seen.has(id)) continue
      seen.add(id)
      order.push(id)
    }
    for (const id of Object.keys(servers)) {
      if (seen.has(id)) continue
      order.push(id)
    }
    return {
      version: STORE_VERSION,
      importedFromLive: parsed.importedFromLive === true,
      order,
      servers,
    }
  }
}
