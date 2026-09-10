import { BrowserWindow, ipcMain } from 'electron'
import { IpcChannel } from '../../../shared/ipc'
import { isMcpTarget, type McpDraft, type McpTarget } from '../../../shared/mcp'
import type { McpService } from './service'

export type McpIpcContext = {
  mcp: McpService
  onMcpsChanged: () => void
}

export function registerMcpIpc(context: McpIpcContext): void {
  let chain = Promise.resolve()

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = chain.then(work, work)
    chain = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  ipcMain.handle(IpcChannel.listMcps, () => context.mcp.list())
  ipcMain.handle(IpcChannel.addMcp, (_event, draft: McpDraft) => {
    return enqueue(async () => {
      const items = await context.mcp.add(draft)
      context.onMcpsChanged()
      return items
    })
  })
  ipcMain.handle(IpcChannel.updateMcp, (_event, id: string, draft: McpDraft) => {
    return enqueue(async () => {
      const items = await context.mcp.update(id, draft)
      context.onMcpsChanged()
      return items
    })
  })
  ipcMain.handle(IpcChannel.deleteMcp, (_event, id: string) => {
    return enqueue(async () => {
      const items = await context.mcp.delete(id)
      context.onMcpsChanged()
      return items
    })
  })
  ipcMain.handle(IpcChannel.setMcpTarget, (_event, id: string, target: McpTarget, enabled: boolean) => {
    if (!isMcpTarget(target) || typeof enabled !== 'boolean') {
      return context.mcp.list()
    }
    return enqueue(async () => {
      const items = await context.mcp.setTarget(id, target, enabled)
      context.onMcpsChanged()
      return items
    })
  })
  ipcMain.handle(IpcChannel.importMcps, () => {
    return enqueue(async () => {
      const items = await context.mcp.importFromLive()
      context.onMcpsChanged()
      return items
    })
  })
}

export function broadcastMcpsChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannel.mcpsChanged)
  }
}
