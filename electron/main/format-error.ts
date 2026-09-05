import { formatAppError as formatCodedError } from '../../shared/format-app-error'
import { m } from './i18n'

export function formatAppError(error: unknown): string {
  return formatCodedError(error, m)
}
