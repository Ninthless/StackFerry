import type { SkillTarget } from '../../../shared/skills'
import { grokSkillsRoot } from '../grok/home'
import { agentsSkillsRoot, claudeSkillsRoot, dshSkillsRoot, legacyCodexSkillsRoot } from './home'

export type SkillProjection = {
  target: SkillTarget
  roots: readonly string[]
}

export function skillProjections(input: {
  claudeHome: string
  codexHome: string
  grokHome: string
  homedir: string
  env: NodeJS.ProcessEnv
}): SkillProjection[] {
  return [
    { target: 'claude', roots: [claudeSkillsRoot(input.claudeHome)] },
    { target: 'codex', roots: [agentsSkillsRoot(input.homedir), legacyCodexSkillsRoot(input.codexHome)] },
    { target: 'grok', roots: [grokSkillsRoot(input.grokHome)] },
    { target: 'dsh', roots: [dshSkillsRoot(input.homedir, input.env)] },
  ]
}
