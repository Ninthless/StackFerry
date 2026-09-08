import type { GrokEnableService } from '../grok/service'
import type { GrokProviderStore } from '../grok/store'
import type { LaneAdapter } from './lane'
import type { UpstreamTarget } from './proxy'

export function createGrokAdapter(options: {
  store: GrokProviderStore
  grok: GrokEnableService
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
    async overlayNeedsRouter(id) {
      try {
        const provider = await options.store.peek(id)
        return provider.kind === 'custom' && provider.apiBackend === 'chat_completions'
      } catch {
        return false
      }
    },
    async resolveUpstream(id) {
      try {
        const provider = await options.store.peek(id)
        if (provider.kind !== 'custom') return null
        const baseUrl = provider.baseUrl.trim()
        if (!baseUrl) return null
        let apiKey = ''
        try {
          apiKey = options.store.decryptApiKey(provider)
        } catch {
          apiKey = ''
        }
        return {
          id: provider.id,
          baseUrl,
          apiKey,
          wireApi: provider.apiBackend === 'chat_completions' ? 'chat' : 'responses',
        } satisfies UpstreamTarget
      } catch {
        return null
      }
    },
    async writeOfficial() {
      await options.grok.writeOfficial()
    },
    async writeDirect(id) {
      await options.grok.writeDirect(await options.store.peek(id))
    },
    async writeRouter(port, activeId) {
      await options.grok.writeRouter(await options.store.peek(activeId), port)
    },
    async markEnabled(id) {
      await options.store.markEnabled(id)
    },
  }
}
