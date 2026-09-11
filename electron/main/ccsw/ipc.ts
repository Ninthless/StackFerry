import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IpcChannel } from '../../../shared/ipc'
import { m } from '../i18n'
import type { CcswImportService } from './service'

export type CcswIpcContext = {
  ccswImport: CcswImportService
  onChanged: () => void
  onClaudeChanged: () => void
}

export function registerCcswIpc(context: CcswIpcContext): void {
  ipcMain.handle(IpcChannel.detectCcswImport, () => context.ccswImport.detect())
  ipcMain.handle(IpcChannel.chooseCcswImport, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options = {
      properties: ['openFile' as const],
      filters: [{ name: 'cc-switch.db', extensions: ['db'] }],
      title: m.ccsw_choose_title(),
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    return context.ccswImport.preview(result.filePaths[0])
  })
  ipcMain.handle(IpcChannel.importCcswProviders, async (_event, dbPath: string) => {
    const result = await context.ccswImport.importFrom(String(dbPath ?? ''))
    context.onChanged()
    context.onClaudeChanged()
    return result
  })
}
