import { describe, expect, it } from 'vitest'
import { AppError } from '../shared/app-error'
import { parseSkillMarkdown, serializeSkillMarkdown } from '../electron/main/skills/parse'
import { isSkillName, requireSkillName } from '../shared/skills'

describe('skill markdown', () => {
  it('parses name, description, and body', () => {
    const document = parseSkillMarkdown(
      '---\nname: pdf\ndescription: Use when working with PDFs.\n---\n\n# PDF\nRead the file.\n',
    )
    expect(document).toEqual({
      name: 'pdf',
      description: 'Use when working with PDFs.',
      body: '# PDF\nRead the file.\n',
    })
  })

  it('parses block scalar descriptions', () => {
    const document = parseSkillMarkdown(
      '---\nname: pdf\ndescription: |\n  First line.\n  Second line.\n---\n\nBody\n',
    )
    expect(document.description).toBe('First line.\nSecond line.')
  })

  it('rejects missing frontmatter', () => {
    expect(() => parseSkillMarkdown('# just markdown')).toThrow(AppError)
  })

  it('round-trips through serialize', () => {
    const source = {
      name: 'pdf',
      description: 'Use when working with PDFs.',
      body: 'Do the work.\n',
    }
    expect(parseSkillMarkdown(serializeSkillMarkdown(source))).toMatchObject(source)
  })
})

describe('skill names', () => {
  it('accepts hyphenated lowercase names', () => {
    expect(isSkillName('pdf')).toBe(true)
    expect(isSkillName('gh-fix-ci')).toBe(true)
    expect(requireSkillName('gh-fix-ci')).toBe('gh-fix-ci')
  })

  it('rejects uppercase, spaces, and edge hyphens', () => {
    expect(isSkillName('PDF')).toBe(false)
    expect(isSkillName('-pdf')).toBe(false)
    expect(isSkillName('pdf-')).toBe(false)
    expect(isSkillName('pdf skill')).toBe(false)
  })
})
