import { ipcMain } from 'electron'
import { AppError } from '../../../shared/app-error'
import { isCliToolId } from '../../../shared/cli-tools'
import { IpcChannel } from '../../../shared/ipc'
import { CliToolService } from './service'

export function registerCliToolIpc(service = new CliToolService()): void {
  let chain = Promise.resolve()

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = chain.then(work, work)
    chain = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  ipcMain.handle(IpcChannel.listCliTools, () => service.list())
  ipcMain.handle(IpcChannel.checkCliToolUpdates, () => enqueue(() => service.checkUpdates()))
  ipcMain.handle(IpcChannel.installCliTool, (_event, id: unknown) => {
    if (!isCliToolId(id)) throw new AppError('cli_not_found')
    return enqueue(() => service.install(id))
  })
  ipcMain.handle(IpcChannel.updateCliTool, (_event, id: unknown) => {
    if (!isCliToolId(id)) throw new AppError('cli_not_found')
    return enqueue(() => service.update(id))
  })
  ipcMain.handle(IpcChannel.uninstallCliTool, (_event, id: unknown) => {
    if (!isCliToolId(id)) throw new AppError('cli_not_found')
    return enqueue(() => service.uninstall(id))
  })
}
