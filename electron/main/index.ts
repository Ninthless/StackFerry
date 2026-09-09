import { app, BrowserWindow, dialog, Menu, nativeTheme, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import path from 'node:path'
import { resolveAppIconPath, resolveIconDir, resolveTrayIconPath } from './app-icon'
import { isPackagedUpdatePlatform } from '../../shared/app-releases'
import type { LanguagePreference } from '../../shared/locale'
import { windowUsesMicaSurface } from '../../shared/mica'
import type { ThemePreference } from '../../shared/theme'
import { AppearanceStore } from './appearance-store'
import { resolveClaudeDesktopLibraries, resolveClaudeHome } from './claude/home'
import { ClaudeEnableService } from './claude/service'
import { ClaudeProviderStore } from './claude/store'
import { resolveCodexHome } from './codex/home'
import { resolveGrokHome } from './grok/home'
import { GrokEnableService } from './grok/service'
import { GrokProviderStore } from './grok/store'
import { formatAppError } from './format-error'
import { setMainLocale, m } from './i18n'
import {
  bindWindowState,
  broadcastChanged,
  broadcastClaudeChanged,
  broadcastGrokChanged,
  enableClaudeProvider,
  enableGrokProvider,
  enableProvider,
  registerIpc,
  seedOfficialClaudeProvider,
  seedOfficialGrokProvider,
  seedOfficialProvider,
} from './ipc'
import { LocaleStore } from './locale-store'
import {
  applyWindowMica,
  currentMicaState,
  MICA_WINDOW_BACKGROUND,
  solidWindowBackground,
} from './mica'
import { ProviderStore } from './providers/store'
import { fetchAnnouncementFeed } from './releases/feed'
import { AppReleaseService } from './releases/service'
import { AnnouncementStore } from './releases/store'
import { createElectronUpdateFeed } from './releases/updater'
import { RoutingService } from './routing/service'
import { RoutingStore } from './routing/store'
import { broadcastSkillsChanged } from './skills/ipc'
import { SkillService } from './skills/service'
import { AppTray } from './tray'
import { windowChromeOptions } from './window-chrome'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '../..')

export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

const iconDir = resolveIconDir({
  appRoot: process.env.APP_ROOT,
  packaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
})
const appIconPath = resolveAppIconPath(iconDir, process.platform)
const trayIconPath = resolveTrayIconPath(iconDir, process.platform)

if (process.platform === 'win32' && os.release().startsWith('6.1')) {
  app.disableHardwareAcceleration()
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.stackferry.app')
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}


let win: BrowserWindow | null = null
let isQuitting = false
let needsRestart = false
let store: ProviderStore | null = null
let claudeStore: ClaudeProviderStore | null = null
let grokStore: GrokProviderStore | null = null
let routingStore: RoutingStore | null = null
let routing: RoutingService | null = null
let claude: ClaudeEnableService | null = null
let grok: GrokEnableService | null = null
let localeStore: LocaleStore | null = null
let appearanceStore: AppearanceStore | null = null
let tray: AppTray | null = null
let micaPreference = false
let quitRestored = false
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

