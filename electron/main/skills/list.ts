import { SKILL_TARGETS, type SkillListItem, type SkillOrigin, type SkillTarget } from '../../../shared/skills'
import { remoteHashFor, type CatalogCache } from './catalog'
import { hashSkillDirectory } from './hash'
import { type DiskSkill } from './scan'
import type { SkillsFile } from './store'

export type ScannedSkillRoot = {
  target: SkillTarget
  skills: Map<string, DiskSkill>
}

export function appliedTargets(name: string, roots: readonly ScannedSkillRoot[]): SkillTarget[] {
  const found = new Set<SkillTarget>()
  for (const root of roots) {
    if (root.skills.has(name)) found.add(root.target)
  }
  return SKILL_TARGETS.filter((target) => found.has(target))
}

export function originFromCache(cache: CatalogCache, name: string): SkillOrigin | null {
  for (const repo of cache.repos) {
    const skill = repo.skills.find((item) => item.name === name)
    if (!skill) continue
    return {
      owner: repo.owner,
      repo: repo.name,
      branch: repo.branch,
      subdirectory: repo.subdirectory,
      skillPath: skill.skillPath,
    }
  }
  return null
}

export async function mergeSkillList(options: {
  file: SkillsFile
  cache: CatalogCache
  ssot: Map<string, DiskSkill>
  roots: readonly ScannedSkillRoot[]
}): Promise<SkillListItem[]> {
  const byName = new Map<string, SkillListItem>()
  for (const repo of options.cache.repos) {
    for (const skill of repo.skills) {
      if (byName.has(skill.name)) continue
      byName.set(skill.name, catalogItem(skill, repo))
    }
  }
  for (const local of options.ssot.values()) {
    const record = options.file.installed[local.name]
    const existing = byName.get(local.name)
    const origin = record?.origin ?? existing?.origin ?? null
    const appliedTo = appliedTargets(local.name, options.roots)
    const remoteHash = remoteHashFor(options.cache, origin)
    const localHash = record?.contentHash || (await hashSkillDirectory(local.directory))
    byName.set(local.name, {
      id: local.name,
      name: local.name,
      description: local.description,
      installed: true,
      orphan: false,
      appliedTo,
      updateAvailable: Boolean(origin && remoteHash && remoteHash !== localHash),
      origin,
      repoLabel: origin ? `${origin.owner}/${origin.repo}` : null,
    })
  }
  for (const root of options.roots) {
    for (const orphan of root.skills.values()) {
      const current = byName.get(orphan.name)
      if (current?.installed) continue
      byName.set(orphan.name, {
        id: orphan.name,
        name: orphan.name,
        description: orphan.description,
        installed: false,
        orphan: true,
        appliedTo: appliedTargets(orphan.name, options.roots),
        updateAvailable: false,
        origin: current?.origin ?? null,
        repoLabel: current?.repoLabel ?? null,
      })
    }
  }
  return [...byName.values()].sort(compareSkills)
}

function catalogItem(
  skill: { name: string; description: string; skillPath: string },
  repo: { owner: string; name: string; branch: string; subdirectory: string },
): SkillListItem {
  return {
    id: skill.name,
    name: skill.name,
    description: skill.description,
    installed: false,
    orphan: false,
    appliedTo: [],
    updateAvailable: false,
    origin: {
      owner: repo.owner,
      repo: repo.name,
      branch: repo.branch,
      subdirectory: repo.subdirectory,
      skillPath: skill.skillPath,
    },
    repoLabel: `${repo.owner}/${repo.name}`,
  }
}

function compareSkills(left: SkillListItem, right: SkillListItem): number {
  const rank = Number(right.installed) - Number(left.installed) || Number(right.orphan) - Number(left.orphan)
  return rank || left.name.localeCompare(right.name)
}
