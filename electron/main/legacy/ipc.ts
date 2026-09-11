import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IpcChannel } from '../../../shared/ipc'
import { m } from '../i18n'
import type { LegacyImportService } from './service'

export type LegacyImportIpcContext = {
  legacyImport: LegacyImportService
  onChanged: () => void
  onClaudeChanged: () => void
}

export function registerLegacyImportIpc(context: LegacyImportIpcContext): void {
  ipcMain.handle(IpcChannel.detectLegacyImport, () => context.legacyImport.detect())
  ipcMain.handle(IpcChannel.chooseLegacyImport, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options = {
      properties: ['openFile' as const],
      filters: [{ name: 'stackferry.db', extensions: ['db'] }],
      title: m.legacy_choose_title(),
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    return context.legacyImport.preview(result.filePaths[0])
  })
  ipcMain.handle(IpcChannel.importLegacyProviders, async (_event, dbPath: string) => {
    const result = await context.legacyImport.importFrom(String(dbPath ?? ''))
    context.onChanged()
    context.onClaudeChanged()
    return result
  })
}