async function createWindow(): Promise<void> {
  const mica = currentMicaState(micaPreference)
  win = new BrowserWindow({
    title: 'StackFerry',
    width: 960,
    height: 680,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: windowUsesMicaSurface(mica) ? MICA_WINDOW_BACKGROUND : solidWindowBackground(),
    ...(windowUsesMicaSurface(mica) ? { backgroundMaterial: 'mica' as const } : {}),
    roundedCorners: true,
    hasShadow: true,
    icon: appIconPath,
    ...windowChromeOptions(process.platform),
    webPreferences: {
      preload,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  bindWindowState(win)
  applyWindowMica(win, micaPreference)

  if (VITE_DEV_SERVER_URL) {
    await win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    await win.loadFile(indexHtml)
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  win.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    win?.hide()
  })
}

function showWindow(): void {
  if (!win) {
    void createWindow()
    return
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

async function refreshTray(): Promise<void> {
  if (!store || !claudeStore || !grokStore || !tray) return
  tray.update({
    codex: await store.list(),
    claude: await claudeStore.list(),
    grok: await grokStore.list(),
  })
}

app.whenReady().then(async () => {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
  }
  store = new ProviderStore(path.join(app.getPath('userData'), 'providers.json'))
  claudeStore = new ClaudeProviderStore(path.join(app.getPath('userData'), 'claude-providers.json'))
  grokStore = new GrokProviderStore(path.join(app.getPath('userData'), 'grok-providers.json'))
  routingStore = new RoutingStore(path.join(app.getPath('userData'), 'routing.json'))
  localeStore = new LocaleStore(path.join(app.getPath('userData'), 'locale.json'))
  appearanceStore = new AppearanceStore(path.join(app.getPath('userData'), 'appearance.json'))
  micaPreference = await appearanceStore.getMicaPreference()
  nativeTheme.themeSource = await appearanceStore.getThemePreference()
  nativeTheme.on('updated', () => {
    if (win && !win.isDestroyed()) applyWindowMica(win, micaPreference)
  })
  setMainLocale(await localeStore.resolveLocale())
  claude = new ClaudeEnableService({
    store: claudeStore,
    getClaudeHome: () => resolveClaudeHome(),
    getDesktopLibraries: () => resolveClaudeDesktopLibraries(),
    backupRoot: path.join(app.getPath('userData'), 'backups', 'claude'),
  })
  grok = new GrokEnableService({
    store: grokStore,
    getGrokHome: () => resolveGrokHome(),
    backupRoot: path.join(app.getPath('userData'), 'backups', 'grok'),
  })
  routing = new RoutingService({
    store: routingStore,
    providers: store,
    claudeStore,
    claude,
    grokStore,
    grok,
    getCodexHome: () => resolveCodexHome(),
    backupRoot: path.join(app.getPath('userData'), 'backups'),
    setNeedsRestart: (value) => {
      needsRestart = value
    },
  })
  const skills = new SkillService({
    userData: app.getPath('userData'),
    getClaudeHome: () => resolveClaudeHome(),
    getCodexHome: () => resolveCodexHome(),
    getGrokHome: () => resolveGrokHome(),
  })
  const releases = new AppReleaseService({
    currentVersion: app.getVersion(),
    packaged: app.isPackaged,
    platform: process.platform,
    store: new AnnouncementStore(path.join(app.getPath('userData'), 'announcements.json')),
    fetchReleases: () => fetchAnnouncementFeed(),
    feed: app.isPackaged && isPackagedUpdatePlatform(process.platform) ? createElectronUpdateFeed() : null,
    prepareQuit: prepareQuitForUpdate,
  })
  const ipcContext = {
    store,
    routing,
    claudeStore: claudeStore!,
    claude: claude!,
    grokStore: grokStore!,
    grok: grok!,
    skills,
    releases,
    getCodexHome: () => resolveCodexHome(),
    getGrokHome: () => resolveGrokHome(),
    backupRoot: path.join(app.getPath('userData'), 'backups'),
    getNeedsRestart: () => needsRestart,
    setNeedsRestart: (value: boolean) => {
      needsRestart = value
    },
    onChanged: () => {
      broadcastChanged()
      void refreshTray()
    },
    onClaudeChanged: () => {
      broadcastClaudeChanged()
      void refreshTray()
    },
    onGrokChanged: () => {
      broadcastGrokChanged()
      void refreshTray()
    },
    onSkillsChanged: () => {
      broadcastSkillsChanged()
    },
    getLocalePreference: () => localeStore!.getPreference(),
    setLocalePreference: async (preference: LanguagePreference) => {
      const next = await localeStore!.setPreference(preference)
      setMainLocale(await localeStore!.resolveLocale())
      void refreshTray()
      return next
    },
    getMicaState: async () => currentMicaState(micaPreference),
    setMicaPreference: async (enabled: boolean) => {
      micaPreference = await appearanceStore!.setMicaPreference(enabled)
      if (win && !win.isDestroyed()) applyWindowMica(win, micaPreference)
      return currentMicaState(micaPreference)
    },
    getThemePreference: () => appearanceStore!.getThemePreference(),
    setThemePreference: async (preference: ThemePreference) => {
      const next = await appearanceStore!.setThemePreference(preference)
      nativeTheme.themeSource = next
      if (win && !win.isDestroyed()) applyWindowMica(win, micaPreference)
      return next
    },
  }
  tray = new AppTray({
    iconPath: trayIconPath,
    onShow: () => showWindow(),
    onQuit: () => {
      void restoreThenQuit()
    },
    onEnable: async (cliId, id) => {
      try {
        if (cliId === 'claude-code') await enableClaudeProvider(ipcContext, id)
        else if (cliId === 'grok-build') await enableGrokProvider(ipcContext, id)
        else await enableProvider(ipcContext, id)
      } catch (error) {
        dialog.showErrorBox(m.tray_enable_failed(), formatAppError(error))
        void refreshTray()
      }
    },
  })
  registerIpc(ipcContext)
  await seedOfficialProvider(store)
  await seedOfficialClaudeProvider(claudeStore)
  await seedOfficialGrokProvider(grokStore)
  await routing.start()
  tray.create()
  await refreshTray()
  await createWindow()
})

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin' && isQuitting) {
    app.quit()
  }
})

app.on('before-quit', (event) => {
  if (quitRestored) return
  event.preventDefault()
  void restoreThenQuit()
})

async function prepareQuitForUpdate(): Promise<void> {
  if (quitRestored) return
  quitRestored = true
  isQuitting = true
  await routing?.restoreOnQuit()
}

async function restoreThenQuit(): Promise<void> {
  if (quitRestored) {
    app.quit()
    return
  }
  await prepareQuitForUpdate()
  app.quit()
}

app.on('second-instance', () => {
  showWindow()
})

app.on('activate', () => {
  showWindow()
})
