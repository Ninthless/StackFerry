import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { SkillService } from '../electron/main/skills/service'
import { skillRepo } from '../shared/skills'

const markdown = '---\nname: pdf\ndescription: Use when working with PDFs.\n---\n\nRead PDFs.\n'

function archiveResponse(): Response {
  const bytes = zipSync({
    'skills-main/skills/pdf/SKILL.md': strToU8(markdown),
  })
  return new Response(Buffer.from(bytes), { status: 200 })
}

describe('skill service', () => {
  it('installs from a catalog zip and applies only to the selected CLI', async () => {
    const userData = await mkdtemp(path.join(os.tmpdir(), 'stackferry-skill-user-'))
    const claudeHome = await mkdtemp(path.join(os.tmpdir(), 'stackferry-skill-claude-'))
    const homedir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-skill-home-'))
    const codexHome = await mkdtemp(path.join(os.tmpdir(), 'stackferry-skill-codex-'))
    const service = new SkillService({
      userData,
      getClaudeHome: () => claudeHome,
      getCodexHome: () => codexHome,
      homedir: () => homedir,
      fetch: async () => archiveResponse(),
    })
    await service.addRepo(skillRepo('anthropics', 'skills', 'main', 'skills'))
    await service.refreshCatalog()
    const catalog = await service.list()
    expect(catalog.some((item) => item.name === 'pdf' && !item.installed)).toBe(true)
    await service.install('pdf')
    const installed = (await service.list()).find((item) => item.name === 'pdf')
    expect(installed?.installed).toBe(true)
    expect(installed?.appliedTo).toEqual([])
    await service.setTarget('pdf', 'claude', true)
    expect(await readFile(path.join(claudeHome, 'skills', 'pdf', 'SKILL.md'), 'utf8')).toContain('name: pdf')
    await expect(readFile(path.join(homedir, '.agents', 'skills', 'pdf', 'SKILL.md'), 'utf8')).rejects.toThrow()
    await service.setTarget('pdf', 'codex', true)
    expect(await readFile(path.join(homedir, '.agents', 'skills', 'pdf', 'SKILL.md'), 'utf8')).toContain('name: pdf')
  })

  it('treats leftover ~/.codex/skills as orphans without writing there on enable', async () => {
    const userData = await mkdtemp(path.join(os.tmpdir(), 'stackferry-skill-user-'))
    const claudeHome = await mkdtemp(path.join(os.tmpdir(), 'stackferry-skill-claude-'))
    const homedir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-skill-home-'))
    const codexHome = await mkdtemp(path.join(os.tmpdir(), 'stackferry-skill-codex-'))
    await mkdir(path.join(codexHome, 'skills', 'legacy-pdf'), { recursive: true })
    await writeFile(
      path.join(codexHome, 'skills', 'legacy-pdf', 'SKILL.md'),
      '---\nname: legacy-pdf\ndescription: Old Codex skill.\n---\n\nLegacy.\n',
    )
    const service = new SkillService({
      userData,
      getClaudeHome: () => claudeHome,
      getCodexHome: () => codexHome,
      homedir: () => homedir,
    })
    const orphan = (await service.list()).find((item) => item.name === 'legacy-pdf')
    expect(orphan?.orphan).toBe(true)
    expect(orphan?.appliedTo).toEqual(['codex'])
    await service.setTarget('legacy-pdf', 'codex', true)
    expect(await readFile(path.join(homedir, '.agents', 'skills', 'legacy-pdf', 'SKILL.md'), 'utf8')).toContain(
      'legacy-pdf',
    )
  })
})
