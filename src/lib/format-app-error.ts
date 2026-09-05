import { formatAppError as formatCodedError } from "@shared/format-app-error"
import * as m from "../paraglide/messages.js"

export function formatAppError(error: unknown): string {
  return formatCodedError(error, m)
}
