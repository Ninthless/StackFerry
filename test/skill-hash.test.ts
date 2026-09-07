import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { hashSkillDirectory, hashSkillFiles } from '../electron/main/skills/hash'

describe('skill hashes', () => {
  it('is stable across Map insertion order', () => {
    const left = new Map<string, Uint8Array>([
      ['b.txt', Buffer.from('b')],
      ['a.txt', Buffer.from('a')],
    ])
    const right = new Map<string, Uint8Array>([
      ['a.txt', Buffer.from('a')],
      ['b.txt', Buffer.from('b')],
    ])
    expect(hashSkillFiles(left)).toBe(hashSkillFiles(right))
  })

  it('ignores hidden files and matches directory hashing', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'stackferry-skill-hash-'))
    await writeFile(path.join(root, 'SKILL.md'), 'visible')
    await writeFile(path.join(root, '.hidden'), 'secret')
    await mkdir(path.join(root, 'scripts'))
    await writeFile(path.join(root, 'scripts', 'run.sh'), 'echo hi\n')
    const files = new Map<string, Uint8Array>([
      ['SKILL.md', Buffer.from('visible')],
      ['scripts/run.sh', Buffer.from('echo hi\n')],
    ])
    expect(await hashSkillDirectory(root)).toBe(hashSkillFiles(files))
  })
})
