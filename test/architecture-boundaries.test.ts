import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

function walkFiles(dir: string, extensions: Set<string>, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'paraglide') continue
    const full = path.join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      walkFiles(full, extensions, acc)
      continue
    }
    if (extensions.has(path.extname(name))) acc.push(full)
  }
  return acc
}

function relative(file: string): string {
  return path.relative(ROOT, file).replaceAll('\\', '/')
}

function importSpecifiers(source: string): string[] {
  const specs: string[] = []
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specs.push(match[1] ?? '')
    }
  }
  return specs
}

describe('architecture boundaries', () => {
  it('keeps renderer code off Node and Electron main', () => {
    const files = walkFiles(path.join(ROOT, 'src'), new Set(['.ts', '.tsx']))
    const violations: string[] = []
    for (const file of files) {
      const rel = relative(file)
      for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
        if (spec.startsWith('node:') || spec === 'electron' || spec.startsWith('electron/')) {
          violations.push(`${rel} imports ${spec}`)
        }
        if (spec.includes('electron/main') || spec.startsWith('../../electron')) {
          violations.push(`${rel} imports ${spec}`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('keeps CLI workspaces from importing another CLI feature', () => {
    const pairs: Array<[string, string]> = [
      ['src/features/codex', 'features/claude'],
      ['src/features/codex', 'features/grok'],
      ['src/features/claude', 'features/codex'],
      ['src/features/claude', 'features/grok'],
      ['src/features/grok', 'features/codex'],
      ['src/features/grok', 'features/claude'],
    ]
    const violations: string[] = []
    for (const [dir, forbidden] of pairs) {
      const files = walkFiles(path.join(ROOT, dir), new Set(['.ts', '.tsx']))
      for (const file of files) {
        const rel = relative(file)
        const sibling = forbidden.slice('features/'.length)
        for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
          if (
            spec.includes(`/${forbidden}/`) ||
            spec.includes(`@/${forbidden}/`) ||
            spec.startsWith(`../${sibling}/`)
          ) {
            violations.push(`${rel} imports ${spec}`)
          }
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('keeps shared contracts off Electron', () => {
    const files = walkFiles(path.join(ROOT, 'shared'), new Set(['.ts']))
    const violations: string[] = []
    for (const file of files) {
      const rel = relative(file)
      for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
        if (spec.startsWith('electron') || spec.includes('electron/')) {
          violations.push(`${rel} imports ${spec}`)
        }
      }
    }
    expect(violations).toEqual([])
  })
})
