import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { SkillOrigin, SkillRepo } from '../../../shared/skills'
import { downloadGithubArchive, discoverSkills, unzipSkillArchive } from './github'
import { zipCacheFile } from './home'

export type CatalogSkill = {
  name: string
  description: string
  skillPath: string
  contentHash: string
}

export type CatalogRepo = {
  id: string
  owner: string
  name: string
  branch: string
  subdirectory: string
  fetchedAt: string
  skills: CatalogSkill[]
}

export type CatalogCache = {
  version: number
  repos: CatalogRepo[]
}

const CACHE_VERSION = 1

export async function loadCatalogCache(filePath: string): Promise<CatalogCache> {
  if (!existsSync(filePath)) return { version: CACHE_VERSION, repos: [] }
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as Partial<CatalogCache>
    if (!Array.isArray(parsed.repos)) return { version: CACHE_VERSION, repos: [] }
    return { version: CACHE_VERSION, repos: parsed.repos.filter(isCatalogRepo) }
  } catch {
    return { version: CACHE_VERSION, repos: [] }
  }
}

export async function saveCatalogCache(filePath: string, cache: CatalogCache): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8')
}

export async function refreshCatalogRepos(options: {
  repos: SkillRepo[]
  userData: string
  previous: CatalogCache
  fetchImpl?: typeof fetch
}): Promise<CatalogCache> {
  const next: CatalogCache = { version: CACHE_VERSION, repos: [] }
  let lastError: unknown
  for (const repo of options.repos) {
    try {
      const bytes = await downloadGithubArchive(repo, options.fetchImpl)
      await writeZipCache(options.userData, repo, bytes)
      const discovered = discoverSkills(unzipSkillArchive(bytes), repo.subdirectory)
      next.repos.push({
        id: repo.id,
        owner: repo.owner,
        name: repo.name,
        branch: repo.branch,
        subdirectory: repo.subdirectory,
        fetchedAt: new Date().toISOString(),
        skills: discovered.map((skill) => ({
          name: skill.name,
          description: skill.description,
          skillPath: skill.skillPath,
          contentHash: skill.contentHash,
        })),
      })
    } catch (error) {
      lastError = error
      const previous = options.previous.repos.find((item) => item.id === repo.id)
      if (previous) next.repos.push(previous)
    }
  }
  if (next.repos.length === 0 && options.repos.length > 0 && lastError) throw lastError
  return next
}

export async function loadRepoArchive(options: {
  repo: SkillRepo
  userData: string
  fetchImpl?: typeof fetch
}): Promise<Uint8Array> {
  const filePath = zipCacheFile(options.userData, options.repo.owner, options.repo.name, options.repo.branch)
  if (existsSync(filePath)) {
    return new Uint8Array(await readFile(filePath))
  }
  const bytes = await downloadGithubArchive(options.repo, options.fetchImpl)
  await writeZipCache(options.userData, options.repo, bytes)
  return bytes
}

export function remoteHashFor(cache: CatalogCache, origin: SkillOrigin | null): string | null {
  if (!origin) return null
  const repo = cache.repos.find(
    (item) =>
      item.owner === origin.owner &&
      item.name === origin.repo &&
      item.branch === origin.branch &&
      item.subdirectory === origin.subdirectory,
  )
  if (!repo) return null
  const skill =
    repo.skills.find((item) => item.skillPath === origin.skillPath) ??
    repo.skills.find((item) => item.name === origin.skillPath.split('/').pop())
  return skill?.contentHash ?? null
}

function isCatalogRepo(value: CatalogRepo): value is CatalogRepo {
  return Boolean(value && typeof value.id === 'string' && Array.isArray(value.skills))
}

async function writeZipCache(userData: string, repo: SkillRepo, bytes: Uint8Array): Promise<void> {
  const filePath = zipCacheFile(userData, repo.owner, repo.name, repo.branch)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, bytes)
}
