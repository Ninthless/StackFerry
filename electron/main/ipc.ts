import { BrowserWindow, ipcMain, systemPreferences, type IpcMainInvokeEvent } from 'electron'
import { existsSync } from 'node:fs'
import { PRESETS } from '../../shared/presets'
import { CLAUDE_PRESETS } from '../../shared/claude-presets'
import { CLI_TOOL_IDS, type CliToolId } from '../../shared/cli-tools'
import { GROK_PRESETS } from '../../shared/grok-presets'
import { IpcChannel } from '../../shared/ipc'
import { isLanguagePreference } from '../../shared/locale'
import type { MicaState } from '../../shared/mica'
import { isRoutingSettingsPatch, isRoutingLaneId, type RoutingSettingsPatch } from '../../shared/routing'
import { isThemePreference, type ThemePreference } from '../../shared/theme'
import type {
  AppStatus,
  ClaudeProviderDraft,
  GrokProviderDraft,
  LanguagePreference,
  ProviderDraft,
} from '../../shared/types'
import { listClaudeModels, type ListClaudeModelsInput } from './claude/models'
import type { ClaudeEnableService } from './claude/service'
import type { ClaudeProviderStore } from './claude/store'
import { grokConfigPath } from './grok/home'
import { listGrokModels, type ListGrokModelsInput } from './grok/models'
import type { GrokEnableService } from './grok/service'
import type { GrokProviderStore } from './grok/store'
import { codexAuthPath, codexConfigPath } from './codex/home'
import { listProviderModels, type ListModelsInput } from './codex/models'
import type { ProviderStore } from './codex/store'
import type { RoutingService } from './routing/service'
import { registerCliToolIpc } from './cli-tools/ipc'
import { registerMcpIpc } from './mcp/ipc'
import type { McpService } from './mcp/service'
import { registerReleaseIpc } from './releases/ipc'
import type { AppReleaseService } from './releases/service'
import { registerSkillIpc } from './skills/ipc'
import type { SkillService } from './skills/service'
import { titleBarDoubleClickAction } from './window-chrome'

type IpcContext = {
  store: ProviderStore
  routing: RoutingService
  claudeStore: ClaudeProviderStore
  claude: ClaudeEnableService
  grokStore: GrokProviderStore
  grok: GrokEnableService
  getCodexHome: () => string
  getGrokHome: () => string
  backupRoot: string
  getNeedsRestart: () => boolean
  setNeedsRestart: (value: boolean) => void
  onChanged: () => void
  onClaudeChanged: () => void
  onGrokChanged: () => void
  skills: SkillService
  mcp: McpService
  releases: AppReleaseService
  onSkillsChanged: () => void
  onMcpsChanged: () => void
  getLocalePreference: () => Promise<LanguagePreference>
  setLocalePreference: (preference: LanguagePreference) => Promise<LanguagePreference>
  getMicaState: () => Promise<MicaState>
  setMicaPreference: (enabled: boolean) => Promise<MicaState>
  getThemePreference: () => Promise<ThemePreference>
  setThemePreference: (preference: ThemePreference) => Promise<ThemePreference>
}

