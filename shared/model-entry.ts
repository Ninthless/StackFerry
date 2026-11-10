export type ModelEntry = {
  id: string
}

export function modelEntry(id: string): ModelEntry {
  return { id }
}

export function normalizeModelEntries(raw: readonly unknown[] | undefined): ModelEntry[] {
  const seen = new Set<string>()
  const result: ModelEntry[] = []
  for (const item of raw ?? []) {
    const entry = readModelEntry(item)
    if (!entry || seen.has(entry.id)) continue
    seen.add(entry.id)
    result.push(entry)
  }
  return result
}

export function modelEntryIds(entries: readonly ModelEntry[]): string[] {
  return entries.map((entry) => entry.id)
}

export function modelEntriesFromIds(
  ids: readonly string[],
  previous: readonly ModelEntry[] = [],
): ModelEntry[] {
  const known = new Map(previous.map((entry) => [entry.id, entry]))
  return normalizeModelEntries(
    ids.map((id) => {
      const trimmed = id.trim()
      const previousEntry = known.get(trimmed)
      return previousEntry ?? modelEntry(trimmed)
    }),
  )
}

function readModelEntry(item: unknown): ModelEntry | null {
  if (typeof item === 'string') {
    const id = item.trim()
    return id ? modelEntry(id) : null
  }
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const row = item as Record<string, unknown>
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  if (!id) return null
  return modelEntry(id)
}
