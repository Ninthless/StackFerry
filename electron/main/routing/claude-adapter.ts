import type { ClaudeEnableService } from '../claude/service'
import type { ClaudeProviderStore } from '../claude/store'
import type { LaneAdapter } from './lane'
import { readUpstreamApiKey, type UpstreamTarget } from './proxy'

export function createClaudeAdapter(options: {
  store: ClaudeProviderStore
  claude: ClaudeEnableService
}): LaneAdapter {
  return {
    async listCustomIds() {
      const providers = await options.store.list()
      return providers.filter((item) => item.kind === 'custom').map((item) => item.id)
    },
    async peekActive() {
      const id = await options.store.getActiveId()
      if (!id) return null
      try {
        const provider = await options.store.peek(id)
        return { id: provider.id, kind: provider.kind }
      } catch {
        return null
      }
    },
    async peekKind(id) {
      try {
        return (await options.store.peek(id)).kind
      } catch {
        return null
      }
    },
    async overlayNeedsRouter() {
      return false
    },
    async resolveUpstream(id) {
      try {
        const provider = await options.store.peek(id)
        if (provider.kind !== 'custom') return null
        const baseUrl = provider.baseUrl.trim()
        if (!baseUrl) return null
        const apiKey = readUpstreamApiKey(() => options.store.decryptApiKey(provider))
        if (!apiKey) return null
        return {
          id: provider.id,
          baseUrl,
          apiKey,
          authScheme: provider.authScheme,
        } satisfies UpstreamTarget
      } catch {
        return null
      }
    },
    async writeOfficial() {
      await options.claude.writeOfficial()
    },
    async writeDirect(id) {
      await options.claude.writeDirect(await options.store.peek(id))
    },
    async writeRouter(port, activeId) {
      await options.claude.writeRouter(await options.store.peek(activeId), port)
    },
    async markEnabled(id) {
      await options.store.markEnabled(id)
    },
  }
}
