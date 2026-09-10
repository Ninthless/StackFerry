import { AppError } from './app-error'

// 自有公告源，必须是 https://。部署 noticeboard 后填
// https://<host>/v1/apps/stackferry/announcements.json ；留空则不拉取。
export const APP_ANNOUNCEMENTS_URL = 'https://notice.ninthless.top/v1/apps/stackferry/announcements.json'
export const ANNOUNCEMENTS_PAGE_SIZE = 20

export const APP_UPDATE_PHASES = [
  'idle',
  'checking',
  'upToDate',
  'available',
  'downloading',
  'ready',
  'unsupported',
  'unpackaged',
] as const

export type AppUpdatePhase = (typeof APP_UPDATE_PHASES)[number]

export type AppRelease = {
  id: string
  tag: string
  title: string
  body: string
  htmlUrl: string
  publishedAt: string | null
  prerelease: boolean
}

export type AnnouncementItem = AppRelease & {
  unread: boolean
}

export type AnnouncementSnapshot = {
  items: AnnouncementItem[]
  unreadCount: number
}

export type AppUpdateStatus = {
  phase: AppUpdatePhase
  currentVersion: string
  availableVersion: string | null
  releaseNotes: string | null
  downloadedBytes: number
  totalBytes: number
}

export function isAnnouncementFeedUrl(url: string): boolean {
  return url.startsWith('https://')
}

export function parseAnnouncementFeed(payload: unknown): AppRelease[] {
  if (!Array.isArray(payload)) throw new AppError('announcement_invalid')
  const items: AppRelease[] = []
  const seen = new Set<string>()
  for (const entry of payload) {
    if (items.length >= ANNOUNCEMENTS_PAGE_SIZE) break
    const parsed = parseAnnouncementEntry(entry)
    if (!parsed || seen.has(parsed.id)) continue
    seen.add(parsed.id)
    items.push(parsed)
  }
  return items
}

function parseAnnouncementEntry(entry: unknown): AppRelease | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
  const row = entry as Record<string, unknown>
  const rawId = row.id
  const id =
    typeof rawId === 'number' && Number.isFinite(rawId)
      ? String(rawId)
      : typeof rawId === 'string'
        ? rawId.trim()
        : ''
  if (!id) return null
  const rawHtmlUrl = typeof row.htmlUrl === 'string' ? row.htmlUrl.trim() : ''
  const htmlUrl = rawHtmlUrl && isAnnouncementFeedUrl(rawHtmlUrl) ? rawHtmlUrl : ''
  const title = typeof row.title === 'string' ? row.title.trim() : ''
  const tag = typeof row.tag === 'string' ? row.tag.trim() : ''
  return {
    id,
    tag,
    title: title || tag || id,
    body: typeof row.body === 'string' ? row.body : '',
    htmlUrl,
    publishedAt: typeof row.publishedAt === 'string' && row.publishedAt.trim() ? row.publishedAt : null,
    prerelease: row.prerelease === true,
  }
}

export function announcementIdentity(item: Pick<AppRelease, 'id' | 'publishedAt'>): string {
  return item.publishedAt ? `${item.id}@${item.publishedAt}` : item.id
}

export function formatAnnouncementPublishedAt(publishedAt: string | null): string {
  if (!publishedAt) return ''
  const stamped = publishedAt.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/)
  if (stamped) return `${stamped[1]} ${stamped[2]}`
  const date = new Date(publishedAt)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())} ${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`
}

export function announcementSnapshot(items: AppRelease[], seenIds: ReadonlySet<string>): AnnouncementSnapshot {
  const listed = items.map((item) => ({ ...item, unread: !seenIds.has(announcementIdentity(item)) }))
  return {
    items: listed,
    unreadCount: listed.filter((item) => item.unread).length,
  }
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0')
}

export function unreadAnnouncements(snapshot: AnnouncementSnapshot): AnnouncementItem[] {
  return snapshot.items.filter((item) => item.unread)
}

export function latestUnreadAnnouncement(snapshot: AnnouncementSnapshot): AnnouncementItem | null {
  return unreadAnnouncements(snapshot)[0] ?? null
}

export function nextUnreadAnnouncement(
  snapshot: AnnouncementSnapshot,
  currentId: string,
): AnnouncementItem | null {
  const unread = unreadAnnouncements(snapshot)
  const index = unread.findIndex((item) => item.id === currentId)
  if (index < 0) return null
  return unread[index + 1] ?? null
}

export function emptyAnnouncementSnapshot(): AnnouncementSnapshot {
  return { items: [], unreadCount: 0 }
}

export function isPackagedUpdatePlatform(platform: string): boolean {
  return platform === 'win32' || platform === 'linux'
}

export function initialAppUpdateStatus(
  currentVersion: string,
  packaged: boolean,
  platform: string,
): AppUpdateStatus {
  return {
    phase: packaged ? (isPackagedUpdatePlatform(platform) ? 'idle' : 'unsupported') : 'unpackaged',
    currentVersion,
    availableVersion: null,
    releaseNotes: null,
    downloadedBytes: 0,
    totalBytes: 0,
  }
}

// electron-updater's GitHub provider returns rendered HTML (or a versioned note
// array). The UI shows release notes as plain text, so normalize at the feed.
export function normalizeAppReleaseNotes(notes: unknown): string | null {
  if (typeof notes === 'string') return plainReleaseNotes(notes)
  if (!Array.isArray(notes)) return null
  const parts: string[] = []
  for (const entry of notes) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const row = entry as Record<string, unknown>
    const version = typeof row.version === 'string' ? row.version.trim() : ''
    const note = typeof row.note === 'string' ? plainReleaseNotes(row.note) : null
    if (!note) continue
    parts.push(version ? `${version}\n${note}` : note)
  }
  return parts.length > 0 ? parts.join('\n\n') : null
}

function plainReleaseNotes(raw: string): string | null {
  const text = decodeHtmlEntities(
    raw
      .replace(/\r\n?/g, '\n')
      .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text || null
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
}
