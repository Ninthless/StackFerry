import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function extractChangelogSection(markdown, version) {
  const trimmed = version.trim()
  if (!trimmed) throw new Error('changelog version is empty')
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const heading = new RegExp(`^## ${escaped}(?:\\s|$)`, 'm')
  const match = heading.exec(markdown)
  if (!match) throw new Error(`CHANGELOG.md has no section for ${trimmed}`)
  const start = match.index
  const rest = markdown.slice(start + match[0].length)
  const next = /^## /m.exec(rest)
  const section = (next ? markdown.slice(start, start + match[0].length + next.index) : markdown.slice(start)).trim()
  const body = section.split('\n').slice(1).join('\n').trim()
  if (!body) throw new Error(`CHANGELOG.md section for ${trimmed} is empty`)
  return `${section}\n`
}

export function changelogBodyForRoot(root) {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  const version = typeof pkg.version === 'string' ? pkg.version : ''
  const markdown = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
  return extractChangelogSection(markdown, version)
}

function invokedDirectly() {
  const self = fileURLToPath(import.meta.url)
  const argvPath = process.argv[1]
  if (!argvPath) return false
  return path.resolve(argvPath) === self
}

if (invokedDirectly()) {
  const out = process.argv[2] || 'release-notes.md'
  writeFileSync(out, changelogBodyForRoot(process.cwd()))
}
