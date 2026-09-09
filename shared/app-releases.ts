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

export function announcementSnapshot(items: AppRelease[], seenIds: ReadonlySet<string>): AnnouncementSnapshot {
  const listed = items.map((item) => ({ ...item, unread: !seenIds.has(item.id) }))
  return {
    items: listed,
    unreadCount: listed.filter((item) => item.unread).length,
  }
}

export function unreadAnnouncements(snapshot: AnnouncementSnapshot): AnnouncementItem[] {
  return snapshot.items.filter((item) => item.unread)
}

export function latestUnreadAnnouncement(snapshot: AnnouncementSnapshot): AnnouncementItem | null {
  return unreadAnnouncements(snapshot)[0] ?? null
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
