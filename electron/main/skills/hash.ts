import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

export function hashSkillFiles(files: Map<string, Uint8Array>): string {
  const hash = createHash('sha256')
  const keys = [...files.keys()].filter((key) => !isHiddenRelative(key)).sort()
  for (const key of keys) {
    const content = files.get(key)
    if (!content) continue
    hash.update(key)
    hash.update('\0')
    hash.update(content)
    hash.update('\0')
  }
  return hash.digest('hex')
}

export async function hashSkillDirectory(directory: string): Promise<string> {
  return hashSkillFiles(await readSkillFiles(directory))
}

export async function readSkillFiles(directory: string): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>()
  await walk(directory, '', files)
  return files
}

function isHiddenRelative(relative: string): boolean {
  return relative.split(/[\\/]/).some((part) => part.startsWith('.'))
}

async function walk(
  root: string,
  relative: string,
  files: Map<string, Uint8Array>,
): Promise<void> {
  const current = relative ? path.join(root, relative) : root
  let entries: string[]
  try {
    entries = await readdir(current)
  } catch {
    return
  }
  entries.sort()
  for (const entry of entries) {
    if (entry.startsWith('.')) continue
    const childRelative = relative ? `${relative}/${entry}` : entry
    const full = path.join(current, entry)
    const info = await stat(full)
    if (info.isDirectory()) {
      await walk(root, childRelative, files)
      continue
    }
    if (!info.isFile()) continue
    files.set(childRelative.replaceAll('\\', '/'), await readFile(full))
  }
}
