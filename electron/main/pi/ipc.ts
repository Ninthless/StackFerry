import { existsSync } from 'node:fs'
import { ipcMain } from 'electron'
import { PI_PRESETS } from '../../../shared/pi-presets'
import { IpcChannel } from '../../../shared/ipc'
import { isPiApi, type PiProviderDraft } from '../../../shared/types'
import { enqueue, type AppIpcContext, type WriteChains } from '../app-ipc'
import { assertSamePiApi, piApisForQueue } from './config'
import { piModelsPath } from './home'
import { listPiModels, type ListPiModelsInput } from './models'
import type { PiProviderStore } from './store'

export type PiIpcContext = Pick<
  AppIpcContext,
  'piStore' | 'pi' | 'routing' | 'getPiHome' | 'getNeedsRestart' | 'onPiChanged'
>

export function registerPiIpc(context: PiIpcContext, writeChains: WriteChains): void {
  ipcMain.handle(IpcChannel.listPiProviders, () => context.piStore.list())
  ipcMain.handle(IpcChannel.readPiProviderApiKey, (_event, id: string) => context.piStore.readApiKey(id))
  ipcMain.handle(IpcChannel.listPiPresets, () => PI_PRESETS)
  ipcMain.handle(IpcChannel.addPiProvider, async (_event, draft: PiProviderDraft) => {
    const provider = await context.piStore.add(draft)
    context.onPiChanged()
    return provider
  })
  ipcMain.handle(IpcChannel.updatePiProvider, async (_event, id: string, draft: PiProviderDraft) => {
    await assertPiQueueAfterUpdate(context, id, draft)
    const provider = await context.piStore.update(id, draft)
    context.onPiChanged()
    if ((await context.piStore.getActiveId()) === id) {
      writeChains.pi = enqueue(writeChains.pi, () => enablePiProvider(context, id))
      await writeChains.pi
    }
    return provider
  })
  ipcMain.handle(IpcChannel.deletePiProvider, async (_event, id: string) => {
    await context.piStore.delete(id)
    writeChains.pi = enqueue(writeChains.pi, () => context.routing.removeDeleted('pi', id))
    await writeChains.pi
    context.onPiChanged()
  })
  ipcMain.handle(IpcChannel.reorderPiProviders, (_event, ids: string[]) => context.piStore.reorder(ids))
  ipcMain.handle(IpcChannel.enablePiProvider, async (_event, id: string) => {
    writeChains.pi = enqueue(writeChains.pi, () => enablePiProvider(context, id))
    return writeChains.pi.then(() => readPiStatus(context))
  })
  ipcMain.handle(IpcChannel.getPiStatus, () => readPiStatus(context))
  ipcMain.handle(IpcChannel.listPiModels, (_event, input: ListPiModelsInput) => {
    return listPiModels(context.piStore, input)
  })
}

async function assertPiQueueAfterUpdate(
  context: PiIpcContext,
  id: string,
  draft: PiProviderDraft,
): Promise<void> {
  if (!isPiApi(draft.api)) return
  const [providers, snapshot] = await Promise.all([context.piStore.list(), context.routing.snapshot()])
  const queue = snapshot.lanes.pi.queue
  if (!queue.includes(id)) return
  const current = providers.find((provider) => provider.id === id)
  if (current?.kind !== 'custom') return
  assertSamePiApi(piApisForQueue(providers, queue, { id, api: draft.api }))
}

export async function enablePiProvider(context: PiIpcContext, id: string): Promise<void> {
  await context.routing.enable('pi', id)
  context.onPiChanged()
}

export async function readPiStatus(context: PiIpcContext) {
  const status = await context.pi.status()
  return {
    ...status,
    piHome: context.getPiHome(),
    configExists: existsSync(piModelsPath(context.getPiHome())),
    needsRestart: context.getNeedsRestart(),
  }
}

export async function seedOfficialPiProvider(store: PiProviderStore): Promise<void> {
  const providers = await store.list()
  if (providers.length > 0) return
  await store.add({ name: 'Pi Official', kind: 'official' })
}
