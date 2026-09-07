import { AppError } from './app-error'

export type SkillTarget = 'claude' | 'codex'

export type SkillOrigin = {
  owner: string
  repo: string
  branch: string
  subdirectory: string
  skillPath: string
}

export type SkillRepo = {
  id: string
  owner: string
  name: string
  branch: string
  subdirectory: string
}

export type SkillRepoDraft = {
  owner: string
  name: string
  branch?: string
  subdirectory?: string
}

export type SkillDraft = {
  name: string
  description: string
  body: string
}

export type SkillDocument = SkillDraft

export type SkillListItem = {
  id: string
  name: string
  description: string
  installed: boolean
  orphan: boolean
  appliedTo: SkillTarget[]
  updateAvailable: boolean
  origin: SkillOrigin | null
  repoLabel: string | null
}

export const SKILL_TARGETS: readonly SkillTarget[] = ['claude', 'codex']
export const SKILL_NAME_MAX = 64
export const SKILL_DESCRIPTION_MAX = 1024

const SKILL_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
const GITHUB_NAME_PATTERN = /^[A-Za-z0-9._-]+$/
const BRANCH_PATTERN = /^[A-Za-z0-9._/-]+$/

export const DEFAULT_SKILL_REPOS: SkillRepo[] = [
  skillRepo('anthropics', 'skills', 'main'),
  skillRepo('ComposioHQ', 'awesome-claude-skills', 'master'),
  skillRepo('cexll', 'myclaude', 'master'),
  skillRepo('JimLiu', 'baoyu-skills', 'main'),
]

export function isSkillTarget(value: unknown): value is SkillTarget {
  return value === 'claude' || value === 'codex'
}

export function isSkillName(value: string): boolean {
  return value.length >= 1 && value.length <= SKILL_NAME_MAX && SKILL_NAME_PATTERN.test(value)
}

export function requireSkillName(value: string): string {
  const name = value.trim()
  if (!isSkillName(name)) throw new AppError('skill_name_invalid')
  return name
}

export function requireSkillDescription(value: string): string {
  const description = value.trim()
  if (!description || description.length > SKILL_DESCRIPTION_MAX) {
    throw new AppError('skill_document_invalid')
  }
  return description
}

export function skillRepoId(
  owner: string,
  name: string,
  branch: string,
  subdirectory: string,
): string {
  return subdirectory ? `${owner}/${name}@${branch}:${subdirectory}` : `${owner}/${name}@${branch}`
}

export function skillRepo(owner: string, name: string, branch: string, subdirectory = ''): SkillRepo {
  return {
    id: skillRepoId(owner, name, branch, subdirectory),
    owner,
    name,
    branch,
    subdirectory,
  }
}

export function normalizeSkillRepo(draft: SkillRepoDraft): SkillRepo {
  const owner = draft.owner.trim()
  const name = draft.name.trim()
  const branch = (draft.branch?.trim() || 'main').replace(/^refs\/heads\//, '')
  const subdirectory = normalizeSubdirectory(draft.subdirectory)
  if (!GITHUB_NAME_PATTERN.test(owner) || !GITHUB_NAME_PATTERN.test(name)) {
    throw new AppError('skill_repo_invalid')
  }
  if (!BRANCH_PATTERN.test(branch) || branch.includes('..') || branch.startsWith('/') || branch.endsWith('/')) {
    throw new AppError('skill_repo_invalid')
  }
  return skillRepo(owner, name, branch, subdirectory)
}

export function githubArchiveUrl(repo: SkillRepo): string {
  const normalized = normalizeSkillRepo(repo)
  return `https://github.com/${normalized.owner}/${normalized.name}/archive/refs/heads/${normalized.branch}.zip`
}

export function assertGithubArchiveUrl(url: string, repo: SkillRepo): void {
  const normalized = normalizeSkillRepo(repo)
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new AppError('skill_repo_invalid')
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') {
    throw new AppError('skill_repo_invalid')
  }
  if (parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new AppError('skill_repo_invalid')
  }
  const expectedPath = `/${normalized.owner}/${normalized.name}/archive/refs/heads/${normalized.branch}.zip`
  if (parsed.pathname !== expectedPath) {
    throw new AppError('skill_repo_invalid')
  }
}

function normalizeSubdirectory(value: string | undefined): string {
  const trimmed = (value ?? '').trim().replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
  if (!trimmed) return ''
  const parts = trimmed.split('/')
  if (parts.some((part) => !part || part === '.' || part === '..' || part.includes('\0'))) {
    throw new AppError('skill_repo_invalid')
  }
  return parts.join('/')
}
