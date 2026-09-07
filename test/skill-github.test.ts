import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { AppError } from '../shared/app-error'
import {
  assertGithubArchiveUrl,
  githubArchiveUrl,
  normalizeSkillRepo,
  skillRepo,
} from '../shared/skills'
import { discoverSkills, unzipSkillArchive } from '../electron/main/skills/github'
import { assertSafeZipEntry } from '../electron/main/skills/safe-path'

const sampleMarkdown = '---\nname: pdf\ndescription: Use when working with PDFs.\n---\n\nRead PDFs.\n'

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
})
