import { unzipSync, strFromU8 } from 'fflate'
import { AppError } from '../../../shared/app-error'
import { githubArchiveUrl, assertGithubArchiveUrl, type SkillRepo } from '../../../shared/skills'
import { hashSkillFiles } from './hash'
import { parseSkillMarkdown } from './parse'
import { assertSafeZipEntry } from './safe-path'

export const MAX_ZIP_BYTES = 80 * 1024 * 1024
export const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024
const FETCH_TIMEOUT_MS = 120_000
const SKIP_DIR = /(?:^|\/)(?:node_modules|\.git|__MACOSX)(?:\/|$)/i

export type ZipTree = Map<string, Uint8Array>

export type DiscoveredSkill = {
  name: string
  description: string
  skillPath: string
  contentHash: string
  files: Map<string, Uint8Array>
}

export async function downloadGithubArchive(
  repo: SkillRepo,
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array> {
  const url = githubArchiveUrl(repo)
  assertGithubArchiveUrl(url, repo)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/zip',
        'User-Agent': 'StackFerry',
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new AppError('skill_github_http', { status: String(response.status) })
    }
    const length = Number(response.headers.get('content-length') ?? '0')
    if (Number.isFinite(length) && length > MAX_ZIP_BYTES) {
      throw new AppError('skill_zip_unsafe')
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > MAX_ZIP_BYTES) throw new AppError('skill_zip_unsafe')
    return bytes
  } catch (error) {
    if (error instanceof AppError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AppError('skill_github_timeout')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export function unzipSkillArchive(bytes: Uint8Array): ZipTree {
  if (bytes.byteLength > MAX_ZIP_BYTES) throw new AppError('skill_zip_unsafe')
  let total = 0
  let oversized = false
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes, {
      filter(file) {
        total += file.originalSize
        if (total > MAX_UNCOMPRESSED_BYTES) {
          oversized = true
          return false
        }
        return true
      },
    })
  } catch {
    throw new AppError('skill_zip_unsafe')
  }
  if (oversized) throw new AppError('skill_zip_unsafe')
  const tree = new Map<string, Uint8Array>()
  for (const [rawName, content] of Object.entries(files)) {
    const posix = rawName.replaceAll('\\', '/')
    if (posix.endsWith('/')) continue
    const safe = assertSafeZipEntry(posix)
    if (!safe) continue
    tree.set(safe, content)
  }
  return omitDirectoryEntries(stripZipRoot(tree))
}

export function discoverSkills(tree: ZipTree, subdirectory = ''): DiscoveredSkill[] {
  const prefix = subdirectory ? `${subdirectory.replace(/\/$/, '')}/` : ''
  const markdownPaths = [...tree.keys()]
    .filter((entry) => {
      if (SKIP_DIR.test(entry)) return false
      if (prefix && !entry.startsWith(prefix)) return false
      return entry.split('/').pop() === 'SKILL.md'
    })
    .sort()
  const found: DiscoveredSkill[] = []
  const seen = new Set<string>()
  for (const markdownPath of markdownPaths) {
    const dir = markdownPath.slice(0, -'SKILL.md'.length).replace(/\/$/, '')
    const dirName = dir.split('/').pop() ?? ''
    const files = filesUnder(tree, dir)
    const source = files.get('SKILL.md')
    if (!source) continue
    let parsed
    try {
      parsed = parseSkillMarkdown(strFromU8(source))
    } catch {
      continue
    }
    if (parsed.name !== dirName || seen.has(parsed.name)) continue
    seen.add(parsed.name)
    found.push({
      name: parsed.name,
      description: parsed.description,
      skillPath: dir,
      contentHash: hashSkillFiles(files),
      files,
    })
  }
  return found
}

function filesUnder(tree: ZipTree, dir: string): Map<string, Uint8Array> {
  const prefix = `${dir}/`
  const files = new Map<string, Uint8Array>()
  for (const [entry, content] of tree) {
    if (entry !== `${dir}/SKILL.md` && !entry.startsWith(prefix)) continue
    const relative = entry.slice(prefix.length)
    if (!relative || relative.split('/').some((part) => part.startsWith('.'))) continue
    files.set(relative, content)
  }
  return omitDirectoryEntries(files)
}

export function omitDirectoryEntries(tree: ZipTree): ZipTree {
  const keys = [...tree.keys()]
  const files = new Map<string, Uint8Array>()
  for (const [name, content] of tree) {
    if (keys.some((other) => other !== name && other.startsWith(`${name}/`))) continue
    files.set(name, content)
  }
  return files
}

function stripZipRoot(tree: ZipTree): ZipTree {
  const stripped = new Map<string, Uint8Array>()
  for (const [name, content] of tree) {
    const slash = name.indexOf('/')
    if (slash <= 0) continue
    const rest = name.slice(slash + 1)
    if (!rest) continue
    stripped.set(rest, content)
  }
  return stripped
}
