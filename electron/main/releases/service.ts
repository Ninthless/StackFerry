import { AppError } from '../../../shared/app-error'
import {
  announcementSnapshot,
  emptyAnnouncementSnapshot,
  initialAppUpdateStatus,
  parseAnnouncementFeed,
  type AnnouncementSnapshot,
  type AppRelease,
  type AppUpdateStatus,
} from '../../../shared/app-releases'
import type { AnnouncementStore } from './store'
import type { AppUpdateFeed } from './updater'

export type AppReleaseServiceOptions = {
  currentVersion: string
  packaged: boolean
  platform: NodeJS.Platform
  store: AnnouncementStore
  fetchReleases: () => Promise<unknown>
  feed: AppUpdateFeed | null
  prepareQuit: () => Promise<void>
}

export class AppReleaseService {
  private status: AppUpdateStatus
  private releases: AppRelease[] = []
  private readonly listeners = new Set<() => void>()

  constructor(private readonly options: AppReleaseServiceOptions) {
    this.status = initialAppUpdateStatus(options.currentVersion, options.packaged, options.platform)
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  snapshot(): AppUpdateStatus {
    return { ...this.status }
  }

  async listAnnouncements(): Promise<AnnouncementSnapshot> {
    return this.withUnread(this.releases)
  }

  async refreshAnnouncements(): Promise<AnnouncementSnapshot> {
    const items = parseAnnouncementFeed(await this.options.fetchReleases())
    await this.options.store.seedIfEmpty(items.map((item) => item.id))
    this.releases = items
    return this.withUnread(items)
  }

  async markAnnouncementRead(id: string): Promise<AnnouncementSnapshot> {
    if (!id) return this.withUnread(this.releases)
    await this.options.store.markRead([id])
    return this.withUnread(this.releases)
  }

  async markAllAnnouncementsRead(): Promise<AnnouncementSnapshot> {
    await this.options.store.markRead(this.releases.map((item) => item.id))
    return this.withUnread(this.releases)
  }

  async check(): Promise<AppUpdateStatus> {
    if (this.status.phase === 'unpackaged' || this.status.phase === 'unsupported') {
      return this.snapshot()
    }
    const feed = this.requireFeed()
    this.patch({ phase: 'checking' })
    try {
      const found = await feed.check()
      if (!found) {
        this.patch({
          phase: 'upToDate',
          availableVersion: null,
          releaseNotes: null,
          downloadedBytes: 0,
          totalBytes: 0,
        })
        return this.snapshot()
      }
      this.patch({
        phase: 'available',
        availableVersion: found.version,
        releaseNotes: found.releaseNotes,
        downloadedBytes: 0,
        totalBytes: 0,
      })
      return this.snapshot()
    } catch (error) {
      this.patch({ phase: 'idle' })
      throw error
    }
  }

  async download(): Promise<AppUpdateStatus> {
    const feed = this.requireFeed()
    if (this.status.phase !== 'available' && this.status.phase !== 'ready') {
      throw new AppError('app_update_not_downloaded')
    }
    this.patch({ phase: 'downloading', downloadedBytes: 0, totalBytes: 0 })
    try {
      await feed.download((transferred, total) => {
        this.patch({ phase: 'downloading', downloadedBytes: transferred, totalBytes: total })
      })
      this.patch({ phase: 'ready' })
      return this.snapshot()
    } catch (error) {
      this.patch({ phase: 'available' })
      throw error
    }
  }

  async install(): Promise<AppUpdateStatus> {
    const feed = this.requireFeed()
    if (this.status.phase !== 'ready') throw new AppError('app_update_not_downloaded')
    await this.options.prepareQuit()
    feed.install()
    return this.snapshot()
  }

  private requireFeed(): AppUpdateFeed {
    if (!this.options.feed) throw new AppError('app_update_unsupported')
    return this.options.feed
  }

  private async withUnread(items: AppRelease[]): Promise<AnnouncementSnapshot> {
    if (items.length === 0) return emptyAnnouncementSnapshot()
    return announcementSnapshot(items, await this.options.store.seenIds())
  }

  private patch(next: Partial<AppUpdateStatus>): void {
    this.status = { ...this.status, ...next }
    for (const listener of this.listeners) listener()
  }
}
