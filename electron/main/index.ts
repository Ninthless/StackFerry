import { app, BrowserWindow, dialog, Menu, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import path from 'node:path'
import type { LanguagePreference } from '../../shared/locale'
import { resolveCodexHome } from './codex/home'
import { formatAppError } from './format-error'
import { setMainLocale, m } from './i18n'
import {
  bindWindowState,
  broadcastChanged,
  enableProvider,
  registerIpc,
  seedOfficialProvider,
} from './ipc'
import { LocaleStore } from './locale-store'
import { ProviderStore } from './providers/store'
import { AppTray } from './tray'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '../..')

export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

const publicDir = process.env.VITE_PUBLIC ?? path.join(process.env.APP_ROOT, 'public')
const WINDOW_BACKGROUND = '#0a0a0a'

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
let localeStore: LocaleStore | null = null
let tray: AppTray | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

async function createWindow(): Promise<void> {
  win = new BrowserWindow({
    title: 'StackFerry',
    width: 960,
    height: 680,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: WINDOW_BACKGROUND,
    icon: path.join(publicDir, 'icon.png'),
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    webPreferences: {
      preload,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  bindWindowState(win)

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
  if (!store || !tray) return
  tray.update(await store.list())
}

app.whenReady().then(async () => {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
  }
  store = new ProviderStore(path.join(app.getPath('userData'), 'providers.json'))
  localeStore = new LocaleStore(path.join(app.getPath('userData'), 'locale.json'))
  setMainLocale(await localeStore.resolveLocale())
  const ipcContext = {
    store,
    getCodexHome: () => resolveCodexHome(),
    backupRoot: path.join(app.getPath('userData'), 'backups'),
    getNeedsRestart: () => needsRestart,
    setNeedsRestart: (value: boolean) => {
      needsRestart = value
    },
    onChanged: () => {
      broadcastChanged()
      void refreshTray()
    },
    getLocalePreference: () => localeStore!.getPreference(),
    setLocalePreference: async (preference: LanguagePreference) => {
      const next = await localeStore!.setPreference(preference)
      setMainLocale(await localeStore!.resolveLocale())
      void refreshTray()
      return next
    },
  }
  tray = new AppTray({
    iconPath: path.join(publicDir, 'icon.png'),
    onShow: () => showWindow(),
    onQuit: () => {
      isQuitting = true
      app.quit()
    },
    onEnable: async (id) => {
      try {
        await enableProvider(ipcContext, id)
      } catch (error) {
        dialog.showErrorBox(m.tray_enable_failed(), formatAppError(error))
      }
    },
  })
  registerIpc(ipcContext)
  await seedOfficialProvider(store)
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

app.on('before-quit', () => {
  isQuitting = true
})

app.on('second-instance', () => {
  showWindow()
})

app.on('activate', () => {
  showWindow()
})
