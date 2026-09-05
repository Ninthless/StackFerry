export const APP_ERROR_CODES = [
  'toml_root_not_table',
  'toml_parse_failed',
  'overlay_empty',
  'overlay_unsupported_top_level',
  'overlay_missing_providers',
  'overlay_single_provider',
  'overlay_reserved_provider_id',
  'overlay_table_not_object',
  'overlay_provider_mismatch',
  'overlay_missing_base_url',
  'overlay_wire_api',
  'overlay_auth_conflict',
  'overlay_invalid_reasoning',
  'overlay_positive_int',
  'models_missing_base_url',
  'models_invalid_url',
  'models_unsupported_protocol',
  'models_invalid_payload',
  'models_empty',
  'official_exists',
  'secret_storage_unavailable_read',
  'secret_storage_unavailable_write',
  'provider_name_required',
  'api_key_required',
  'provider_missing',
  'store_corrupt',
  'models_missing_api_key',
  'models_auth',
  'models_unsupported_endpoint',
  'models_http',
  'models_timeout',
] as const

export type AppErrorCode = (typeof APP_ERROR_CODES)[number]
export type AppErrorParams = Record<string, string>

const PREFIX = 'AppError:'

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly params: AppErrorParams

  constructor(code: AppErrorCode, params: AppErrorParams = {}) {
    super(encodeAppErrorMessage(code, params))
    this.name = 'AppError'
    this.code = code
    this.params = params
  }
}

export function isAppErrorCode(value: unknown): value is AppErrorCode {
  return typeof value === 'string' && (APP_ERROR_CODES as readonly string[]).includes(value)
}

export function encodeAppErrorMessage(code: AppErrorCode, params: AppErrorParams): string {
  return `${PREFIX}${code}:${JSON.stringify(params)}`
}

export function decodeAppErrorMessage(
  message: string,
): { code: AppErrorCode; params: AppErrorParams } | null {
  const start = message.indexOf(PREFIX)
  if (start < 0) return null
  const rest = message.slice(start + PREFIX.length)
  const separator = rest.indexOf(':')
  if (separator < 0) return null
  const code = rest.slice(0, separator)
  if (!isAppErrorCode(code)) return null
  try {
    const params = JSON.parse(rest.slice(separator + 1)) as unknown
    if (!isStringRecord(params)) return null
    return { code, params }
  } catch {
    return null
  }
}

export function appErrorFromUnknown(error: unknown): AppError | null {
  if (error instanceof AppError) return error
  const message = error instanceof Error ? error.message : String(error)
  const decoded = decodeAppErrorMessage(message)
  if (!decoded) return null
  return new AppError(decoded.code, decoded.params)
}

function isStringRecord(value: unknown): value is AppErrorParams {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return Object.values(value).every((item) => typeof item === 'string')
}
