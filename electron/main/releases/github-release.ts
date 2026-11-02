import { AppError } from '../../../shared/app-error'
import {
  APP_MAC_UPDATE_MANIFEST_URL,
  isNewerReleaseVersion,
  normalizeAppReleaseNotes,
  parseMacUpdateManifest,
} from '../../../shared/app-releases'
import { outboundFetch } from '../egress/fetch'
import { ANNOUNCEMENTS_MAX_BYTES, fetchBoundedText } from './feed'
import type { AppUpdateFeed } from './updater'

const RELEASE_FETCH_TIMEOUT_MS = 20_000
const APP_RELEASE_API_URL = 'https://api.github.com/repos/Ninthless/StackFerry/releases/latest'

export function createGitHubReleaseNoticeFeed(input: {
  currentVersion: string
  loadLatest?: () => Promise<string>
  loadReleaseNotes?: (version: string) => Promise<string | null>
}): AppUpdateFeed {
  const loadLatest = input.loadLatest ?? (() => fetchMacUpdateManifest())
  const loadReleaseNotes = input.loadReleaseNotes ?? ((version: string) => fetchReleaseNotes(version))
  return {
    async check() {
      try {
        const notice = parseMacUpdateManifest(await loadLatest())
        if (!notice) throw new AppError('app_update_check_failed', { detail: 'invalid response' })
        if (!isNewerReleaseVersion(input.currentVersion, notice.version)) return null
        const releaseNotes = await releaseNotesOrNull(loadReleaseNotes, notice.version)
        return {
          version: notice.version,
          releaseNotes,
          releaseUrl: notice.releaseUrl,
        }
      } catch (error) {
        if (error instanceof AppError) throw error
        const detail = error instanceof Error ? error.message : String(error)
        throw new AppError('app_update_check_failed', {
          detail: detail.trim().slice(0, 400) || 'app_update_check_failed',
        })
      }
    },
    async download() {
      throw new AppError('app_update_unsupported')
    },
    install() {
      throw new AppError('app_update_unsupported')
    },
  }
}

async function fetchMacUpdateManifest(fetchImpl: typeof fetch = outboundFetch): Promise<string> {
  return fetchBoundedText(APP_MAC_UPDATE_MANIFEST_URL, fetchImpl, {
    accept: 'text/yaml, text/plain, */*',
    timeoutMs: RELEASE_FETCH_TIMEOUT_MS,
    maxBytes: ANNOUNCEMENTS_MAX_BYTES,
    http: 'app_update_check_failed',
    timeout: 'app_update_check_failed',
    tooLarge: 'app_update_check_failed',
    httpDetail: (status) => ({ detail: status > 0 ? `HTTP ${status}` : 'network' }),
  })
}

// 版本以 latest-mac.yml 为准；这里只补充发布说明。拿不到正文时仍提示新版本，只是不带说明。
async function releaseNotesOrNull(
  load: (version: string) => Promise<string | null>,
  version: string,
): Promise<string | null> {
  try {
    return await load(version)
  } catch {
    return null
  }
}

async function fetchReleaseNotes(version: string, fetchImpl: typeof fetch = outboundFetch): Promise<string | null> {
  try {
    const text = await fetchBoundedText(APP_RELEASE_API_URL, fetchImpl, {
      accept: 'application/vnd.github+json',
      timeoutMs: RELEASE_FETCH_TIMEOUT_MS,
      maxBytes: ANNOUNCEMENTS_MAX_BYTES,
      http: 'app_update_check_failed',
      timeout: 'app_update_check_failed',
      tooLarge: 'app_update_check_failed',
    })
    return releaseNotesForVersion(text, version)
  } catch {
    return null
  }
}

export function releaseNotesForVersion(payload: string, version: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const release = parsed as Record<string, unknown>
  if (release.tag_name !== `v${version}`) return null
  if (release.prerelease === true || release.draft === true) return null
  return normalizeAppReleaseNotes(release.body)
}
