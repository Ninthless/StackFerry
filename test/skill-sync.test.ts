import { lstat, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { applySkillLink, removeSkillLink, writeSkillFiles } from '../electron/main/skills/sync'

describe('skill sync', () => {
  it('links into a target without rewriting the SSOT copy', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'stackferry-skill-sync-'))
    const ssot = path.join(root, 'ssot', 'pdf')
    const destRoot = path.join(root, 'claude', 'skills')
    await writeSkillFiles(ssot, new Map([['SKILL.md', Buffer.from('keep-me')]]))
    await applySkillLink(ssot, destRoot, 'pdf')
    const linked = path.join(destRoot, 'pdf', 'SKILL.md')
    expect(await readFile(linked, 'utf8')).toBe('keep-me')
    await writeFile(path.join(ssot, 'SKILL.md'), 'updated')
    expect(await readFile(linked, 'utf8')).toBe('updated')
    expect(await readFile(path.join(ssot, 'SKILL.md'), 'utf8')).toBe('updated')
    await removeSkillLink(destRoot, 'pdf')
    await expect(lstat(path.join(destRoot, 'pdf'))).rejects.toThrow()
    expect(await readFile(path.join(ssot, 'SKILL.md'), 'utf8')).toBe('updated')
  })

  it('can copy when the destination root already exists', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'stackferry-skill-copy-'))
    const ssot = path.join(root, 'ssot', 'pdf')
    const destRoot = path.join(root, 'agents', 'skills')
    await mkdir(destRoot, { recursive: true })
    await writeSkillFiles(ssot, new Map([['SKILL.md', Buffer.from('body')]]))
    await applySkillLink(ssot, destRoot, 'pdf')
    expect(await readFile(path.join(destRoot, 'pdf', 'SKILL.md'), 'utf8')).toBe('body')
  })
})
