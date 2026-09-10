import { AppError } from './app-error'

export type SkillTarget = 'claude' | 'codex' | 'grok'

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

export type SkillImportCandidate = {
  name: string
  description: string
  directory: string
  installed: boolean
}

export const SKILL_TARGETS: readonly SkillTarget[] = ['claude', 'codex', 'grok']
export const SKILL_NAME_MAX = 64
export const SKILL_DESCRIPTION_MAX = 1024

const SKILL_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
const GITHUB_NAME_PATTERN = /^[A-Za-z0-9._-]+$/
const BRANCH_PATTERN = /^[A-Za-z0-9._/-]+$/

export const DEFAULT_SKILL_REPOS: SkillRepo[] = [
  skillRepo('Ninthless', 'agent-skills', 'main'),
  skillRepo('anthropics', 'skills', 'main'),
  skillRepo('ComposioHQ', 'awesome-claude-skills', 'master'),
  skillRepo('cexll', 'myclaude', 'master'),
  skillRepo('JimLiu', 'baoyu-skills', 'main'),
]

export function pinPreferredSkillRepo(repos: SkillRepo[]): SkillRepo[] {
  const preferred = DEFAULT_SKILL_REPOS[0]
  if (!preferred) return repos
  return [{ ...preferred }, ...repos.filter((repo) => repo.id !== preferred.id)]
}

export function isSkillTarget(value: unknown): value is SkillTarget {
  return typeof value === 'string' && (SKILL_TARGETS as readonly string[]).includes(value)
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

export function parseSkillRepoInput(value: string): SkillRepo {
  const trimmed = value.trim()
  if (!trimmed) throw new AppError('skill_repo_invalid')
  const ssh = parseGithubSsh(trimmed)
  if (ssh) return normalizeSkillRepo(ssh)
  const http = parseGithubHttp(trimmed)
  if (http) return normalizeSkillRepo(http)
  return normalizeSkillRepo(parseGithubShorthand(trimmed))
}

const GITHUB_TREE_KINDS = new Set(['tree', 'blob'])

function parseGithubSsh(value: string): SkillRepoDraft | null {
  const scp = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i.exec(value)
  if (scp) return { owner: scp[1] ?? '', name: scp[2] ?? '' }
  const sshUrl = /^ssh:\/\/git@github\.com\/([^/]+)\/(.+?)(?:\.git)?$/i.exec(value)
  if (sshUrl) return { owner: sshUrl[1] ?? '', name: sshUrl[2] ?? '' }
  return null
}

function parseGithubHttp(value: string): SkillRepoDraft | null {
  const candidate = coerceGithubHttp(value)
  if (!candidate) return null
  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    throw new AppError('skill_repo_invalid')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError('skill_repo_invalid')
  }
  const host = parsed.hostname.replace(/^www\./i, '').toLowerCase()
  if (host !== 'github.com') throw new AppError('skill_repo_invalid')
  const parts = parsed.pathname.split('/').filter(Boolean).map(decodeGithubPart)
  if (parts.length < 2) throw new AppError('skill_repo_invalid')
  const owner = parts[0] ?? ''
  const name = stripGitSuffix(parts[1] ?? '')
  const kind = parts[2]
  if (!kind || !GITHUB_TREE_KINDS.has(kind)) return { owner, name }
  const ref = parts[3]
  if (!ref) return { owner, name }
  const rest = parts.slice(4)
  const subdirectory = kind === 'blob' && rest.length > 0 ? rest.slice(0, -1) : rest
  return { owner, name, branch: ref, subdirectory: subdirectory.join('/') }
}

function coerceGithubHttp(value: string): string | null {
  if (/^https?:\/\//i.test(value)) return value
  if (/^(www\.)?github\.com\//i.test(value)) return `https://${value}`
  return null
}

function parseGithubShorthand(value: string): SkillRepoDraft {
  const at = value.indexOf('@')
  const repoPart = at > 0 ? value.slice(0, at) : value
  const branch = at > 0 ? value.slice(at + 1) : undefined
  const parts = repoPart.split('/').filter(Boolean)
  if (parts.length !== 2) throw new AppError('skill_repo_invalid')
  return { owner: parts[0] ?? '', name: stripGitSuffix(parts[1] ?? ''), branch }
}

function stripGitSuffix(name: string): string {
  return name.replace(/\.git$/i, '')
}

function decodeGithubPart(part: string): string {
  try {
    return decodeURIComponent(part)
  } catch {
    throw new AppError('skill_repo_invalid')
  }
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
