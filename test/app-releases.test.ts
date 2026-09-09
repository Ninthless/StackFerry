import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AppError } from '../shared/app-error'
import {
  announcementSnapshot,
  initialAppUpdateStatus,
  isAnnouncementFeedUrl,
  latestUnreadAnnouncement,
  parseAnnouncementFeed,
} from '../shared/app-releases'
import electronUpdater from 'electron-updater'
import { fetchAnnouncementFeed } from '../electron/main/releases/feed'
import { AppReleaseService } from '../electron/main/releases/service'
import { AnnouncementStore } from '../electron/main/releases/store'
import type { AppUpdateFeed } from '../electron/main/releases/updater'

const sampleAnnouncement = {
  id: '42',
  title: 'Gateway notice',
  body: 'Notes',
  htmlUrl: 'https://example.com/notice',
  publishedAt: '2026-09-01T00:00:00Z',
}

describe('electron-updater module', () => {
  it('exposes NsisUpdater on the CommonJS default export', () => {
    expect(typeof electronUpdater.NsisUpdater).toBe('function')
    expect('autoUpdater' in electronUpdater).toBe(true)
  })
})

describe('announcement feed parsing', () => {
  it('accepts https feed URLs only', () => {
    expect(isAnnouncementFeedUrl('https://example.com/announcements.json')).toBe(true)
    expect(isAnnouncementFeedUrl('http://example.com/announcements.json')).toBe(false)
    expect(isAnnouncementFeedUrl('')).toBe(false)
  })

  it('keeps valid entries and skips unsafe or duplicate ids', () => {
    const items = parseAnnouncementFeed([
      sampleAnnouncement,
      { ...sampleAnnouncement, id: '1', htmlUrl: 'http://evil.example/notice' },
      { ...sampleAnnouncement, id: '42', title: 'dup' },
      { id: 3, body: null },
    ])
    expect(items).toEqual([
      {
        id: '42',
        tag: '',
        title: 'Gateway notice',
        body: 'Notes',
        htmlUrl: 'https://example.com/notice',
        publishedAt: '2026-09-01T00:00:00Z',
        prerelease: false,
      },
      {
        id: '3',
        tag: '',
        title: '3',
        body: '',
        htmlUrl: '',
        publishedAt: null,
        prerelease: false,
      },
    ])
  })

  it('rejects a non-array payload', () => {
    expect(() => parseAnnouncementFeed({ message: 'no' })).toThrow(AppError)
  })

  it('marks unseen ids unread', () => {
    const items = parseAnnouncementFeed([sampleAnnouncement])
    expect(announcementSnapshot(items, new Set()).unreadCount).toBe(1)
    expect(announcementSnapshot(items, new Set(['42'])).unreadCount).toBe(0)
  })

  it('returns the first unread announcement', () => {
    const items = parseAnnouncementFeed([
      sampleAnnouncement,
      { ...sampleAnnouncement, id: '41', title: 'Older' },
    ])
    expect(latestUnreadAnnouncement(announcementSnapshot(items, new Set()))?.id).toBe('42')
    expect(latestUnreadAnnouncement(announcementSnapshot(items, new Set(['42'])))?.id).toBe('41')
    expect(latestUnreadAnnouncement(announcementSnapshot(items, new Set(['42', '41'])))).toBeNull()
  })
})

describe('announcement feed fetch', () => {
  const feedUrl = 'https://example.com/announcements.json'

  it('returns an empty list when the feed URL is unset', async () => {
    await expect(fetchAnnouncementFeed('', async () => new Response('no'))).resolves.toEqual([])
  })

  it('sends JSON accept headers and returns JSON', async () => {
    const payload = [sampleAnnouncement]
    const fetchImpl: typeof fetch = async (input, init) => {
      expect(String(input)).toBe(feedUrl)
      expect(init?.headers).toMatchObject({
        Accept: 'application/json',
        'User-Agent': 'StackFerry',
      })
      return new Response(JSON.stringify(payload), { status: 200 })
    }
    await expect(fetchAnnouncementFeed(feedUrl, fetchImpl)).resolves.toEqual(payload)
  })

  it('maps HTTP, invalid, and timeout failures', async () => {
    const notFound: typeof fetch = async () => new Response('no', { status: 404 })
    await expect(fetchAnnouncementFeed(feedUrl, notFound)).rejects.toMatchObject({
      code: 'announcement_http',
    })
    await expect(fetchAnnouncementFeed('http://example.com/a.json')).rejects.toMatchObject({
      code: 'announcement_invalid',
    })
    const aborted: typeof fetch = async () => {
      const error = new Error('aborted')
      error.name = 'AbortError'
      throw error
    }
    await expect(fetchAnnouncementFeed(feedUrl, aborted)).rejects.toMatchObject({
      code: 'announcement_timeout',
    })
    const offline: typeof fetch = async () => {
      throw new TypeError('fetch failed')
    }
    await expect(fetchAnnouncementFeed(feedUrl, offline)).rejects.toMatchObject({
      code: 'announcement_http',
    })
  })
})

