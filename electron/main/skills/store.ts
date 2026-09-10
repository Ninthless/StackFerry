import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { AppError } from '../../../shared/app-error'
import {
  DEFAULT_SKILL_REPOS,
  isSkillTarget,
  normalizeSkillRepo,
  pinPreferredSkillRepo,
  requireSkillName,
  type SkillOrigin,
  type SkillRepo,
  type SkillTarget,
} from '../../../shared/skills'
import { atomicWriteFile } from '../codex/writer'

// v2：已有商店补上 Ninthless/agent-skills 并排到最前；之后允许用户再删掉。
const STORE_VERSION = 2

export type StoredSkill = {
  origin: SkillOrigin | null
  contentHash: string
  appliedTo: SkillTarget[]
}

export type SkillsFile = {
  version: number
  repos: SkillRepo[]
  installed: Record<string, StoredSkill>
}

export class SkillStore {
  constructor(private readonly filePath: string) {}

  async read(): Promise<SkillsFile> {
    if (!existsSync(this.filePath)) return this.emptyFile()
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<SkillsFile>
      return this.normalize(parsed)
    } catch {
      throw new AppError('skill_store_corrupt')
    }
  }

  async write(file: SkillsFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true })
    await atomicWriteFile(this.filePath, `${JSON.stringify(this.normalize(file), null, 2)}\n`)
  }

  async upsert(name: string, record: StoredSkill): Promise<SkillsFile> {
    const file = await this.read()
    file.installed[requireSkillName(name)] = {
      origin: record.origin,
      contentHash: record.contentHash,
      appliedTo: uniqueTargets(record.appliedTo),
    }
    await this.write(file)
    return file
  }

  async removeInstalled(name: string): Promise<SkillsFile> {
    const file = await this.read()
    delete file.installed[requireSkillName(name)]
    await this.write(file)
    return file
  }

  async setRepos(repos: SkillRepo[]): Promise<SkillsFile> {
    const file = await this.read()
    file.repos = uniqueRepos(repos)
    await this.write(file)
    return file
  }

  async setAppliedTo(name: string, appliedTo: SkillTarget[]): Promise<SkillsFile> {
    const file = await this.read()
    const record = file.installed[requireSkillName(name)]
    if (!record) throw new AppError('skill_missing')
    record.appliedTo = uniqueTargets(appliedTo)
    await this.write(file)
    return file
  }

  private emptyFile(): SkillsFile {
    return { version: STORE_VERSION, repos: DEFAULT_SKILL_REPOS.map((repo) => ({ ...repo })), installed: {} }
  }

  private normalize(parsed: Partial<SkillsFile>): SkillsFile {
    const installed: Record<string, StoredSkill> = {}
    if (parsed.installed && typeof parsed.installed === 'object') {
      for (const [name, record] of Object.entries(parsed.installed)) {
        if (!record || typeof record !== 'object') continue
        try {
          installed[requireSkillName(name)] = {
            origin: normalizeOrigin(record.origin),
            contentHash: typeof record.contentHash === 'string' ? record.contentHash : '',
            appliedTo: uniqueTargets(record.appliedTo),
          }
        } catch {
          continue
        }
      }
    }
    const version = typeof parsed.version === 'number' ? parsed.version : 0
    let repos = uniqueRepos(Array.isArray(parsed.repos) ? parsed.repos : DEFAULT_SKILL_REPOS)
    if (version < 2) repos = pinPreferredSkillRepo(repos)
    return {
      version: STORE_VERSION,
      repos,
      installed,
    }
  }
}

function uniqueTargets(value: unknown): SkillTarget[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<SkillTarget>()
  for (const item of value) {
    if (isSkillTarget(item)) seen.add(item)
  }
  return SKILL_TARGET_ORDER.filter((item) => seen.has(item))
}

const SKILL_TARGET_ORDER: SkillTarget[] = ['claude', 'codex', 'grok']

function uniqueRepos(value: unknown): SkillRepo[] {
  if (!Array.isArray(value)) return DEFAULT_SKILL_REPOS.map((repo) => ({ ...repo }))
  const seen = new Set<string>()
  const repos: SkillRepo[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    try {
      const repo = normalizeSkillRepo(item as SkillRepo)
      if (seen.has(repo.id)) continue
      seen.add(repo.id)
      repos.push(repo)
    } catch {
      continue
    }
  }
  return repos
}

function normalizeOrigin(value: unknown): SkillOrigin | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<SkillOrigin>
  if (
    typeof record.owner !== 'string' ||
    typeof record.repo !== 'string' ||
    typeof record.branch !== 'string' ||
    typeof record.skillPath !== 'string'
  ) {
    return null
  }
  return {
    owner: record.owner,
    repo: record.repo,
    branch: record.branch,
    subdirectory: typeof record.subdirectory === 'string' ? record.subdirectory : '',
    skillPath: record.skillPath,
  }
}
