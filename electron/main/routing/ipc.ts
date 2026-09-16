import { ipcMain } from 'electron'
import { type CliToolId } from '../../../shared/cli-tools'
import { IpcChannel } from '../../../shared/ipc'
import { isRoutingLaneId, isRoutingSettingsPatch, type RoutingSettingsPatch } from '../../../shared/routing'
import { enqueue, type AppIpcContext, type WriteChains } from '../app-ipc'

export type RoutingIpcContext = Pick<
  AppIpcContext,
  'routing' | 'onChanged' | 'onClaudeChanged' | 'onGrokChanged'
>

export function registerRoutingIpc(context: RoutingIpcContext, writeChains: WriteChains): void {
  ipcMain.handle(IpcChannel.getRouting, () => context.routing.snapshot())
  ipcMain.handle(IpcChannel.setRoutingSettings, async (_event, patch: RoutingSettingsPatch) => {
    if (!isRoutingSettingsPatch(patch)) {
      return context.routing.snapshot()
    }
    const next = await context.routing.setSettings(patch)
    context.onChanged()
    context.onClaudeChanged()
    context.onGrokChanged()
    return next
  })
  ipcMain.handle(IpcChannel.setProviderQueued, async (_event, cliId: unknown, id: string, queued: boolean) => {
    if (!isRoutingLaneId(cliId) || typeof id !== 'string' || typeof queued !== 'boolean') {
      return context.routing.snapshot()
    }
    writeChains[cliId] = enqueue(writeChains[cliId], async () => {
      await context.routing.setQueued(cliId, id, queued)
    })
    const next = await writeChains[cliId].then(() => context.routing.snapshot())
    notifyLane(context, cliId)
    return next
  })
  ipcMain.handle(IpcChannel.setQueueOrder, async (_event, cliId: unknown, ids: string[]) => {
    if (!isRoutingLaneId(cliId) || !Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
      return context.routing.snapshot()
    }
    const next = await context.routing.setQueueOrder(cliId, ids)
    notifyLane(context, cliId)
    return next
  })
  ipcMain.handle(IpcChannel.resetBreaker, async (_event, cliId: unknown, id: string) => {
    if (!isRoutingLaneId(cliId) || typeof id !== 'string') {
      return context.routing.snapshot()
    }
    const next = await context.routing.resetBreaker(cliId, id)
    notifyLane(context, cliId)
    return next
  })
}

function notifyLane(context: RoutingIpcContext, cliId: CliToolId): void {
  if (cliId === 'codex') context.onChanged()
  else if (cliId === 'claude-code') context.onClaudeChanged()
  else context.onGrokChanged()
}
