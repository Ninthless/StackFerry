import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel } from '../../shared/ipc'
import type { AppUpdateStatus, ClaudeProviderDraft, ProviderDraft, ProviderImportOffer, StackferryApi } from '../../shared/types'

const api: StackferryApi = {
  showWindowControls: process.platform !== 'darwin',
  usesMacChrome: process.platform === 'darwin',
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
  windowTitleBarDoubleClick: () => ipcRenderer.invoke(IpcChannel.windowTitleBarDoubleClick),
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
  setProviderQueued: (cliId, id, queued) => ipcRenderer.invoke(IpcChannel.setProviderQueued, cliId, id, queued),
  setQueueOrder: (cliId, ids) => ipcRenderer.invoke(IpcChannel.setQueueOrder, cliId, ids),
  resetBreaker: (cliId, id) => ipcRenderer.invoke(IpcChannel.resetBreaker, cliId, id),
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
  listGrokProviders: () => ipcRenderer.invoke(IpcChannel.listGrokProviders),
  listGrokPresets: () => ipcRenderer.invoke(IpcChannel.listGrokPresets),
  addGrokProvider: (draft) => ipcRenderer.invoke(IpcChannel.addGrokProvider, draft),
  updateGrokProvider: (id, draft) => ipcRenderer.invoke(IpcChannel.updateGrokProvider, id, draft),
  deleteGrokProvider: (id) => ipcRenderer.invoke(IpcChannel.deleteGrokProvider, id),
  reorderGrokProviders: (ids) => ipcRenderer.invoke(IpcChannel.reorderGrokProviders, ids),
  enableGrokProvider: (id) => ipcRenderer.invoke(IpcChannel.enableGrokProvider, id),
  getGrokStatus: () => ipcRenderer.invoke(IpcChannel.getGrokStatus),
  listGrokModels: (input) => ipcRenderer.invoke(IpcChannel.listGrokModels, input),
  onGrokChanged: (listener) => {
    const wrapped = () => listener()
    ipcRenderer.on(IpcChannel.grokChanged, wrapped)
    return () => {
      ipcRenderer.removeListener(IpcChannel.grokChanged, wrapped)
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
  adoptSkill: (name) => ipcRenderer.invoke(IpcChannel.adoptSkill, name),
  chooseSkillImport: () => ipcRenderer.invoke(IpcChannel.chooseSkillImport),
  importSkills: (directories) => ipcRenderer.invoke(IpcChannel.importSkills, directories),
  listCliTools: () => ipcRenderer.invoke(IpcChannel.listCliTools),
  checkCliToolUpdates: () => ipcRenderer.invoke(IpcChannel.checkCliToolUpdates),
  installCliTool: (id) => ipcRenderer.invoke(IpcChannel.installCliTool, id),
  updateCliTool: (id) => ipcRenderer.invoke(IpcChannel.updateCliTool, id),
  uninstallCliTool: (id) => ipcRenderer.invoke(IpcChannel.uninstallCliTool, id),
  getAppUpdate: () => ipcRenderer.invoke(IpcChannel.getAppUpdate),
  checkAppUpdate: () => ipcRenderer.invoke(IpcChannel.checkAppUpdate),
  downloadAppUpdate: () => ipcRenderer.invoke(IpcChannel.downloadAppUpdate),
  installAppUpdate: () => ipcRenderer.invoke(IpcChannel.installAppUpdate),
  onAppUpdateChanged: (listener) => {
    const wrapped = (_event: unknown, status: AppUpdateStatus) => listener(status)
    ipcRenderer.on(IpcChannel.appUpdateChanged, wrapped)
    return () => {
      ipcRenderer.removeListener(IpcChannel.appUpdateChanged, wrapped)
    }
  },
  listAnnouncements: () => ipcRenderer.invoke(IpcChannel.listAnnouncements),
  refreshAnnouncements: () => ipcRenderer.invoke(IpcChannel.refreshAnnouncements),
  markAnnouncementRead: (id) => ipcRenderer.invoke(IpcChannel.markAnnouncementRead, id),
  markAllAnnouncementsRead: () => ipcRenderer.invoke(IpcChannel.markAllAnnouncementsRead),
  getProviderImportOffer: () => ipcRenderer.invoke(IpcChannel.getProviderImportOffer),
  dismissProviderImport: () => ipcRenderer.invoke(IpcChannel.dismissProviderImport),
  detectCcswImport: () => ipcRenderer.invoke(IpcChannel.detectCcswImport),
  chooseCcswImport: () => ipcRenderer.invoke(IpcChannel.chooseCcswImport),
  importCcswProviders: (dbPath) => ipcRenderer.invoke(IpcChannel.importCcswProviders, dbPath),
  onProviderImportOffer: (listener) => {
    const wrapped = (_event: unknown, offer: ProviderImportOffer) => listener(offer)
    ipcRenderer.on(IpcChannel.providerImportOffer, wrapped)
    return () => {
      ipcRenderer.removeListener(IpcChannel.providerImportOffer, wrapped)
    }
  },
  onSkillsChanged: (listener) => {
    const wrapped = () => listener()
    ipcRenderer.on(IpcChannel.skillsChanged, wrapped)
    return () => {
      ipcRenderer.removeListener(IpcChannel.skillsChanged, wrapped)
    }
  },
  listMcps: () => ipcRenderer.invoke(IpcChannel.listMcps),
  addMcp: (draft) => ipcRenderer.invoke(IpcChannel.addMcp, draft),
  updateMcp: (id, draft) => ipcRenderer.invoke(IpcChannel.updateMcp, id, draft),
  deleteMcp: (id) => ipcRenderer.invoke(IpcChannel.deleteMcp, id),
  setMcpTarget: (id, target, enabled) => ipcRenderer.invoke(IpcChannel.setMcpTarget, id, target, enabled),
  importMcps: () => ipcRenderer.invoke(IpcChannel.importMcps),
  onMcpsChanged: (listener) => {
    const wrapped = () => listener()
    ipcRenderer.on(IpcChannel.mcpsChanged, wrapped)
    return () => {
      ipcRenderer.removeListener(IpcChannel.mcpsChanged, wrapped)
    }
  },
}

contextBridge.exposeInMainWorld('stackferry', api)
