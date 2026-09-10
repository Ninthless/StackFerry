import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { IpcChannel } from '../../shared/ipc'
import {
  findProviderImportUrl,
  parseProviderImportUrl,
  PROVIDER_IMPORT_SCHEME,
  type ProviderImportOffer,
} from '../../shared/provider-import'
import { formatAppError } from './format-error'
import { m } from './i18n'

let pending: ProviderImportOffer | null = null
let showWindow: (() => void) | null = null

export function registerProviderImportProtocol(): void {
  if (process.defaultApp) {
    const script = process.argv[1]
    if (script) {
      app.setAsDefaultProtocolClient(PROVIDER_IMPORT_SCHEME, process.execPath, [path.resolve(script)])
      return
    }
  }
  app.setAsDefaultProtocolClient(PROVIDER_IMPORT_SCHEME)
}

export function bindProviderImportWindow(show: () => void): void {
  showWindow = show
}

export function registerProviderImportIpc(): void {
  ipcMain.handle(IpcChannel.getProviderImportOffer, () => pending)
  ipcMain.handle(IpcChannel.dismissProviderImport, () => {
    pending = null
  })
}

export function handleProviderImportArgv(argv: readonly string[]): void {
  const url = findProviderImportUrl(argv)
  if (url) handleProviderImportUrl(url)
}

export function handleProviderImportUrl(raw: string): void {
  try {
    pending = parseProviderImportUrl(raw)
    showWindow?.()
    flushProviderImportOffer()
  } catch (error) {
    pending = null
    showWindow?.()
    dialog.showErrorBox(m.import_provider_failed(), formatAppError(error))
  }
}

export function flushProviderImportOffer(): void {
  if (!pending) return
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    window.webContents.send(IpcChannel.providerImportOffer, pending)
  }
}
