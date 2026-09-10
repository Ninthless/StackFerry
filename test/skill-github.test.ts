import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { AppError } from '../shared/app-error'
import {
  assertGithubArchiveUrl,
  DEFAULT_SKILL_REPOS,
  githubArchiveUrl,
  normalizeSkillRepo,
  parseSkillRepoInput,
  pinPreferredSkillRepo,
  skillRepo,
} from '../shared/skills'
import { discoverSkills, unzipSkillArchive } from '../electron/main/skills/github'
import { assertSafeZipEntry } from '../electron/main/skills/safe-path'

const sampleMarkdown = '---\nname: pdf\ndescription: Use when working with PDFs.\n---\n\nRead PDFs.\n'

describe('default skill repos', () => {
  it('lists Ninthless/agent-skills first', () => {
    expect(DEFAULT_SKILL_REPOS[0]).toEqual(skillRepo('Ninthless', 'agent-skills', 'main'))
  })

  it('moves the preferred default repo to the front without dropping others', () => {
    const anthropic = skillRepo('anthropics', 'skills', 'main')
    const extra = skillRepo('acme', 'extra', 'main')
    expect(pinPreferredSkillRepo([anthropic, extra])).toEqual([
      skillRepo('Ninthless', 'agent-skills', 'main'),
      anthropic,
      extra,
    ])
  })
})

describe('github archive urls', () => {
  it('only allows github.com heads zip archives', () => {
    const repo = skillRepo('anthropics', 'skills', 'main')
    const url = githubArchiveUrl(repo)
    expect(url).toBe('https://github.com/anthropics/skills/archive/refs/heads/main.zip')
    expect(() => assertGithubArchiveUrl(url, repo)).not.toThrow()
    expect(() => assertGithubArchiveUrl('https://evil.example/archive.zip', repo)).toThrow(AppError)
    expect(() =>
      assertGithubArchiveUrl('https://github.com/anthropics/skills/releases/download/v1/evil.zip', repo),
    ).toThrow(AppError)
  })

  it('rejects unsafe repo coordinates', () => {
    expect(() => normalizeSkillRepo({ owner: '../x', name: 'skills' })).toThrow(AppError)
    expect(() => normalizeSkillRepo({ owner: 'acme', name: 'skills', branch: 'main/../other' })).toThrow(
      AppError,
    )
  })

  it('parses GitHub repository URLs, remotes, and owner/name shorthand', () => {
    expect(parseSkillRepoInput('https://github.com/anthropics/skills')).toEqual(
      skillRepo('anthropics', 'skills', 'main'),
    )
    expect(parseSkillRepoInput('https://github.com/anthropics/skills.git')).toEqual(
      skillRepo('anthropics', 'skills', 'main'),
    )
    expect(parseSkillRepoInput('https://www.github.com/anthropics/skills/')).toEqual(
      skillRepo('anthropics', 'skills', 'main'),
    )
    expect(parseSkillRepoInput('github.com/anthropics/skills/tree/main/skills')).toEqual(
      skillRepo('anthropics', 'skills', 'main', 'skills'),
    )
    expect(parseSkillRepoInput('https://github.com/acme/skills/blob/main/skills/pdf/SKILL.md')).toEqual(
      skillRepo('acme', 'skills', 'main', 'skills/pdf'),
    )
    expect(parseSkillRepoInput('git@github.com:anthropics/skills.git')).toEqual(
      skillRepo('anthropics', 'skills', 'main'),
    )
    expect(parseSkillRepoInput('anthropics/skills@master')).toEqual(skillRepo('anthropics', 'skills', 'master'))
    expect(() => parseSkillRepoInput('https://gitlab.com/acme/skills')).toThrow(AppError)
    expect(() => parseSkillRepoInput('https://github.com/anthropics')).toThrow(AppError)
  })
})

describe('zip extraction', () => {
  it('rejects zip-slip paths', () => {
    expect(() => assertSafeZipEntry('../evil.txt')).toThrow(AppError)
    expect(() => assertSafeZipEntry('/tmp/evil.txt')).toThrow(AppError)
    expect(() => assertSafeZipEntry('C:/Windows/evil.txt')).toThrow(AppError)
    expect(() => unzipSkillArchive(zipSync({ '../evil.txt': strToU8('nope') }))).toThrow(AppError)
  })

  it('discovers SKILL.md folders after stripping the GitHub root', () => {
    const bytes = zipSync({
      'skills-main/skills/pdf/SKILL.md': strToU8(sampleMarkdown),
      'skills-main/skills/pdf/scripts/run.sh': strToU8('echo hi\n'),
      'skills-main/README.md': strToU8('# repo\n'),
    })
    const skills = discoverSkills(unzipSkillArchive(bytes), 'skills')
    expect(skills).toHaveLength(1)
    expect(skills[0]?.name).toBe('pdf')
    expect(skills[0]?.files.has('SKILL.md')).toBe(true)
    expect(skills[0]?.files.has('scripts/run.sh')).toBe(true)
  })

  it('drops zip directory markers so nested skill files can be written', () => {
    const bytes = zipSync({
      'skills-main/english-spec-first/SKILL.md': strToU8(sampleMarkdown.replaceAll('pdf', 'english-spec-first')),
      'skills-main/english-spec-first/agents/': new Uint8Array(),
      'skills-main/english-spec-first/agents': new Uint8Array(),
      'skills-main/english-spec-first/agents/openai.yaml': strToU8('name: openai\n'),
    })
    const skills = discoverSkills(unzipSkillArchive(bytes))
    expect(skills).toHaveLength(1)
    expect(skills[0]?.files.has('agents')).toBe(false)
    expect(skills[0]?.files.has('agents/openai.yaml')).toBe(true)
  })
})
