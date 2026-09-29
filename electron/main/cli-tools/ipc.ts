import { ipcMain } from 'electron'
import { AppError } from '../../../shared/app-error'
import { isCliToolId, type CliToolId } from '../../../shared/cli-tools'
import { IpcChannel } from '../../../shared/ipc'
import { enqueue as enqueueWrite, type WriteChains } from '../app-ipc'
import { CliToolService } from './service'

export type CliToolIpcHooks = {
  writeChains: WriteChains
  afterClaudeInstall: () => Promise<void>
}

export function registerCliToolIpc(service = new CliToolService(), hooks?: CliToolIpcHooks): void {
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
    return enqueue(async () => {
      const status = await service.install(id)
      await reapplyClaudeAfterInstall(id, hooks)
      return status
    })
  })
  ipcMain.handle(IpcChannel.updateCliTool, (_event, id: unknown) => {
    if (!isCliToolId(id)) throw new AppError('cli_not_found')
    return enqueue(async () => {
      const status = await service.update(id)
      await reapplyClaudeAfterInstall(id, hooks)
      return status
    })
  })
  ipcMain.handle(IpcChannel.uninstallCliTool, (_event, id: unknown) => {
    if (!isCliToolId(id)) throw new AppError('cli_not_found')
    return enqueue(() => service.uninstall(id))
  })
}

async function reapplyClaudeAfterInstall(id: CliToolId, hooks?: CliToolIpcHooks): Promise<void> {
  if (id !== 'claude-code' || !hooks) return
  hooks.writeChains['claude-code'] = enqueueWrite(hooks.writeChains['claude-code'], hooks.afterClaudeInstall)
  await hooks.writeChains['claude-code']
}
