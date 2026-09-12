import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { changelogBodyForRoot, extractChangelogSection } from '../scripts/extract-changelog.mjs'

const sample = `# Changelog

intro

## 1.0.8 - 2026-09-12

### 修复

- keep tables

## 1.0.7 - 2026-09-11

- older
`

describe('extractChangelogSection', () => {
  it('returns the matching version section through the next heading', () => {
    expect(extractChangelogSection(sample, '1.0.8')).toBe(`## 1.0.8 - 2026-09-12

### 修复

- keep tables
`)
  })

  it('returns the last section through end of file', () => {
    expect(extractChangelogSection(sample, '1.0.7')).toBe(`## 1.0.7 - 2026-09-11

- older
`)
  })

  it('rejects a missing or empty version section', () => {
    expect(() => extractChangelogSection(sample, '1.0.9')).toThrow(/1\.0\.9/)
    expect(() => extractChangelogSection('# Changelog\n\n## 1.0.8\n\n', '1.0.8')).toThrow(/empty/)
  })
})

describe('changelogBodyForRoot', () => {
  it('reads the package version section from CHANGELOG.md', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'stackferry-changelog-'))
    await writeFile(path.join(root, 'package.json'), `${JSON.stringify({ version: '1.0.8' })}\n`)
    await writeFile(path.join(root, 'CHANGELOG.md'), sample)
    expect(changelogBodyForRoot(root)).toContain('keep tables')
    expect(changelogBodyForRoot(root)).not.toContain('older')
  })
})
