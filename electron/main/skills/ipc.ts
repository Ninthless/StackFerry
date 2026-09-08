import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IpcChannel } from '../../../shared/ipc'
import { isSkillTarget, type SkillRepoDraft, type SkillTarget } from '../../../shared/skills'
import { m } from '../i18n'
import type { SkillService } from './service'

export type SkillIpcContext = {
  skills: SkillService
  onSkillsChanged: () => void
}

export function registerSkillIpc(context: SkillIpcContext): void {
  let chain = Promise.resolve()

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = chain.then(work, work)
    chain = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  ipcMain.handle(IpcChannel.listSkills, () => context.skills.list())
  ipcMain.handle(IpcChannel.refreshSkills, () => {
    return enqueue(async () => {
      const items = await context.skills.refreshCatalog()
      context.onSkillsChanged()
      return items
    })
  })
  ipcMain.handle(IpcChannel.installSkill, (_event, name: string) => {
    return enqueue(async () => {
      const items = await context.skills.install(name)
      context.onSkillsChanged()
      return items
    })
  })
  ipcMain.handle(IpcChannel.uninstallSkill, (_event, name: string) => {
    return enqueue(async () => {
      const items = await context.skills.uninstall(name)
      context.onSkillsChanged()
      return items
    })
  })
  ipcMain.handle(IpcChannel.setSkillTarget, (_event, name: string, target: SkillTarget, enabled: boolean) => {
    if (!isSkillTarget(target) || typeof enabled !== 'boolean') {
      return context.skills.list()
    }
    return enqueue(async () => {
      const items = await context.skills.setTarget(name, target, enabled)
      context.onSkillsChanged()
      return items
    })
  })
  ipcMain.handle(IpcChannel.checkSkillUpdates, () => {
    return enqueue(async () => {
      const items = await context.skills.refreshCatalog()
      context.onSkillsChanged()
      return items
    })
  })
  ipcMain.handle(IpcChannel.updateSkill, (_event, name: string) => {
    return enqueue(async () => {
      const items = await context.skills.update(name)
      context.onSkillsChanged()
      return items
    })
  })
  ipcMain.handle(IpcChannel.updateAllSkills, () => {
    return enqueue(async () => {
      const items = await context.skills.updateAll()
      context.onSkillsChanged()
      return items
    })
  })
  ipcMain.handle(IpcChannel.listSkillRepos, () => context.skills.listRepos())
  ipcMain.handle(IpcChannel.addSkillRepo, (_event, draft: SkillRepoDraft) => {
    return enqueue(async () => {
      const repos = await context.skills.addRepo(draft)
      context.onSkillsChanged()
      return repos
    })
  })
  ipcMain.handle(IpcChannel.removeSkillRepo, (_event, id: string) => {
    return enqueue(async () => {
      const repos = await context.skills.removeRepo(id)
      context.onSkillsChanged()
      return repos
    })
  })
  ipcMain.handle(IpcChannel.chooseSkillImport, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options = {
      properties: ['openDirectory' as const],
      title: m.skills_import(),
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    return context.skills.previewImport(result.filePaths[0])
  })
  ipcMain.handle(IpcChannel.importSkills, (_event, directories: string[]) => {
    return enqueue(async () => {
      const items = await context.skills.importDirectories(directories)
      context.onSkillsChanged()
      return items
    })
  })
  ipcMain.handle(IpcChannel.adoptSkill, (_event, name: string) => {
    return enqueue(async () => {
      const items = await context.skills.adopt(name)
      context.onSkillsChanged()
      return items
    })
  })
}

export function broadcastSkillsChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannel.skillsChanged)
  }
}
