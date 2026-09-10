import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SkillStore } from '../electron/main/skills/store'
import { skillRepo } from '../shared/skills'

describe('skill store defaults', () => {
  it('pins Ninthless/agent-skills first when migrating a v1 store', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-skill-store-'))
    const filePath = path.join(dir, 'skills.json')
    const anthropic = skillRepo('anthropics', 'skills', 'main')
    await writeFile(
      filePath,
      `${JSON.stringify({ version: 1, repos: [anthropic], installed: {} }, null, 2)}\n`,
    )
    const file = await new SkillStore(filePath).read()
    expect(file.version).toBe(2)
    expect(file.repos[0]).toEqual(skillRepo('Ninthless', 'agent-skills', 'main'))
    expect(file.repos).toContainEqual(anthropic)
  })

  it('does not reinsert the preferred repo after the user removes it', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-skill-store-'))
    const filePath = path.join(dir, 'skills.json')
    const store = new SkillStore(filePath)
    const extra = skillRepo('acme', 'extra', 'main')
    await store.setRepos([extra])
    const file = await store.read()
    expect(file.repos).toEqual([extra])
  })
})
