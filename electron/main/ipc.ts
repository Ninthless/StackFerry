import { BrowserWindow, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import { PRESETS } from '../../shared/presets'
import { IpcChannel } from '../../shared/ipc'
import type { AppStatus, ProviderDraft } from '../../shared/types'
import { codexAuthPath, codexConfigPath } from './codex/home'
import { enableOfficialLiveConfig, enableThirdPartyLiveConfig } from './codex/writer'
import type { ProviderStore } from './providers/store'

type IpcContext = {
  store: ProviderStore
  getCodexHome: () => string
  backupRoot: string
  getNeedsRestart: () => boolean
  setNeedsRestart: (value: boolean) => void
  onChanged: () => void
}

export function registerIpc(context: IpcContext): void {
  let writeChain = Promise.resolve()

  ipcMain.handle(IpcChannel.listProviders, () => context.store.list())
  ipcMain.handle(IpcChannel.listPresets, () => PRESETS)
  ipcMain.handle(IpcChannel.addProvider, async (_event, draft: ProviderDraft) => {
    const provider = await context.store.add(draft)
    context.onChanged()
    return provider
  })
  ipcMain.handle(IpcChannel.updateProvider, async (_event, id: string, draft: ProviderDraft) => {
    const provider = await context.store.update(id, draft)
    context.onChanged()
    return provider
  })
  ipcMain.handle(IpcChannel.deleteProvider, async (_event, id: string) => {
    await context.store.delete(id)
    context.onChanged()
  })
  ipcMain.handle(IpcChannel.enableProvider, async (_event, id: string) => {
    writeChain = writeChain.catch(() => undefined).then(() => enableProvider(context, id))
    return writeChain.then(() => readStatus(context))
  })
  ipcMain.handle(IpcChannel.getStatus, () => readStatus(context))
}

export function broadcastChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannel.changed)
  }
}

export async function enableProvider(context: IpcContext, id: string): Promise<void> {
  const provider = await context.store.peek(id)
  const backupRoot = context.backupRoot
  const codexHome = context.getCodexHome()
  if (provider.kind === 'official') {
    await enableOfficialLiveConfig({ codexHome, backupRoot })
  } else {
    await enableThirdPartyLiveConfig({
      codexHome,
      backupRoot,
      provider: {
        id: provider.id,
        name: provider.name,
        baseUrl: provider.baseUrl,
        model: provider.model,
        apiKey: context.store.decryptApiKey(provider),
      },
    })
  }
  await context.store.markEnabled(id)
  context.setNeedsRestart(true)
  context.onChanged()
}

export async function readStatus(context: IpcContext): Promise<AppStatus> {
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
    baseUrl: '',
    model: '',
    presetId: 'official',
  })
}