export function registerIpc(context: IpcContext): void {
  const writeChains = emptyWriteChains()

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
      writeChains.codex = enqueue(writeChains.codex, () => enableProvider(context, id))
      await writeChains.codex
    }
    return provider
  })
  ipcMain.handle(IpcChannel.deleteProvider, async (_event, id: string) => {
    await context.store.delete(id)
    writeChains.codex = enqueue(writeChains.codex, () => context.routing.removeDeleted('codex', id))
    await writeChains.codex
    context.onChanged()
  })
  ipcMain.handle(IpcChannel.reorderProviders, (_event, ids: string[]) => context.store.reorder(ids))
  ipcMain.handle(IpcChannel.enableProvider, async (_event, id: string) => {
    writeChains.codex = enqueue(writeChains.codex, () => enableProvider(context, id))
    return writeChains.codex.then(() => readStatus(context))
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
  ipcMain.handle(IpcChannel.listClaudeProviders, () => context.claudeStore.list())
  ipcMain.handle(IpcChannel.listClaudePresets, () => CLAUDE_PRESETS)
  ipcMain.handle(IpcChannel.addClaudeProvider, async (_event, draft: ClaudeProviderDraft) => {
    const provider = await context.claudeStore.add(draft)
    context.onClaudeChanged()
    return provider
  })
  ipcMain.handle(IpcChannel.updateClaudeProvider, async (_event, id: string, draft: ClaudeProviderDraft) => {
    const provider = await context.claudeStore.update(id, draft)
    context.onClaudeChanged()
    if ((await context.claudeStore.getActiveId()) === id) {
      writeChains['claude-code'] = enqueue(writeChains['claude-code'], () => enableClaudeProvider(context, id))
      await writeChains['claude-code']
    }
    return provider
  })
  ipcMain.handle(IpcChannel.deleteClaudeProvider, async (_event, id: string) => {
    await context.claudeStore.delete(id)
    writeChains['claude-code'] = enqueue(writeChains['claude-code'], () => {
      return context.routing.removeDeleted('claude-code', id)
    })
    await writeChains['claude-code']
    context.onClaudeChanged()
  })
  ipcMain.handle(IpcChannel.reorderClaudeProviders, (_event, ids: string[]) => {
    return context.claudeStore.reorder(ids)
  })
  ipcMain.handle(IpcChannel.enableClaudeProvider, async (_event, id: string) => {
    writeChains['claude-code'] = enqueue(writeChains['claude-code'], () => enableClaudeProvider(context, id))
    return writeChains['claude-code'].then(async () => {
      const status = await context.claude.status()
      return { ...status, needsRestart: context.getNeedsRestart() }
    })
  })
  ipcMain.handle(IpcChannel.getClaudeStatus, async () => {
    const status = await context.claude.status()
    return { ...status, needsRestart: context.getNeedsRestart() }
  })
  ipcMain.handle(IpcChannel.listClaudeModels, (_event, input: ListClaudeModelsInput) => {
    return listClaudeModels(context.claudeStore, input)
  })
  ipcMain.handle(IpcChannel.listGrokProviders, () => context.grokStore.list())
  ipcMain.handle(IpcChannel.listGrokPresets, () => GROK_PRESETS)
  ipcMain.handle(IpcChannel.addGrokProvider, async (_event, draft: GrokProviderDraft) => {
    const provider = await context.grokStore.add(draft)
    context.onGrokChanged()
    return provider
  })
  ipcMain.handle(IpcChannel.updateGrokProvider, async (_event, id: string, draft: GrokProviderDraft) => {
    const provider = await context.grokStore.update(id, draft)
    context.onGrokChanged()
    if ((await context.grokStore.getActiveId()) === id) {
      writeChains['grok-build'] = enqueue(writeChains['grok-build'], () => enableGrokProvider(context, id))
      await writeChains['grok-build']
    }
    return provider
  })
  ipcMain.handle(IpcChannel.deleteGrokProvider, async (_event, id: string) => {
    await context.grokStore.delete(id)
    writeChains['grok-build'] = enqueue(writeChains['grok-build'], () => {
      return context.routing.removeDeleted('grok-build', id)
    })
    await writeChains['grok-build']
    context.onGrokChanged()
  })
  ipcMain.handle(IpcChannel.reorderGrokProviders, (_event, ids: string[]) => context.grokStore.reorder(ids))
  ipcMain.handle(IpcChannel.enableGrokProvider, async (_event, id: string) => {
    writeChains['grok-build'] = enqueue(writeChains['grok-build'], () => enableGrokProvider(context, id))
    return writeChains['grok-build'].then(() => readGrokStatus(context))
  })
  ipcMain.handle(IpcChannel.getGrokStatus, () => readGrokStatus(context))
  ipcMain.handle(IpcChannel.listGrokModels, (_event, input: ListGrokModelsInput) => {
    return listGrokModels(context.grokStore, input)
  })
  registerSkillIpc(context)
  registerMcpIpc(context)
  registerCliToolIpc()
  registerReleaseIpc(context.releases)
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

function emptyWriteChains(): Record<CliToolId, Promise<void>> {
  return Object.fromEntries(CLI_TOOL_IDS.map((id) => [id, Promise.resolve()])) as Record<CliToolId, Promise<void>>
}

function enqueue(chain: Promise<void>, work: () => Promise<void>): Promise<void> {
  return chain.catch(() => undefined).then(work)
}

function notifyLane(context: IpcContext, cliId: CliToolId): void {
  if (cliId === 'codex') context.onChanged()
  else if (cliId === 'claude-code') context.onClaudeChanged()
  else context.onGrokChanged()
}

export async function enableProvider(context: IpcContext, id: string): Promise<void> {
  await context.routing.enable('codex', id)
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

export async function enableClaudeProvider(context: IpcContext, id: string): Promise<void> {
  await context.routing.enable('claude-code', id)
  context.onClaudeChanged()
}

export async function seedOfficialClaudeProvider(store: ClaudeProviderStore): Promise<void> {
  const providers = await store.list()
  if (providers.length > 0) return
  await store.add({
    name: 'Claude Official',
    kind: 'official',
    presetId: 'official',
  })
}

export async function enableGrokProvider(context: IpcContext, id: string): Promise<void> {
  await context.routing.enable('grok-build', id)
  context.onGrokChanged()
}

export async function readGrokStatus(context: IpcContext) {
  const status = await context.grok.status()
  return {
    ...status,
    grokHome: context.getGrokHome(),
    configExists: existsSync(grokConfigPath(context.getGrokHome())),
    needsRestart: context.getNeedsRestart(),
  }
}

export async function seedOfficialGrokProvider(store: GrokProviderStore): Promise<void> {
  const providers = await store.list()
  if (providers.length > 0) return
  await store.add({
    name: 'Grok Official',
    kind: 'official',
    presetId: 'official',
  })
}
