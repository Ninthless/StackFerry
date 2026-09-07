export function orderByIds<T extends { id: string }>(items: T[], ids: string[]): T[] | null {
  if (!Array.isArray(ids) || items.length !== ids.length) return null
  const remaining = new Set(items.map((item) => item.id))
  if (remaining.size !== items.length) return null
  const byId = new Map(items.map((item) => [item.id, item]))
  const next: T[] = []
  for (const id of ids) {
    if (typeof id !== 'string' || !remaining.delete(id)) return null
    const item = byId.get(id)
    if (!item) return null
    next.push(item)
  }
  return remaining.size === 0 ? next : null
}
