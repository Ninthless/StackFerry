import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel } from '../../shared/ipc'
import type { ProviderDraft, StackferryApi } from '../../shared/types'

const api: StackferryApi = {
  listProviders: () => ipcRenderer.invoke(IpcChannel.listProviders),
  listPresets: () => ipcRenderer.invoke(IpcChannel.listPresets),
  addProvider: (draft) => ipcRenderer.invoke(IpcChannel.addProvider, draft),
  updateProvider: (id, draft: ProviderDraft) => ipcRenderer.invoke(IpcChannel.updateProvider, id, draft),
  deleteProvider: (id) => ipcRenderer.invoke(IpcChannel.deleteProvider, id),
  enableProvider: (id) => ipcRenderer.invoke(IpcChannel.enableProvider, id),
  getStatus: () => ipcRenderer.invoke(IpcChannel.getStatus),
  onChanged: (listener) => {
    const wrapped = () => listener()
    ipcRenderer.on(IpcChannel.changed, wrapped)
    return () => {
      ipcRenderer.removeListener(IpcChannel.changed, wrapped)
    }
  },
}

contextBridge.exposeInMainWorld('stackferry', api)
