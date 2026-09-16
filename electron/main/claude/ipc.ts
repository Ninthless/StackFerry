import { ipcMain } from 'electron'
import { CLAUDE_PRESETS } from '../../../shared/claude-presets'
import { IpcChannel } from '../../../shared/ipc'
import type { ClaudeProviderDraft } from '../../../shared/types'
import { enqueue, type AppIpcContext, type WriteChains } from '../app-ipc'
import { listClaudeModels, type ListClaudeModelsInput } from './models'
import type { ClaudeProviderStore } from './store'

export type ClaudeIpcContext = Pick<
  AppIpcContext,
  'claudeStore' | 'claude' | 'routing' | 'getNeedsRestart' | 'onClaudeChanged'
>

export function registerClaudeIpc(context: ClaudeIpcContext, writeChains: WriteChains): void {
  ipcMain.handle(IpcChannel.listClaudeProviders, () => context.claudeStore.list())
  ipcMain.handle(IpcChannel.readClaudeProviderApiKey, (_event, id: string) => {
    return context.claudeStore.readApiKey(id)
  })
  ipcMain.handle(IpcChannel.listClaudePresets, () => CLAUDE_PRESETS)
  ipcMain.handle(IpcChannel.addClaudeProvider, async (_event, draft: ClaudeProviderDraft) => {
    const provider = await context.claudeStore.add(draft)
    context.onClaudeChanged()
    return provider
  })
  ipcMain.handle(IpcChannel.updateClaudeProvider, async (_event, id: string, draft: ClaudeProviderDraft) => {
    const provider = await context.claudeStore.update(id, draft)
    context.onClaudeChanged()
    if ((await context.claudeStore.getActiveId()) === id) {
      writeChains['claude-code'] = enqueue(writeChains['claude-code'], () => enableClaudeProvider(context, id))
      await writeChains['claude-code']
    }
    return provider
  })
  ipcMain.handle(IpcChannel.deleteClaudeProvider, async (_event, id: string) => {
    await context.claudeStore.delete(id)
    writeChains['claude-code'] = enqueue(writeChains['claude-code'], () => {
      return context.routing.removeDeleted('claude-code', id)
    })
    await writeChains['claude-code']
    context.onClaudeChanged()
  })
  ipcMain.handle(IpcChannel.reorderClaudeProviders, (_event, ids: string[]) => {
    return context.claudeStore.reorder(ids)
  })
  ipcMain.handle(IpcChannel.enableClaudeProvider, async (_event, id: string) => {
    writeChains['claude-code'] = enqueue(writeChains['claude-code'], () => enableClaudeProvider(context, id))
    return writeChains['claude-code'].then(async () => {
      const status = await context.claude.status()
      return { ...status, needsRestart: context.getNeedsRestart() }
    })
  })
  ipcMain.handle(IpcChannel.getClaudeStatus, async () => {
    const status = await context.claude.status()
    return { ...status, needsRestart: context.getNeedsRestart() }
  })
  ipcMain.handle(IpcChannel.listClaudeModels, (_event, input: ListClaudeModelsInput) => {
    return listClaudeModels(context.claudeStore, input)
  })
}

export async function enableClaudeProvider(context: ClaudeIpcContext, id: string): Promise<void> {
  await context.routing.enable('claude-code', id)
  context.onClaudeChanged()
}

export async function seedOfficialClaudeProvider(store: ClaudeProviderStore): Promise<void> {
  const providers = await store.list()
  if (providers.length > 0) return
  await store.add({
    name: 'Claude Official',
    kind: 'official',
    presetId: 'official',
  })
}
