import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel } from '../../shared/ipc'
import type { ClaudeProviderDraft, ProviderDraft, StackferryApi } from '../../shared/types'

const api: StackferryApi = {
  showWindowControls: process.platform !== 'darwin',
  listProviders: () => ipcRenderer.invoke(IpcChannel.listProviders),
  listPresets: () => ipcRenderer.invoke(IpcChannel.listPresets),
  addProvider: (draft) => ipcRenderer.invoke(IpcChannel.addProvider, draft),
  updateProvider: (id, draft: ProviderDraft) => ipcRenderer.invoke(IpcChannel.updateProvider, id, draft),
  deleteProvider: (id) => ipcRenderer.invoke(IpcChannel.deleteProvider, id),
  reorderProviders: (ids) => ipcRenderer.invoke(IpcChannel.reorderProviders, ids),
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
  getMicaState: () => ipcRenderer.invoke(IpcChannel.getMica),
  setMicaPreference: (enabled) => ipcRenderer.invoke(IpcChannel.setMica, enabled),
  getThemePreference: () => ipcRenderer.invoke(IpcChannel.getTheme),
  setThemePreference: (preference) => ipcRenderer.invoke(IpcChannel.setTheme, preference),
  getRouting: () => ipcRenderer.invoke(IpcChannel.getRouting),
  setRoutingSettings: (patch) => ipcRenderer.invoke(IpcChannel.setRoutingSettings, patch),
  setProviderQueued: (id, queued) => ipcRenderer.invoke(IpcChannel.setProviderQueued, id, queued),
  setQueueOrder: (ids) => ipcRenderer.invoke(IpcChannel.setQueueOrder, ids),
  resetBreaker: (id) => ipcRenderer.invoke(IpcChannel.resetBreaker, id),
  listClaudeProviders: () => ipcRenderer.invoke(IpcChannel.listClaudeProviders),
  listClaudePresets: () => ipcRenderer.invoke(IpcChannel.listClaudePresets),
  addClaudeProvider: (draft) => ipcRenderer.invoke(IpcChannel.addClaudeProvider, draft),
  updateClaudeProvider: (id, draft: ClaudeProviderDraft) => {
    return ipcRenderer.invoke(IpcChannel.updateClaudeProvider, id, draft)
  },
  deleteClaudeProvider: (id) => ipcRenderer.invoke(IpcChannel.deleteClaudeProvider, id),
  reorderClaudeProviders: (ids) => ipcRenderer.invoke(IpcChannel.reorderClaudeProviders, ids),
  enableClaudeProvider: (id) => ipcRenderer.invoke(IpcChannel.enableClaudeProvider, id),
  getClaudeStatus: () => ipcRenderer.invoke(IpcChannel.getClaudeStatus),
  listClaudeModels: (input) => ipcRenderer.invoke(IpcChannel.listClaudeModels, input),
  onClaudeChanged: (listener) => {
    const wrapped = () => listener()
    ipcRenderer.on(IpcChannel.claudeChanged, wrapped)
    return () => {
      ipcRenderer.removeListener(IpcChannel.claudeChanged, wrapped)
    }
  },
  listSkills: () => ipcRenderer.invoke(IpcChannel.listSkills),
  refreshSkills: () => ipcRenderer.invoke(IpcChannel.refreshSkills),
  installSkill: (name) => ipcRenderer.invoke(IpcChannel.installSkill, name),
  uninstallSkill: (name) => ipcRenderer.invoke(IpcChannel.uninstallSkill, name),
  setSkillTarget: (name, target, enabled) => {
    return ipcRenderer.invoke(IpcChannel.setSkillTarget, name, target, enabled)
  },
  checkSkillUpdates: () => ipcRenderer.invoke(IpcChannel.checkSkillUpdates),
  updateSkill: (name) => ipcRenderer.invoke(IpcChannel.updateSkill, name),
  updateAllSkills: () => ipcRenderer.invoke(IpcChannel.updateAllSkills),
  listSkillRepos: () => ipcRenderer.invoke(IpcChannel.listSkillRepos),
  addSkillRepo: (draft) => ipcRenderer.invoke(IpcChannel.addSkillRepo, draft),
  removeSkillRepo: (id) => ipcRenderer.invoke(IpcChannel.removeSkillRepo, id),
  createSkill: (draft) => ipcRenderer.invoke(IpcChannel.createSkill, draft),
  readSkill: (name) => ipcRenderer.invoke(IpcChannel.readSkill, name),
  writeSkill: (name, draft) => ipcRenderer.invoke(IpcChannel.writeSkill, name, draft),
  adoptSkill: (name) => ipcRenderer.invoke(IpcChannel.adoptSkill, name),
  onSkillsChanged: (listener) => {
    const wrapped = () => listener()
    ipcRenderer.on(IpcChannel.skillsChanged, wrapped)
    return () => {
      ipcRenderer.removeListener(IpcChannel.skillsChanged, wrapped)
    }
  },
}

contextBridge.exposeInMainWorld('stackferry', api)
