import { appErrorFromUnknown } from './app-error'

export function formatAppError(error: unknown, messages: object): string {
  const appError = appErrorFromUnknown(error)
  if (!appError) return error instanceof Error ? error.message : String(error)
  const fn = (messages as Record<string, unknown>)[`error_${appError.code}`]
  if (typeof fn !== 'function') return error instanceof Error ? error.message : String(error)
  return String(fn(appError.params))
}
