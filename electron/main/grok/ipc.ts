import { existsSync } from 'node:fs'
import { ipcMain } from 'electron'
import { GROK_PRESETS } from '../../../shared/grok-presets'
import { IpcChannel } from '../../../shared/ipc'
import type { GrokProviderDraft } from '../../../shared/types'
import { enqueue, type AppIpcContext, type WriteChains } from '../app-ipc'
import { grokConfigPath } from './home'
import { listGrokModels, type ListGrokModelsInput } from './models'
import type { GrokProviderStore } from './store'

export type GrokIpcContext = Pick<
  AppIpcContext,
  'grokStore' | 'grok' | 'routing' | 'getGrokHome' | 'getNeedsRestart' | 'onGrokChanged'
>

export function registerGrokIpc(context: GrokIpcContext, writeChains: WriteChains): void {
  ipcMain.handle(IpcChannel.listGrokProviders, () => context.grokStore.list())
  ipcMain.handle(IpcChannel.readGrokProviderApiKeys, (_event, id: string) => {
    return context.grokStore.readApiKeys(id)
  })
  ipcMain.handle(IpcChannel.listGrokPresets, () => GROK_PRESETS)
  ipcMain.handle(IpcChannel.addGrokProvider, async (_event, draft: GrokProviderDraft) => {
    const provider = await context.grokStore.add(draft)
    context.onGrokChanged()
    return provider
  })
  ipcMain.handle(IpcChannel.updateGrokProvider, async (_event, id: string, draft: GrokProviderDraft) => {
    const provider = await context.grokStore.update(id, draft)
    context.onGrokChanged()
    if ((await context.grokStore.getActiveId()) === id) {
      writeChains['grok-build'] = enqueue(writeChains['grok-build'], () => enableGrokProvider(context, id))
      await writeChains['grok-build']
    }
    return provider
  })
  ipcMain.handle(IpcChannel.deleteGrokProvider, async (_event, id: string) => {
    await context.grokStore.delete(id)
    writeChains['grok-build'] = enqueue(writeChains['grok-build'], () => {
      return context.routing.removeDeleted('grok-build', id)
    })
    await writeChains['grok-build']
    context.onGrokChanged()
  })
  ipcMain.handle(IpcChannel.reorderGrokProviders, (_event, ids: string[]) => context.grokStore.reorder(ids))
  ipcMain.handle(IpcChannel.enableGrokProvider, async (_event, id: string) => {
    writeChains['grok-build'] = enqueue(writeChains['grok-build'], () => enableGrokProvider(context, id))
    return writeChains['grok-build'].then(() => readGrokStatus(context))
  })
  ipcMain.handle(IpcChannel.getGrokStatus, () => readGrokStatus(context))
  ipcMain.handle(IpcChannel.listGrokModels, (_event, input: ListGrokModelsInput) => {
    return listGrokModels(context.grokStore, input)
  })
}

export async function enableGrokProvider(context: GrokIpcContext, id: string): Promise<void> {
  await context.routing.enable('grok-build', id)
  context.onGrokChanged()
}

export async function readGrokStatus(context: GrokIpcContext) {
  const status = await context.grok.status()
  return {
    ...status,
    grokHome: context.getGrokHome(),
    configExists: existsSync(grokConfigPath(context.getGrokHome())),
    needsRestart: context.getNeedsRestart(),
  }
}

export async function seedOfficialGrokProvider(store: GrokProviderStore): Promise<void> {
  const providers = await store.list()
  if (providers.length > 0) return
  await store.add({
    name: 'Grok Official',
    kind: 'official',
    presetId: 'official',
  })
}
