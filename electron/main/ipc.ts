import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { existsSync } from 'node:fs'
import { PRESETS } from '../../shared/presets'
import { IpcChannel } from '../../shared/ipc'
import type { AppStatus, ProviderDraft } from '../../shared/types'
import { codexAuthPath, codexConfigPath } from './codex/home'
import { enableOfficialLiveConfig, enableThirdPartyLiveConfig } from './codex/writer'
import { listProviderModels, type ListModelsInput } from './providers/models'
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
  ipcMain.handle(IpcChannel.listModels, (_event, input: ListModelsInput) => {
    return listProviderModels(context.store, input)
  })
  ipcMain.handle(IpcChannel.getStatus, () => readStatus(context))
  ipcMain.handle(IpcChannel.openDevTools, (event) => {
    const contents = event.sender
    if (contents.isDestroyed()) return
    contents.openDevTools({ mode: 'detach' })
  })
  ipcMain.handle(IpcChannel.windowMinimize, (event) => {
    senderWindow(event)?.minimize()
  })
  ipcMain.handle(IpcChannel.windowToggleMaximize, (event) => {
    const win = senderWindow(event)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.handle(IpcChannel.windowClose, (event) => {
    senderWindow(event)?.close()
  })
  ipcMain.handle(IpcChannel.windowIsMaximized, (event) => {
    return senderWindow(event)?.isMaximized() ?? false
  })
}

export function bindWindowState(win: BrowserWindow): void {
  const sendMaximized = () => {
    if (win.isDestroyed()) return
    win.webContents.send(IpcChannel.windowMaximizedChanged, win.isMaximized())
  }
  win.on('maximize', sendMaximized)
  win.on('unmaximize', sendMaximized)
}

function senderWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || win.isDestroyed()) return null
  return win
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
        tomlText: provider.tomlText,
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
    presetId: 'official',
  })
}
