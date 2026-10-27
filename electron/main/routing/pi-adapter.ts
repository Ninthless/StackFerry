import type { PiEnableService } from '../pi/service'
import type { PiProviderStore } from '../pi/store'
import { assertSamePiApi, piApisForQueue } from '../pi/config'
import type { LaneAdapter } from './lane'
import { readUpstreamApiKey, type UpstreamTarget } from './proxy'

export function createPiAdapter(options: { store: PiProviderStore; pi: PiEnableService }): LaneAdapter {
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
    async assertQueue(ids) {
      assertSamePiApi(piApisForQueue(await options.store.list(), ids))
    },
    async resolveUpstream(id) {
      try {
        const provider = await options.store.peek(id)
        if (provider.kind !== 'custom') return null
        const baseUrl = provider.baseUrl.trim()
        if (!baseUrl) return null
        const apiKey = readUpstreamApiKey(() => options.store.decryptApiKey(provider))
        if (!apiKey) return null
        const target: UpstreamTarget = {
          id: provider.id,
          baseUrl,
          apiKey,
        }
        if (provider.api === 'openai-completions') target.wireApi = 'chat'
        if (provider.api === 'openai-responses') target.wireApi = 'responses'
        if (provider.api === 'anthropic-messages') target.authScheme = 'x-api-key'
        return target
      } catch {
        return null
      }
    },
    async writeOfficial() {
      await options.pi.writeOfficial()
    },
    async writeDirect(id) {
      await options.pi.writeDirect(await options.store.peek(id))
    },
    async writeRouter(port, activeId) {
      await options.pi.writeRouter(await options.store.peek(activeId), port)
    },
    async markEnabled(id) {
      await options.store.markEnabled(id)
    },
  }
}
