import { AppError } from '../../../shared/app-error'
import {
  APP_MAC_UPDATE_MANIFEST_URL,
  isNewerReleaseVersion,
  parseMacUpdateManifest,
} from '../../../shared/app-releases'
import type { AppUpdateFeed } from './updater'

const RELEASE_FETCH_TIMEOUT_MS = 20_000
const RELEASE_MAX_BYTES = 256_000

export function createGitHubReleaseNoticeFeed(input: {
  currentVersion: string
  loadLatest?: () => Promise<string>
}): AppUpdateFeed {
  const loadLatest = input.loadLatest ?? (() => fetchMacUpdateManifest())
  return {
    async check() {
      try {
        const notice = parseMacUpdateManifest(await loadLatest())
        if (!notice) throw new AppError('app_update_check_failed', { detail: 'invalid response' })
        if (!isNewerReleaseVersion(input.currentVersion, notice.version)) return null
        return {
          version: notice.version,
          releaseNotes: null,
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

async function fetchMacUpdateManifest(fetchImpl: typeof fetch = fetch): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RELEASE_FETCH_TIMEOUT_MS)
  try {
    const response = await fetchImpl(APP_MAC_UPDATE_MANIFEST_URL, {
      method: 'GET',
      headers: {
        Accept: 'text/yaml, text/plain, */*',
        'User-Agent': 'StackFerry',
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new AppError('app_update_check_failed', { detail: `HTTP ${response.status}` })
    }
    const text = await response.text()
    if (text.length > RELEASE_MAX_BYTES) {
      throw new AppError('app_update_check_failed', { detail: 'response too large' })
    }
    return text
  } catch (error) {
    if (error instanceof AppError) throw error
    const detail = error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'network'
    throw new AppError('app_update_check_failed', { detail })
  } finally {
    clearTimeout(timer)
  }
}
