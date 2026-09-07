import { AppError } from '../../../shared/app-error'
import {
  requireSkillDescription,
  requireSkillName,
  type SkillDocument,
} from '../../../shared/skills'

export function parseSkillMarkdown(text: string): SkillDocument {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) throw new AppError('skill_document_invalid')
  const fields = parseYamlScalars(match[1])
  return {
    name: requireSkillName(fields.name ?? ''),
    description: requireSkillDescription(fields.description ?? ''),
    body: match[2].replace(/^\r?\n/, ''),
  }
}

export function serializeSkillMarkdown(document: SkillDocument): string {
  const name = requireSkillName(document.name)
  const description = requireSkillDescription(document.description)
  const body = document.body.replace(/^\r?\n/, '')
  return `---\nname: ${name}\ndescription: ${yamlQuote(description)}\n---\n\n${body}`
}

function yamlQuote(value: string): string {
  if (/^[A-Za-z0-9][A-Za-z0-9 .,_-]*$/.test(value) && !value.includes(': ')) return value
  return JSON.stringify(value)
}

function parseYamlScalars(block: string): Record<string, string> {
  const result: Record<string, string> = {}
  const lines = block.split(/\r?\n/)
  let index = 0
  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (!line.trim() || line.trimStart().startsWith('#')) {
      index += 1
      continue
    }
    const matched = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!matched) {
      index += 1
      continue
    }
    const key = matched[1] ?? ''
    const rest = matched[2] ?? ''
    if (rest === '|' || rest === '>' || rest === '|-' || rest === '>-') {
      const collected: string[] = []
      index += 1
      while (index < lines.length) {
        const nested = lines[index] ?? ''
        if (nested.trim() === '') {
          collected.push('')
          index += 1
          continue
        }
        if (!/^[ \t]/.test(nested)) break
        collected.push(nested.replace(/^[ \t]+/, ''))
        index += 1
      }
      result[key] = collected.join('\n').trim()
      continue
    }
    result[key] = unquote(rest)
    index += 1
  }
  return result
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    try {
      if (trimmed.startsWith('"')) return JSON.parse(trimmed) as string
    } catch {
      return trimmed.slice(1, -1)
    }
    return trimmed.slice(1, -1)
  }
  return trimmed
}
