import { BrowserWindow, ipcMain, systemPreferences, type IpcMainInvokeEvent } from 'electron'
import { IpcChannel } from '../../shared/ipc'
import { isLanguagePreference } from '../../shared/locale'
import { isThemePreference, type ThemePreference } from '../../shared/theme'
import type { LanguagePreference } from '../../shared/types'
import { emptyWriteChains, type AppIpcContext } from './app-ipc'
import { registerCcswIpc } from './ccsw/ipc'
import { registerClaudeIpc } from './claude/ipc'
import { registerCliToolIpc } from './cli-tools/ipc'
import { registerCodexIpc } from './codex/ipc'
import { registerGrokIpc } from './grok/ipc'
import { registerLegacyImportIpc } from './legacy/ipc'
import { registerMcpIpc } from './mcp/ipc'
import { registerReleaseIpc } from './releases/ipc'
import { registerRoutingIpc } from './routing/ipc'
import { registerSkillIpc } from './skills/ipc'
import { titleBarDoubleClickAction } from './window-chrome'

export type { AppIpcContext } from './app-ipc'
export { enableClaudeProvider, seedOfficialClaudeProvider } from './claude/ipc'
export { enableProvider, seedOfficialProvider } from './codex/ipc'
export { enableGrokProvider, seedOfficialGrokProvider } from './grok/ipc'

export function registerIpc(context: AppIpcContext): void {
  const writeChains = emptyWriteChains()

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
  ipcMain.handle(IpcChannel.windowTitleBarDoubleClick, (event) => {
    const win = senderWindow(event)
    if (!win) return
    const appleAction =
      process.platform === 'darwin'
        ? systemPreferences.getUserDefault('AppleActionOnDoubleClick', 'string')
        : ''
    const action = titleBarDoubleClickAction(process.platform, appleAction)
    if (action === 'none') return
    if (action === 'minimize') {
      win.minimize()
      return
    }
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
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
  ipcMain.handle(IpcChannel.getOnboardingCompleted, () => context.getOnboardingCompleted())
  ipcMain.handle(IpcChannel.setOnboardingCompleted, (_event, completed: boolean) => {
    return context.setOnboardingCompleted(completed === true)
  })

  registerRoutingIpc(context, writeChains)
  registerCodexIpc(context, writeChains)
  registerClaudeIpc(context, writeChains)
  registerGrokIpc(context, writeChains)
  registerSkillIpc(context)
  registerMcpIpc(context)
  registerCliToolIpc()
  registerReleaseIpc(context.releases)
  registerLegacyImportIpc(context)
  registerCcswIpc(context)
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

export function broadcastClaudeChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannel.claudeChanged)
  }
}

export function broadcastGrokChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannel.grokChanged)
  }
}
