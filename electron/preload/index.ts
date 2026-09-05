import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel } from '../../shared/ipc'
import type { ProviderDraft, StackferryApi } from '../../shared/types'

const api: StackferryApi = {
  showWindowControls: process.platform !== 'darwin',
  listProviders: () => ipcRenderer.invoke(IpcChannel.listProviders),
  listPresets: () => ipcRenderer.invoke(IpcChannel.listPresets),
  addProvider: (draft) => ipcRenderer.invoke(IpcChannel.addProvider, draft),
  updateProvider: (id, draft: ProviderDraft) => ipcRenderer.invoke(IpcChannel.updateProvider, id, draft),
  deleteProvider: (id) => ipcRenderer.invoke(IpcChannel.deleteProvider, id),
  enableProvider: (id) => ipcRenderer.invoke(IpcChannel.enableProvider, id),
  listModels: (input) => ipcRenderer.invoke(IpcChannel.listModels, input),
  getStatus: () => ipcRenderer.invoke(IpcChannel.getStatus),
  openDevTools: () => ipcRenderer.invoke(IpcChannel.openDevTools),
  windowMinimize: () => ipcRenderer.invoke(IpcChannel.windowMinimize),
  windowToggleMaximize: () => ipcRenderer.invoke(IpcChannel.windowToggleMaximize),
  windowClose: () => ipcRenderer.invoke(IpcChannel.windowClose),
  isWindowMaximized: () => ipcRenderer.invoke(IpcChannel.windowIsMaximized),
  onWindowMaximizedChange: (listener) => {
    const wrapped = (_event: unknown, maximized: boolean) => listener(maximized)
    ipcRenderer.on(IpcChannel.windowMaximizedChanged, wrapped)
    return () => {
      ipcRenderer.removeListener(IpcChannel.windowMaximizedChanged, wrapped)
    }
  },
  onChanged: (listener) => {
    const wrapped = () => listener()
    ipcRenderer.on(IpcChannel.changed, wrapped)
    return () => {
      ipcRenderer.removeListener(IpcChannel.changed, wrapped)
    }
  },
  getLocalePreference: () => ipcRenderer.invoke(IpcChannel.getLocale),
  setLocalePreference: (preference) => ipcRenderer.invoke(IpcChannel.setLocale, preference),
}

contextBridge.exposeInMainWorld('stackferry', api)
