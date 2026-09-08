import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  agentsSkillsRoot,
  claudeSkillsRoot,
  legacyCodexSkillsRoot,
  skillSsotDirectory,
  skillsSsotRoot,
} from '../electron/main/skills/home'
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
  })
})
