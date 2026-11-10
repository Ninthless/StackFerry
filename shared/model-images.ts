const TAG_PAIRS = [
  ['(', ')'],
  ['[', ']'],
  ['（', '）'],
  ['【', '】'],
  ['「', '」'],
] as const

const BEDROCK_GEOS = ['global.', 'us-gov.', 'us.', 'eu.', 'apac.', 'jp.', 'au.', 'ca.', 'in.']
const CHANNEL_PREFIX = /^[a-z]{2,24}-/

export function seesImages(id: string, images: ReadonlyMap<string, boolean>): boolean {
  return lookup(id, images) === true
}

export function imageVotes(providers: readonly { models?: unknown }[]): Map<string, boolean> {
  const yes = new Map<string, number>()
  const no = new Map<string, number>()
  for (const provider of providers) {
    if (!provider.models || typeof provider.models !== 'object' || Array.isArray(provider.models)) continue
    for (const [id, model] of Object.entries(provider.models)) {
      const bare = bareId(id)
      if (!bare) continue
      const bucket = modelSeesImages(model) ? yes : no
      bucket.set(bare, (bucket.get(bare) ?? 0) + 1)
    }
  }
  return new Map(
    [...yes].flatMap(([id, vote]) => (vote > (no.get(id) ?? 0) ? [[id, true] as const] : [])),
  )
}

function lookup(id: string, images: ReadonlyMap<string, boolean>): boolean | undefined {
  const bare = bareId(id)
  const found = lookupFound(bare, images)
  if (found !== undefined) return found
  const unmarked = withoutWindowMark(bare)
  if (unmarked !== bare) {
    const foundUnmarked = lookupFound(unmarked, images)
    if (foundUnmarked !== undefined) return foundUnmarked
  }
  const untagged = withoutTag(unmarked)
  if (untagged && images.has(untagged)) return true
  for (const candidate of aliases(unmarked)) {
    if (images.has(candidate)) return true
  }
  return undefined
}

function lookupFound(id: string, images: ReadonlyMap<string, boolean>): boolean | undefined {
  if (images.has(id)) return true
  for (const geo of BEDROCK_GEOS) {
    if (!id.startsWith(geo)) continue
    const rest = id.slice(geo.length)
    if (rest.includes('.')) return lookupFound(rest, images)
  }
  const effort = id.indexOf('(')
  if (effort > 0 && id.endsWith(')')) return lookupFound(id.slice(0, effort), images)
  const variant = id.indexOf(':')
  if (variant > 0) return images.has(id.slice(0, variant)) ? true : undefined
  return undefined
}

function aliases(id: string): string[] {
  const found: string[] = []
  if (id.startsWith('claude-') && /\d/.test(id.slice('claude-'.length))) found.push(id.slice('claude-'.length))
  const channel = CHANNEL_PREFIX.exec(id)
  const rest = channel ? id.slice(channel[0].length) : ''
  if (rest && /\d/.test(rest)) found.push(rest)
  return found
}

function modelSeesImages(model: unknown): boolean {
  if (!model || typeof model !== 'object' || Array.isArray(model)) return false
  const modalities = (model as { modalities?: { input?: unknown } }).modalities?.input
  return Array.isArray(modalities) && modalities.some(isImageModality)
}

function isImageModality(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const kind = value.trim().toLowerCase()
  const slash = kind.indexOf('/')
  const media = slash === -1 ? kind : kind.slice(0, slash)
  return media === 'image'
}

function bareId(id: string): string {
  const trimmed = id.trim().toLowerCase()
  const slash = trimmed.lastIndexOf('/')
  return slash === -1 ? trimmed : trimmed.slice(slash + 1)
}

function withoutWindowMark(id: string): string {
  if (!id.endsWith(']')) return id
  const mark = id.lastIndexOf('[')
  if (mark <= 0 || !/^\d+(?:\.\d+)?[km]$/.test(id.slice(mark + 1, -1))) return id
  return id.slice(0, mark)
}

function withoutTag(id: string): string {
  for (const [open, close] of TAG_PAIRS) {
    if (!id.endsWith(close)) continue
    const start = id.lastIndexOf(open)
    if (start <= 0 || (open === '[' && id[start - 1] !== ' ')) continue
    const next = id.slice(0, start).trim().replace(/[-_·.]+$/u, '')
    return /\p{L}/u.test(next) ? next : ''
  }
  return ''
}
