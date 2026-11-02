import { AppError, type AppErrorCode } from '../../../shared/app-error'
import { APP_ANNOUNCEMENTS_URL, isAnnouncementFeedUrl } from '../../../shared/app-releases'
import { outboundFetch } from '../egress/fetch'

export const ANNOUNCEMENTS_FETCH_TIMEOUT_MS = 20_000
export const ANNOUNCEMENTS_MAX_BYTES = 256_000

export async function fetchAnnouncementFeed(
  url = APP_ANNOUNCEMENTS_URL,
  fetchImpl: typeof fetch = outboundFetch,
): Promise<unknown> {
  if (!url) return []
  if (!isAnnouncementFeedUrl(url)) throw new AppError('announcement_invalid')
  const text = await fetchBoundedText(url, fetchImpl, {
    accept: 'application/json',
    timeoutMs: ANNOUNCEMENTS_FETCH_TIMEOUT_MS,
    maxBytes: ANNOUNCEMENTS_MAX_BYTES,
    http: 'announcement_http',
    timeout: 'announcement_timeout',
    tooLarge: 'announcement_invalid',
  })
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new AppError('announcement_invalid')
  }
}

export async function fetchBoundedText(
  url: string,
  fetchImpl: typeof fetch,
  limits: {
    accept: string
    timeoutMs: number
    maxBytes: number
    http: AppErrorCode
    timeout: AppErrorCode
    tooLarge: AppErrorCode
    httpDetail?: (status: number) => Record<string, string>
  },
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), limits.timeoutMs)
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: limits.accept,
        'User-Agent': 'StackFerry',
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!response.ok) {
      const detail = limits.httpDetail?.(response.status)
      throw new AppError(limits.http, detail ?? { status: String(response.status) })
    }
    const text = await response.text()
    if (text.length > limits.maxBytes) throw new AppError(limits.tooLarge)
    return text
  } catch (error) {
    if (error instanceof AppError) throw error
    if (error instanceof Error && error.name === 'AbortError') throw new AppError(limits.timeout)
    const detail = limits.httpDetail?.(0)
    throw new AppError(limits.http, detail ?? { status: 'network' })
  } finally {
    clearTimeout(timer)
  }
}
