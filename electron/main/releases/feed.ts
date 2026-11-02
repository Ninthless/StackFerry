import { AppError } from '../../../shared/app-error'
import { APP_ANNOUNCEMENTS_URL, isAnnouncementFeedUrl } from '../../../shared/app-releases'

export const ANNOUNCEMENTS_FETCH_TIMEOUT_MS = 20_000
export const ANNOUNCEMENTS_MAX_BYTES = 256_000

export async function fetchAnnouncementFeed(
  url = APP_ANNOUNCEMENTS_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  if (!url) return []
  if (!isAnnouncementFeedUrl(url)) throw new AppError('announcement_invalid')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ANNOUNCEMENTS_FETCH_TIMEOUT_MS)
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'StackFerry',
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!response.ok) throw new AppError('announcement_http', { status: String(response.status) })
    const text = await response.text()
    if (text.length > ANNOUNCEMENTS_MAX_BYTES) throw new AppError('announcement_invalid')
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new AppError('announcement_invalid')
    }
  } catch (error) {
    if (error instanceof AppError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AppError('announcement_timeout')
    }
    throw new AppError('announcement_http', { status: 'network' })
  } finally {
    clearTimeout(timer)
  }
}
