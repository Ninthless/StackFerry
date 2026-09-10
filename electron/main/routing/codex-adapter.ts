import { isPlainObject, overlayNeedsRouter, parseProviderOverlay } from '../../../shared/provider-overlay'
import {
  enableOfficialLiveConfig,
  enableRouterLiveConfig,
  enableThirdPartyLiveConfig,
} from '../codex/writer'
import type { ProviderStore } from '../providers/store'
import type { LaneAdapter } from './lane'
import type { UpstreamTarget } from './proxy'

export function createCodexAdapter(options: {
  providers: ProviderStore
  getCodexHome: () => string
  backupRoot: string
}): LaneAdapter {
  const homes = () => ({
    codexHome: options.getCodexHome(),
    backupRoot: options.backupRoot,
  })

  return {
    async listCustomIds() {
      const providers = await options.providers.list()
      return providers.filter((item) => item.kind === 'custom').map((item) => item.id)
    },
    async peekActive() {
      const id = await options.providers.getActiveId()
      if (!id) return null
      try {
        const provider = await options.providers.peek(id)
        return { id: provider.id, kind: provider.kind }
      } catch {
        return null
      }
    },
    async peekKind(id) {
      try {
        return (await options.providers.peek(id)).kind
      } catch {
        return null
      }
    },
    async overlayNeedsRouter(id) {
      try {
        const provider = await options.providers.peek(id)
        return provider.kind === 'custom' && overlayNeedsRouter(provider.tomlText)
      } catch {
        return false
      }
    },
    async resolveUpstream(id) {
      try {
        const provider = await options.providers.peek(id)
        if (provider.kind !== 'custom') return null
        const overlay = parseProviderOverlay(provider.tomlText)
        const baseUrl = typeof overlay.table.base_url === 'string' ? overlay.table.base_url.trim() : ''
        if (!baseUrl) return null
        let apiKey = ''
        try {
          apiKey = options.providers.decryptApiKey(provider)
        } catch {
          apiKey = ''
        }
        return {
          id: provider.id,
          baseUrl,
          apiKey,
          wireApi: overlay.table.wire_api === 'chat' ? 'chat' : 'responses',
          queryParams: stringRecord(overlay.table.query_params),
          httpHeaders: stringRecord(overlay.table.http_headers),
        } satisfies UpstreamTarget
      } catch {
        return null
      }
    },
    async writeOfficial() {
      await enableOfficialLiveConfig(homes())
    },
    async writeDirect(id) {
      const provider = await options.providers.peek(id)
      await enableThirdPartyLiveConfig({
        ...homes(),
        provider: {
          id: provider.id,
          name: provider.name,
          tomlText: provider.tomlText,
          apiKey: options.providers.decryptApiKey(provider),
          models: provider.models,
        },
      })
    },
    async writeRouter(port, activeId) {
      const provider = await options.providers.peek(activeId)
      await enableRouterLiveConfig({
        ...homes(),
        port,
        provider: { tomlText: provider.tomlText, models: provider.models },
      })
    },
    async markEnabled(id) {
      await options.providers.markEnabled(id)
    },
  }
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!isPlainObject(value)) return undefined
  const record: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' || typeof item === 'number') {
      record[key] = String(item)
    }
  }
  return Object.keys(record).length > 0 ? record : undefined
}
