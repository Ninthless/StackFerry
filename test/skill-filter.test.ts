import { describe, expect, it } from 'vitest'
import type { SkillListItem } from '../shared/skills'
import { filterSkills } from '../src/features/skills/filter'

function skill(partial: Partial<SkillListItem> & Pick<SkillListItem, 'id' | 'name'>): SkillListItem {
  return {
    description: '',
    installed: false,
    orphan: false,
    appliedTo: [],
    updateAvailable: false,
    origin: null,
    repoLabel: null,
    ...partial,
  }
}

describe('skill marketplace filters', () => {
  const catalog = [
    skill({
      id: 'pdf',
      name: 'pdf',
      installed: true,
      updateAvailable: true,
      origin: { owner: 'anthropics', repo: 'skills', branch: 'main', subdirectory: 'skills', skillPath: 'skills/pdf' },
      repoLabel: 'anthropics/skills',
    }),
    skill({
      id: 'xlsx',
      name: 'xlsx',
      origin: { owner: 'anthropics', repo: 'skills', branch: 'main', subdirectory: 'skills', skillPath: 'skills/xlsx' },
      repoLabel: 'anthropics/skills',
    }),
    skill({
      id: 'local-note',
      name: 'local-note',
      installed: true,
    }),
    skill({
      id: 'orphan-note',
      name: 'orphan-note',
      orphan: true,
    }),
  ]

  it('keeps local skills on the local pane and catalog skills on the market pane', () => {
    expect(
      filterSkills({ skills: catalog, pane: 'local', query: '', status: 'all', repoId: 'all' }).map((item) => item.id),
    ).toEqual(['pdf', 'local-note', 'orphan-note'])
    expect(
      filterSkills({ skills: catalog, pane: 'market', query: '', status: 'all', repoId: 'all' }).map((item) => item.id),
    ).toEqual(['pdf', 'xlsx'])
  })

  it('filters marketplace skills by status and repository', () => {
    expect(
      filterSkills({
        skills: catalog,
        pane: 'market',
        query: '',
        status: 'available',
        repoId: 'all',
      }).map((item) => item.id),
    ).toEqual(['xlsx'])
    expect(
      filterSkills({
        skills: catalog,
        pane: 'market',
        query: '',
        status: 'updates',
        repoId: 'anthropics/skills@main:skills',
      }).map((item) => item.id),
    ).toEqual(['pdf'])
  })
})
