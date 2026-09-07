import { mkdir, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { AppError } from '../../../shared/app-error'
import {
  normalizeSkillRepo,
  requireSkillDescription,
  requireSkillName,
  type SkillDraft,
  type SkillDocument,
  type SkillListItem,
  type SkillRepo,
  type SkillRepoDraft,
  type SkillTarget,
} from '../../../shared/skills'
import { loadCatalogCache, loadRepoArchive, refreshCatalogRepos, saveCatalogCache } from './catalog'
import { discoverSkills, unzipSkillArchive } from './github'
import { hashSkillDirectory, readSkillFiles } from './hash'
import {
  agentsSkillsRoot,
  claudeSkillsRoot,
  legacyCodexSkillsRoot,
  skillSsotDirectory,
  skillsBackupRoot,
  skillsCachePath,
  skillsSsotRoot,
  skillsStorePath,
} from './home'
import { appliedTargets, mergeSkillList, originFromCache } from './list'
import { serializeSkillMarkdown } from './parse'
import { readSkillDocument, scanSkillRoot } from './scan'
import { SkillStore } from './store'
import { applySkillLink, copySkillDirectory, removePath, removeSkillLink, writeSkillFiles } from './sync'

const MAX_BACKUPS = 20

export type SkillServiceDeps = {
  userData: string
  getClaudeHome: () => string
  getCodexHome: () => string
  homedir?: () => string
  platform?: NodeJS.Platform
  fetch?: typeof fetch
}

export class SkillService {
  private readonly store: SkillStore
  private readonly homedir: () => string
  private readonly platform: NodeJS.Platform

  constructor(private readonly deps: SkillServiceDeps) {
    this.store = new SkillStore(skillsStorePath(deps.userData))
    this.homedir = deps.homedir ?? os.homedir
    this.platform = deps.platform ?? process.platform
  }

  async list(): Promise<SkillListItem[]> {
    return this.merge()
  }

  async refreshCatalog(): Promise<SkillListItem[]> {
    const file = await this.store.read()
    const previous = await loadCatalogCache(skillsCachePath(this.deps.userData))
    const cache = await refreshCatalogRepos({
      repos: file.repos,
      userData: this.deps.userData,
      previous,
      fetchImpl: this.deps.fetch,
    })
    await saveCatalogCache(skillsCachePath(this.deps.userData), cache)
    return this.merge()
  }

  async install(name: string): Promise<SkillListItem[]> {
    await this.materializeFromCatalog(requireSkillName(name), false)
    return this.merge()
  }

  async update(name: string): Promise<SkillListItem[]> {
    await this.materializeFromCatalog(requireSkillName(name), true)
    return this.merge()
  }

  async updateAll(): Promise<SkillListItem[]> {
    const items = await this.refreshCatalog()
    for (const item of items) {
      if (item.installed && item.updateAvailable) await this.materializeFromCatalog(item.name, true)
    }
    return this.merge()
  }

  async uninstall(name: string): Promise<SkillListItem[]> {
    const skillName = requireSkillName(name)
    const ssot = skillSsotDirectory(this.deps.userData, skillName)
    await this.backupSkill(ssot, skillName)
    await this.unapplyAll(skillName)
    await removePath(ssot)
    await this.store.removeInstalled(skillName)
    return this.merge()
  }

  async setTarget(name: string, target: SkillTarget, enabled: boolean): Promise<SkillListItem[]> {
    const skillName = requireSkillName(name)
    if (enabled) {
      const current = (await this.merge()).find((item) => item.id === skillName)
      if (!current) throw new AppError('skill_missing')
      if (!current.installed) {
        if (current.orphan) await this.adopt(skillName)
        else await this.materializeFromCatalog(skillName, false)
      }
      await applySkillLink(
        skillSsotDirectory(this.deps.userData, skillName),
        this.targetRoot(target),
        skillName,
        this.platform,
      )
    } else {
      await removeSkillLink(this.targetRoot(target), skillName)
      if (target === 'codex') await removeSkillLink(this.legacyCodexRoot(), skillName)
    }
    const file = await this.store.read()
    if (file.installed[skillName]) {
      await this.store.setAppliedTo(skillName, await this.liveAppliedTo(skillName))
    }
    return this.merge()
  }

  async listRepos(): Promise<SkillRepo[]> {
    return (await this.store.read()).repos
  }

  async addRepo(draft: SkillRepoDraft): Promise<SkillRepo[]> {
    const repo = normalizeSkillRepo(draft)
    const file = await this.store.read()
    return (await this.store.setRepos([...file.repos.filter((item) => item.id !== repo.id), repo])).repos
  }

  async removeRepo(id: string): Promise<SkillRepo[]> {
    const file = await this.store.read()
    return (await this.store.setRepos(file.repos.filter((item) => item.id !== id))).repos
  }

  async create(draft: SkillDraft): Promise<SkillListItem[]> {
    const document = normalizeDocument(draft)
    const ssot = skillSsotDirectory(this.deps.userData, document.name)
    if ((await scanSkillRoot(skillsSsotRoot(this.deps.userData))).has(document.name)) {
      throw new AppError('skill_exists')
    }
    await writeSkillFiles(ssot, markdownFiles(document))
    await this.store.upsert(document.name, {
      origin: null,
      contentHash: await hashSkillDirectory(ssot),
      appliedTo: [],
    })
    return this.merge()
  }

  async read(name: string): Promise<SkillDocument> {
    return readSkillDocument(skillSsotDirectory(this.deps.userData, requireSkillName(name)))
  }

  async write(name: string, draft: SkillDraft): Promise<SkillListItem[]> {
    const skillName = requireSkillName(name)
    const document = normalizeDocument(draft)
    if (document.name !== skillName) throw new AppError('skill_name_invalid')
    const ssot = skillSsotDirectory(this.deps.userData, skillName)
    const files = await readSkillFiles(ssot).catch(() => new Map<string, Uint8Array>())
    files.set('SKILL.md', Buffer.from(serializeSkillMarkdown(document)))
    await writeSkillFiles(ssot, files)
    const current = (await this.store.read()).installed[skillName]
    await this.store.upsert(skillName, {
      origin: current?.origin ?? null,
      contentHash: await hashSkillDirectory(ssot),
      appliedTo: current?.appliedTo ?? [],
    })
    await this.resync(skillName, current?.appliedTo ?? [])
    return this.merge()
  }

  async adopt(name: string): Promise<SkillListItem[]> {
    const skillName = requireSkillName(name)
    const orphan =
      (await scanSkillRoot(this.claudeRoot())).get(skillName) ??
      (await scanSkillRoot(this.agentsRoot())).get(skillName) ??
      (await scanSkillRoot(this.legacyCodexRoot())).get(skillName)
    if (!orphan) throw new AppError('skill_missing')
    const ssot = skillSsotDirectory(this.deps.userData, skillName)
    await copySkillDirectory(orphan.directory, ssot)
    await this.store.upsert(skillName, {
      origin: null,
      contentHash: await hashSkillDirectory(ssot),
      appliedTo: await this.liveAppliedTo(skillName),
    })
    return this.merge()
  }

  private async merge(): Promise<SkillListItem[]> {
    return mergeSkillList({
      file: await this.store.read(),
      cache: await loadCatalogCache(skillsCachePath(this.deps.userData)),
      ssot: await scanSkillRoot(skillsSsotRoot(this.deps.userData)),
      claude: await scanSkillRoot(this.claudeRoot()),
      agents: await scanSkillRoot(this.agentsRoot()),
      legacy: await scanSkillRoot(this.legacyCodexRoot()),
    })
  }

  private async materializeFromCatalog(name: string, requireInstalled: boolean): Promise<void> {
    const file = await this.store.read()
    if (requireInstalled && !file.installed[name]) throw new AppError('skill_missing')
    const cache = await loadCatalogCache(skillsCachePath(this.deps.userData))
    const origin = file.installed[name]?.origin ?? originFromCache(cache, name)
    if (!origin) throw new AppError('skill_missing')
    const repo =
      file.repos.find(
        (item) => item.owner === origin.owner && item.name === origin.repo && item.branch === origin.branch,
      ) ??
      normalizeSkillRepo({
        owner: origin.owner,
        name: origin.repo,
        branch: origin.branch,
        subdirectory: origin.subdirectory,
      })
    const discovered = discoverSkills(
      unzipSkillArchive(await loadRepoArchive({ repo, userData: this.deps.userData, fetchImpl: this.deps.fetch })),
      origin.subdirectory,
    )
    const skill =
      discovered.find((item) => item.skillPath === origin.skillPath) ??
      discovered.find((item) => item.name === name)
    if (!skill) throw new AppError('skill_missing')
    const ssot = skillSsotDirectory(this.deps.userData, skill.name)
    await writeSkillFiles(ssot, skill.files)
    const appliedTo = file.installed[name]?.appliedTo ?? []
    await this.store.upsert(skill.name, {
      origin: { ...origin, skillPath: skill.skillPath },
      contentHash: skill.contentHash,
      appliedTo,
    })
    await this.resync(skill.name, appliedTo)
  }

  private async resync(name: string, appliedTo: SkillTarget[]): Promise<void> {
    const ssot = skillSsotDirectory(this.deps.userData, name)
    for (const target of appliedTo) {
      await applySkillLink(ssot, this.targetRoot(target), name, this.platform)
    }
  }

  private async unapplyAll(name: string): Promise<void> {
    await removeSkillLink(this.claudeRoot(), name)
    await removeSkillLink(this.agentsRoot(), name)
    await removeSkillLink(this.legacyCodexRoot(), name)
  }

  private async backupSkill(ssot: string, name: string): Promise<void> {
    const root = skillsBackupRoot(this.deps.userData)
    await mkdir(root, { recursive: true })
    try {
      await copySkillDirectory(ssot, path.join(root, `${name}-${new Date().toISOString().replaceAll(':', '-')}`))
    } catch {
      return
    }
    const entries = (await readdir(root)).sort()
    if (entries.length <= MAX_BACKUPS) return
    for (const extra of entries.slice(0, entries.length - MAX_BACKUPS)) {
      await rm(path.join(root, extra), { recursive: true, force: true })
    }
  }

  private async liveAppliedTo(name: string): Promise<SkillTarget[]> {
    return appliedTargets(
      name,
      await scanSkillRoot(this.claudeRoot()),
      await scanSkillRoot(this.agentsRoot()),
      await scanSkillRoot(this.legacyCodexRoot()),
    )
  }

  private claudeRoot(): string {
    return claudeSkillsRoot(this.deps.getClaudeHome())
  }

  private agentsRoot(): string {
    return agentsSkillsRoot(this.homedir())
  }

  private legacyCodexRoot(): string {
    return legacyCodexSkillsRoot(this.deps.getCodexHome())
  }

  private targetRoot(target: SkillTarget): string {
    return target === 'claude' ? this.claudeRoot() : this.agentsRoot()
  }
}

function normalizeDocument(draft: SkillDraft): SkillDocument {
  return {
    name: requireSkillName(draft.name),
    description: requireSkillDescription(draft.description),
    body: draft.body ?? '',
  }
}

function markdownFiles(document: SkillDocument): Map<string, Uint8Array> {
  return new Map([['SKILL.md', Buffer.from(serializeSkillMarkdown(document))]])
}
