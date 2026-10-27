import type { SkillTarget } from '../../../shared/skills'
import { grokSkillsRoot } from '../grok/home'
import { piSkillsRoot } from '../pi/home'
import { agentsSkillsRoot, claudeSkillsRoot, dshSkillsRoot, legacyCodexSkillsRoot } from './home'

export type SkillProjection = {
  target: SkillTarget
  roots: readonly string[]
}

export function skillProjections(input: {
  claudeHome: string
  codexHome: string
  grokHome: string
  piHome: string
  homedir: string
  env: NodeJS.ProcessEnv
}): SkillProjection[] {
  return [
    { target: 'claude', roots: [claudeSkillsRoot(input.claudeHome)] },
    { target: 'codex', roots: [agentsSkillsRoot(input.homedir), legacyCodexSkillsRoot(input.codexHome)] },
    { target: 'grok', roots: [grokSkillsRoot(input.grokHome)] },
    { target: 'dsh', roots: [dshSkillsRoot(input.homedir, input.env)] },
    { target: 'pi', roots: [piSkillsRoot(input.piHome)] },
  ]
}