describe('announcement store', () => {
  it('seeds existing ids as read on first fetch', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-announcements-'))
    const store = new AnnouncementStore(path.join(dir, 'announcements.json'))
    await store.seedIfEmpty(['42', '43'])
    expect(await store.seenIds()).toEqual(new Set(['42', '43']))
    await store.seedIfEmpty(['99'])
    expect(await store.seenIds()).toEqual(new Set(['42', '43']))
    await store.markRead(['99'])
    expect(await store.seenIds()).toEqual(new Set(['42', '43', '99']))
  })

  it('recovers from corrupt files', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-announcements-'))
    const file = path.join(dir, 'announcements.json')
    await writeFile(file, '{not json')
    const store = new AnnouncementStore(file)
    expect(await store.seenIds()).toEqual(new Set())
    await store.markRead(['1'])
    const saved = JSON.parse(await readFile(file, 'utf8')) as { seenIds: string[]; seeded: boolean }
    expect(saved).toEqual({ seenIds: ['1'], seeded: true })
  })
})

describe('app release service', () => {
  it('starts unpackaged or unsupported without a feed', async () => {
    expect(initialAppUpdateStatus('0.1.0', false, 'win32').phase).toBe('unpackaged')
    expect(initialAppUpdateStatus('0.1.0', true, 'darwin').phase).toBe('unsupported')
    const service = await createService({ packaged: false, platform: 'win32', feed: null })
    expect((await service.check()).phase).toBe('unpackaged')
    await expect(service.download()).rejects.toMatchObject({ code: 'app_update_unsupported' })
  })

  it('checks, downloads, and refuses install before ready', async () => {
    const feed = memoryFeed({ version: '0.2.0', releaseNotes: 'Hi' })
    const service = await createService({ packaged: true, platform: 'win32', feed })
    expect((await service.check()).phase).toBe('available')
    expect(service.snapshot().availableVersion).toBe('0.2.0')
    await expect(service.install()).rejects.toMatchObject({ code: 'app_update_not_downloaded' })
    expect((await service.download()).phase).toBe('ready')
    expect(feed.downloaded).toBe(1)
    expect((await service.install()).phase).toBe('ready')
    expect(feed.installed).toBe(1)
    expect(service.snapshot().phase).toBe('ready')
  })

  it('returns to idle when a check fails', async () => {
    const feed = memoryFeed({ version: '0.2.0', releaseNotes: null })
    feed.check = async () => {
      throw new AppError('app_update_check_failed', { detail: 'offline' })
    }
    const service = await createService({ packaged: true, platform: 'win32', feed })
    await expect(service.check()).rejects.toMatchObject({ code: 'app_update_check_failed' })
    expect(service.snapshot().phase).toBe('idle')
  })

  it('seeds first announcements as read and later ones as unread', async () => {
    let payload: unknown = [sampleAnnouncement]
    const service = await createService({
      packaged: false,
      platform: 'win32',
      feed: null,
      fetchReleases: async () => payload,
    })
    const first = await service.refreshAnnouncements()
    expect(first.unreadCount).toBe(0)
    expect(first.items).toHaveLength(1)
    payload = [
      {
        ...sampleAnnouncement,
        id: '99',
        title: 'New notice',
        htmlUrl: 'https://example.com/new',
      },
      sampleAnnouncement,
    ]
    const second = await service.refreshAnnouncements()
    expect(second.unreadCount).toBe(1)
    expect(second.items[0]?.id).toBe('99')
    expect((await service.markAnnouncementRead('99')).unreadCount).toBe(0)
  })
})

async function createService(options: {
  packaged: boolean
  platform: NodeJS.Platform
  feed: AppUpdateFeed | null
  fetchReleases?: () => Promise<unknown>
}): Promise<AppReleaseService> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-releases-'))
  return new AppReleaseService({
    currentVersion: '0.1.0',
    packaged: options.packaged,
    platform: options.platform,
    store: new AnnouncementStore(path.join(dir, 'announcements.json')),
    fetchReleases: options.fetchReleases ?? (async () => []),
    feed: options.feed,
    prepareQuit: async () => undefined,
  })
}

function memoryFeed(found: { version: string; releaseNotes: string | null } | null): AppUpdateFeed & {
  downloaded: number
  installed: number
} {
  const feed = {
    downloaded: 0,
    installed: 0,
    async check() {
      return found
    },
    async download(onProgress: (transferred: number, total: number) => void) {
      feed.downloaded += 1
      onProgress(50, 100)
      onProgress(100, 100)
    },
    install() {
      feed.installed += 1
    },
  }
  return feed
}
