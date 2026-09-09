import { BrowserWindow, ipcMain } from 'electron'
import { IpcChannel } from '../../../shared/ipc'
import type { AppReleaseService } from './service'

export function registerReleaseIpc(service: AppReleaseService): void {
  let chain = Promise.resolve()

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = chain.then(work, work)
    chain = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  service.onChange(() => {
    const status = service.snapshot()
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed()) continue
      window.webContents.send(IpcChannel.appUpdateChanged, status)
    }
  })

  ipcMain.handle(IpcChannel.getAppUpdate, () => service.snapshot())
  ipcMain.handle(IpcChannel.checkAppUpdate, () => enqueue(() => service.check()))
  ipcMain.handle(IpcChannel.downloadAppUpdate, () => enqueue(() => service.download()))
  ipcMain.handle(IpcChannel.installAppUpdate, () => enqueue(() => service.install()))
  ipcMain.handle(IpcChannel.listAnnouncements, () => service.listAnnouncements())
  ipcMain.handle(IpcChannel.refreshAnnouncements, () => enqueue(() => service.refreshAnnouncements()))
  ipcMain.handle(IpcChannel.markAnnouncementRead, (_event, id: unknown) => {
    if (typeof id !== 'string') return service.listAnnouncements()
    return enqueue(() => service.markAnnouncementRead(id))
  })
  ipcMain.handle(IpcChannel.markAllAnnouncementsRead, () => {
    return enqueue(() => service.markAllAnnouncementsRead())
  })
}
