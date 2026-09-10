import { AppError } from '../../../shared/app-error'
import {
  isMcpTarget,
  normalizeMcpServer,
  uniqueMcpTargets,
  type McpDraft,
  type McpListItem,
  type McpServer,
  type McpTarget,
} from '../../../shared/mcp'
import { claudeUserJsonPath } from '../claude/home'
import { codexConfigPath } from '../codex/home'
import { grokConfigPath } from '../grok/home'
import { readLiveMcpServers, writeLiveMcpServers, type McpLivePaths } from './live'
import { McpStore, mcpStorePath } from './store'

export type McpServiceDeps = {
  userData: string
  getCodexHome: () => string
  getGrokHome: () => string
  getHomedir: () => string
  storePath?: string
  paths?: McpLivePaths
}

export class McpService {
  private readonly store: McpStore
  private readonly paths: () => McpLivePaths

  constructor(private readonly deps: McpServiceDeps) {
    this.store = new McpStore(deps.storePath ?? mcpStorePath(deps.userData))
    this.paths = () =>
      deps.paths ?? {
        codexConfigPath: codexConfigPath(deps.getCodexHome()),
        grokConfigPath: grokConfigPath(deps.getGrokHome()),
        claudeUserJsonPath: claudeUserJsonPath(() => deps.getHomedir()),
      }
  }

  async list(): Promise<McpListItem[]> {
    const file = await this.store.read()
    if (!file.importedFromLive && file.order.length === 0) {
      return this.importFromLive()
    }
    return this.store.list(file)
  }

  async add(draft: McpDraft): Promise<McpListItem[]> {
    const server = normalizeMcpServer(draft)
    const file = await this.store.read()
    if (file.servers[server.id]) throw new AppError('mcp_id_exists')
    return this.persist(this.store.upsert(file, server, true))
  }

  async update(id: string, draft: McpDraft): Promise<McpListItem[]> {
    const file = await this.store.read()
    const current = file.servers[id]
    if (!current) throw new AppError('mcp_missing')
    const server = normalizeMcpServer({ ...draft, id })
    return this.persist(this.store.upsert(file, server, false))
  }

  async delete(id: string): Promise<McpListItem[]> {
    const file = await this.store.read()
    if (!file.servers[id]) throw new AppError('mcp_missing')
    return this.persist(this.store.remove(file, id))
  }

  async setTarget(id: string, target: McpTarget, enabled: boolean): Promise<McpListItem[]> {
    if (!isMcpTarget(target) || typeof enabled !== 'boolean') return this.list()
    const file = await this.store.read()
    const current = file.servers[id]
    if (!current) throw new AppError('mcp_missing')
    const appliedTo = uniqueMcpTargets(
      enabled ? [...current.appliedTo, target] : current.appliedTo.filter((item) => item !== target),
    )
    return this.persist(this.store.upsert(file, { ...current, appliedTo }, false))
  }

  async importFromLive(): Promise<McpListItem[]> {
    const file = await this.store.read()
    const imported = await readLiveMcpServers(this.paths())
    let next = { ...file, importedFromLive: true, servers: { ...file.servers }, order: [...file.order] }
    for (const server of imported) {
      const existing = next.servers[server.id]
      if (existing) {
        next.servers[server.id] = {
          ...existing,
          appliedTo: uniqueMcpTargets([...existing.appliedTo, ...server.appliedTo]),
        }
        continue
      }
      next = this.store.upsert(next, server, true)
    }
    return this.persist(next)
  }

  private async persist(file: ReturnType<McpStore['remove']>): Promise<McpServer[]> {
    await this.store.write(file)
    const servers = this.store.list(file)
    await writeLiveMcpServers(this.paths(), servers)
    return servers
  }
}
