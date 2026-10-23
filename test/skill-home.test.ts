import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  agentsSkillsRoot,
  claudeSkillsRoot,
  dshSkillsRoot,
  legacyCodexSkillsRoot,
  skillSsotDirectory,
  skillsSsotRoot,
} from '../electron/main/skills/home'
import { skillProjections } from '../electron/main/skills/projections'
import { grokSkillsRoot } from '../electron/main/grok/home'

describe('skill paths', () => {
  it('keeps SSOT under userData, not ~/.agents/skills', () => {
    const userData = path.join(os.tmpdir(), 'stackferry-user')
    expect(skillsSsotRoot(userData)).toBe(path.join(userData, 'skills'))
    expect(skillSsotDirectory(userData, 'pdf')).toBe(path.join(userData, 'skills', 'pdf'))
    expect(skillsSsotRoot(userData)).not.toBe(agentsSkillsRoot('/home/demo'))
  })

  it('maps Claude and both Codex user-level targets', () => {
    const home = os.platform() === 'win32' ? 'C:\\Users\\demo' : '/home/demo'
    expect(claudeSkillsRoot(path.join(home, '.claude'))).toBe(path.join(home, '.claude', 'skills'))
    expect(agentsSkillsRoot(home)).toBe(path.join(home, '.agents', 'skills'))
    expect(legacyCodexSkillsRoot(path.join(home, '.codex'))).toBe(path.join(home, '.codex', 'skills'))
    expect(grokSkillsRoot(path.join(home, '.grok'))).toBe(path.join(home, '.grok', 'skills'))
    expect(dshSkillsRoot(home, {})).toBe(path.join(home, '.dsh', 'skills'))
    expect(dshSkillsRoot(home, { DSH_HOME: '  ' })).toBe(path.join(home, '.dsh', 'skills'))
    expect(dshSkillsRoot(home, { DSH_HOME: path.join(home, 'custom-dsh') })).toBe(
      path.join(home, 'custom-dsh', 'skills'),
    )
  })

  it('keeps each skill target on one projection entry', () => {
    const home = os.platform() === 'win32' ? 'C:\\Users\\demo' : '/home/demo'
    const projections = skillProjections({
      claudeHome: path.join(home, '.claude'),
      codexHome: path.join(home, '.codex'),
      grokHome: path.join(home, '.grok'),
      homedir: home,
      env: {},
    })
    expect(projections.map((item) => item.target)).toEqual(['claude', 'codex', 'grok', 'dsh'])
    expect(projections.find((item) => item.target === 'codex')?.roots).toEqual([
      path.join(home, '.agents', 'skills'),
      path.join(home, '.codex', 'skills'),
    ])
    expect(projections.find((item) => item.target === 'dsh')?.roots).toEqual([path.join(home, '.dsh', 'skills')])
  })
})
