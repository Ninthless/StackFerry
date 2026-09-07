import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { isSkillName, type SkillDocument } from '../../../shared/skills'
import { parseSkillMarkdown } from './parse'

export type DiskSkill = {
  name: string
  description: string
  directory: string
}

export async function scanSkillRoot(root: string): Promise<Map<string, DiskSkill>> {
  const found = new Map<string, DiskSkill>()
  let names: string[]
  try {
    names = await readdir(root)
  } catch {
    return found
  }
  for (const name of names) {
    if (!isSkillName(name)) continue
    const directory = path.join(root, name)
    try {
      const info = await stat(directory)
      if (!info.isDirectory()) continue
      const document = await readSkillDocument(directory)
      found.set(name, { name, description: document.description, directory })
    } catch {
      continue
    }
  }
  return found
}

export async function readSkillDocument(directory: string): Promise<SkillDocument> {
  return parseSkillMarkdown(await readFile(path.join(directory, 'SKILL.md'), 'utf8'))
}
