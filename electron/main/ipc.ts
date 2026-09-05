import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { existsSync } from 'node:fs'
import { PRESETS } from '../../shared/presets'
import { IpcChannel } from '../../shared/ipc'
import { isLanguagePreference } from '../../shared/locale'
import type { MicaState } from '../../shared/mica'
import { isRoutingSettingsPatch, type RoutingSettingsPatch } from '../../shared/routing'
import { isThemePreference, type ThemePreference } from '../../shared/theme'
import type { AppStatus, LanguagePreference, ProviderDraft } from '../../shared/types'
import { codexAuthPath, codexConfigPath } from './codex/home'
import { listProviderModels, type ListModelsInput } from './providers/models'
import type { ProviderStore } from './providers/store'
import type { RoutingService } from './routing/service'

type IpcContext = {
  store: ProviderStore
  routing: RoutingService
  getCodexHome: () => string
  backupRoot: string
  getNeedsRestart: () => boolean
  setNeedsRestart: (value: boolean) => void
  onChanged: () => void
  getLocalePreference: () => Promise<LanguagePreference>
  setLocalePreference: (preference: LanguagePreference) => Promise<LanguagePreference>
  getMicaState: () => Promise<MicaState>
  setMicaPreference: (enabled: boolean) => Promise<MicaState>
  getThemePreference: () => Promise<ThemePreference>
  setThemePreference: (preference: ThemePreference) => Promise<ThemePreference>
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
    if ((await context.store.getActiveId()) === id) {
      writeChain = writeChain.catch(() => undefined).then(() => enableProvider(context, id))
      await writeChain
    }
    return provider
  })
  ipcMain.handle(IpcChannel.deleteProvider, async (_event, id: string) => {
    await context.store.delete(id)
    writeChain = writeChain.catch(() => undefined).then(() => context.routing.removeDeleted(id))
    await writeChain
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
  ipcMain.handle(IpcChannel.getLocale, () => context.getLocalePreference())
  ipcMain.handle(IpcChannel.setLocale, async (_event, preference: LanguagePreference) => {
    if (!isLanguagePreference(preference)) {
      return context.getLocalePreference()
    }
    return context.setLocalePreference(preference)
  })
  ipcMain.handle(IpcChannel.getMica, () => context.getMicaState())
  ipcMain.handle(IpcChannel.setMica, (_event, enabled: boolean) => {
    return context.setMicaPreference(enabled === true)
  })
  ipcMain.handle(IpcChannel.getTheme, () => context.getThemePreference())
  ipcMain.handle(IpcChannel.setTheme, (_event, preference: ThemePreference) => {
    if (!isThemePreference(preference)) {
      return context.getThemePreference()
    }
    return context.setThemePreference(preference)
  })
  ipcMain.handle(IpcChannel.getRouting, () => context.routing.snapshot())
  ipcMain.handle(IpcChannel.setRoutingSettings, async (_event, patch: RoutingSettingsPatch) => {
    if (!isRoutingSettingsPatch(patch)) {
      return context.routing.snapshot()
    }
    const next = await context.routing.setSettings(patch)
    context.onChanged()
    return next
  })
  ipcMain.handle(IpcChannel.setProviderQueued, async (_event, id: string, queued: boolean) => {
    if (typeof id !== 'string' || typeof queued !== 'boolean') {
      return context.routing.snapshot()
    }
    writeChain = writeChain.catch(() => undefined).then(async () => {
      await context.routing.setQueued(id, queued)
    })
    const next = await writeChain.then(() => context.routing.snapshot())
    context.onChanged()
    return next
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
  await context.routing.enable(id)
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
