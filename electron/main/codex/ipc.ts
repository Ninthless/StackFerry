import { existsSync } from 'node:fs'
import { ipcMain } from 'electron'
import { PRESETS } from '../../../shared/presets'
import { IpcChannel } from '../../../shared/ipc'
import type { AppStatus, ProviderDraft } from '../../../shared/types'
import { enqueue, type AppIpcContext, type WriteChains } from '../app-ipc'
import { codexAuthPath, codexConfigPath } from './home'
import { listProviderModels, type ListModelsInput } from './models'
import type { ProviderStore } from './store'

export type CodexIpcContext = Pick<
  AppIpcContext,
  'store' | 'routing' | 'getCodexHome' | 'getNeedsRestart' | 'onChanged'
>

export function registerCodexIpc(context: CodexIpcContext, writeChains: WriteChains): void {
  ipcMain.handle(IpcChannel.listProviders, () => context.store.list())
  ipcMain.handle(IpcChannel.readProviderApiKey, (_event, id: string) => context.store.readApiKey(id))
  ipcMain.handle(IpcChannel.listPresets, () => PRESETS)
  ipcMain.handle(IpcChannel.addProvider, async (_event, draft: ProviderDraft) => {
    const provider = await context.store.add(draft)
    context.onChanged()
    return provider
  })
  ipcMain.handle(IpcChannel.updateProvider, async (_event, id: string, draft: ProviderDraft) => {
    const provider = await context.store.update(id, draft)
    context.onChanged()
    if ((await context.store.getActiveId()) === id) {
      writeChains.codex = enqueue(writeChains.codex, () => enableProvider(context, id))
      await writeChains.codex
    }
    return provider
  })
  ipcMain.handle(IpcChannel.deleteProvider, async (_event, id: string) => {
    await context.store.delete(id)
    writeChains.codex = enqueue(writeChains.codex, () => context.routing.removeDeleted('codex', id))
    await writeChains.codex
    context.onChanged()
  })
  ipcMain.handle(IpcChannel.reorderProviders, (_event, ids: string[]) => context.store.reorder(ids))
  ipcMain.handle(IpcChannel.enableProvider, async (_event, id: string) => {
    writeChains.codex = enqueue(writeChains.codex, () => enableProvider(context, id))
    return writeChains.codex.then(() => readStatus(context))
  })
  ipcMain.handle(IpcChannel.listModels, (_event, input: ListModelsInput) => {
    return listProviderModels(context.store, input)
  })
  ipcMain.handle(IpcChannel.getStatus, () => readStatus(context))
}

export async function enableProvider(context: CodexIpcContext, id: string): Promise<void> {
  await context.routing.enable('codex', id)
  context.onChanged()
}

export async function readStatus(context: CodexIpcContext): Promise<AppStatus> {
  const codexHome = context.getCodexHome()
  return {
    codexHome,
    configExists: existsSync(codexConfigPath(codexHome)),
    authExists: existsSync(codexAuthPath(codexHome)),
    lastWriteAt: await context.store.getLastWriteAt(),
    activeProviderId: await context.store.getActiveId(),
    needsRestart: context.getNeedsRestart(),
  }
}

export async function seedOfficialProvider(store: ProviderStore): Promise<void> {
  const providers = await store.list()
  if (providers.length > 0) return
  await store.add({
    name: 'Codex Official',
    kind: 'official',
    presetId: 'official',
  })
}
