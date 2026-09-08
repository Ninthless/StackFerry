import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { skillsCachePath, skillsSsotRoot } from '../electron/main/skills/home'
import { SkillService } from '../electron/main/skills/service'
import { AppError } from '../shared/app-error'
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
    await expect(readFile(path.join(codexHome, 'skills', 'pdf', 'SKILL.md'), 'utf8')).rejects.toThrow()
    await service.setTarget('pdf', 'codex', true)
    expect(await readFile(path.join(homedir, '.agents', 'skills', 'pdf', 'SKILL.md'), 'utf8')).toContain('name: pdf')
    expect(await readFile(path.join(codexHome, 'skills', 'pdf', 'SKILL.md'), 'utf8')).toContain('name: pdf')
    await service.setTarget('pdf', 'codex', false)
    await expect(readFile(path.join(homedir, '.agents', 'skills', 'pdf', 'SKILL.md'), 'utf8')).rejects.toThrow()
    await expect(readFile(path.join(codexHome, 'skills', 'pdf', 'SKILL.md'), 'utf8')).rejects.toThrow()
    expect(await readFile(path.join(claudeHome, 'skills', 'pdf', 'SKILL.md'), 'utf8')).toContain('name: pdf')
    await service.setTarget('pdf', 'grok', true)
    expect(await readFile(path.join(homedir, '.grok', 'skills', 'pdf', 'SKILL.md'), 'utf8')).toContain('name: pdf')
    await service.setTarget('pdf', 'grok', false)
    await expect(readFile(path.join(homedir, '.grok', 'skills', 'pdf', 'SKILL.md'), 'utf8')).rejects.toThrow()
    expect(await readFile(path.join(claudeHome, 'skills', 'pdf', 'SKILL.md'), 'utf8')).toContain('name: pdf')
  })

  it('treats leftover ~/.codex/skills as orphans and writes both Codex roots on enable', async () => {
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
    expect(await readFile(path.join(codexHome, 'skills', 'legacy-pdf', 'SKILL.md'), 'utf8')).toContain('legacy-pdf')
  })

  it('clears updateAvailable after a single update when the catalog hash is stale', async () => {
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
    await service.install('pdf')
    const cachePath = skillsCachePath(userData)
    const cache = JSON.parse(await readFile(cachePath, 'utf8')) as {
      repos: Array<{ skills: Array<{ contentHash: string }> }>
    }
    const skill = cache.repos[0]?.skills[0]
    expect(skill).toBeDefined()
    if (skill) skill.contentHash = 'stale-catalog-hash'
    await writeFile(cachePath, `${JSON.stringify(cache)}\n`)
    expect((await service.list()).find((item) => item.name === 'pdf')?.updateAvailable).toBe(true)
    const updated = (await service.update('pdf')).find((item) => item.name === 'pdf')
    expect(updated?.installed).toBe(true)
    expect(updated?.updateAvailable).toBe(false)
  })

  it('imports a skill folder into SSOT without enabling CLI targets', async () => {
    const env = await tempSkillEnv()
    const sourceRoot = await mkdtemp(path.join(os.tmpdir(), 'stackferry-skill-import-'))
    const directory = await writeSkillDir(sourceRoot, 'pdf', 'Use when working with PDFs.')
    await writeFile(path.join(directory, 'notes.md'), 'keep extra files\n')
    const preview = await env.service.previewImport(directory)
    expect(preview).toEqual([
      expect.objectContaining({ name: 'pdf', directory, installed: false }),
    ])
    const imported = (await env.service.importDirectories([directory])).find((item) => item.name === 'pdf')
    expect(imported?.installed).toBe(true)
    expect(imported?.orphan).toBe(false)
    expect(imported?.appliedTo).toEqual([])
    expect(await readFile(path.join(skillsSsotRoot(env.userData), 'pdf', 'SKILL.md'), 'utf8')).toContain('name: pdf')
    expect(await readFile(path.join(skillsSsotRoot(env.userData), 'pdf', 'notes.md'), 'utf8')).toContain('keep extra files')
    await expect(readFile(path.join(env.claudeHome, 'skills', 'pdf', 'SKILL.md'), 'utf8')).rejects.toThrow()
    const again = await env.service.previewImport(directory)
    expect(again[0]?.installed).toBe(true)
    await env.service.importDirectories([directory])
    expect((await env.service.list()).filter((item) => item.name === 'pdf')).toHaveLength(1)
  })

  it('replaces a Claude skills copy with a link when importing from that folder', async () => {
    const env = await tempSkillEnv()
    const directory = await writeSkillDir(path.join(env.claudeHome, 'skills'), 'pdf', 'Use when working with PDFs.')
    const orphan = (await env.service.list()).find((item) => item.name === 'pdf')
    expect(orphan?.orphan).toBe(true)
    const imported = (await env.service.importDirectories([directory])).find((item) => item.name === 'pdf')
    expect(imported?.installed).toBe(true)
    expect(imported?.orphan).toBe(false)
    expect(imported?.appliedTo).toEqual(['claude'])
    expect(await readFile(path.join(skillsSsotRoot(env.userData), 'pdf', 'SKILL.md'), 'utf8')).toContain('name: pdf')
    expect(await readFile(path.join(env.claudeHome, 'skills', 'pdf', 'SKILL.md'), 'utf8')).toContain('name: pdf')
  })

  it('imports every immediate child skill from a parent folder', async () => {
    const env = await tempSkillEnv()
    const sourceRoot = await mkdtemp(path.join(os.tmpdir(), 'stackferry-skill-parent-'))
    const pdf = await writeSkillDir(sourceRoot, 'pdf', 'Use when working with PDFs.')
    const git = await writeSkillDir(sourceRoot, 'git', 'Use when working with git.')
    const preview = await env.service.previewImport(sourceRoot)
    expect(preview.map((item) => item.name).sort()).toEqual(['git', 'pdf'])
    const items = await env.service.importDirectories([pdf, git])
    expect(items.filter((item) => item.installed && (item.name === 'pdf' || item.name === 'git'))).toHaveLength(2)
  })

  it('rejects a folder that has no SKILL.md', async () => {
    const env = await tempSkillEnv()
    const empty = await mkdtemp(path.join(os.tmpdir(), 'stackferry-skill-empty-'))
    expect(await env.service.previewImport(empty)).toEqual([])
    await expect(env.service.importDirectories([empty])).rejects.toThrow(AppError)
  })
})

async function tempSkillEnv() {
  const userData = await mkdtemp(path.join(os.tmpdir(), 'stackferry-skill-user-'))
  const claudeHome = await mkdtemp(path.join(os.tmpdir(), 'stackferry-skill-claude-'))
  const homedir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-skill-home-'))
  const codexHome = await mkdtemp(path.join(os.tmpdir(), 'stackferry-skill-codex-'))
  return {
    userData,
    claudeHome,
    homedir,
    codexHome,
    service: new SkillService({
      userData,
      getClaudeHome: () => claudeHome,
      getCodexHome: () => codexHome,
      homedir: () => homedir,
    }),
  }
}

async function writeSkillDir(root: string, name: string, description: string): Promise<string> {
  const directory = path.join(root, name)
  await mkdir(directory, { recursive: true })
  await writeFile(
    path.join(directory, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\nBody.\n`,
  )
  return directory
}
