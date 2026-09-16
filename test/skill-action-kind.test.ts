import { describe, expect, it } from 'vitest'
import type { SkillListItem, SkillRepo } from '../shared/skills'
import { isRepoListResult, isSkillListResult } from '../src/features/skills/action-kind'

const skill: SkillListItem = {
  id: 'pdf',
  name: 'pdf',
  description: '',
  installed: false,
  orphan: false,
  appliedTo: [],
  updateAvailable: false,
  origin: null,
  repoLabel: null,
}

const repo: SkillRepo = {
  id: 'XC881/xc881-skills@main',
  owner: 'XC881',
  name: 'xc881-skills',
  branch: 'main',
  subdirectory: '',
}

describe('skills action result kind', () => {
  it('does not treat an empty list as repositories', () => {
    expect(isRepoListResult([])).toBe(false)
    expect(isSkillListResult([])).toBe(false)
  })

  it('classifies a skill catalog, including uninstalled items', () => {
    expect(isSkillListResult([skill])).toBe(true)
    expect(isRepoListResult([skill])).toBe(false)
  })

  it('classifies a repository list', () => {
    expect(isRepoListResult([repo])).toBe(true)
    expect(isSkillListResult([repo])).toBe(false)
  })

  it('reloads when the action returns nothing', () => {
    expect(isSkillListResult(undefined)).toBe(false)
    expect(isRepoListResult(undefined)).toBe(false)
  })
})
