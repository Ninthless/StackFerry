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
  'overlay_invalid_approval',
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
  'provider_order',
  'store_corrupt',
  'models_missing_api_key',
  'models_auth',
  'models_unsupported_endpoint',
  'models_http',
  'models_timeout',
  'claude_base_url_required',
  'claude_base_url_invalid',
  'claude_auth_scheme',
  'claude_settings_corrupt',
  'claude_desktop_meta_corrupt',
  'claude_desktop_config_corrupt',
  'claude_desktop_managed_policy',
  'claude_effort',
  'claude_permission',
  'claude_overlay_json',
  'claude_overlay_object',
  'claude_overlay_env',
  'claude_compact_range',
  'grok_base_url_required',
  'grok_base_url_invalid',
  'grok_api_backend',
  'grok_config_corrupt',
  'grok_managed_policy',
  'grok_effort',
  'grok_permission',
  'grok_overlay_unsupported_top_level',
  'grok_overlay_table',
  'grok_compact_range',
  'skill_name_invalid',
  'skill_zip_unsafe',
  'skill_github_http',
  'skill_github_timeout',
  'skill_missing',
  'skill_repo_invalid',
  'skill_document_invalid',
  'skill_store_corrupt',
  'skill_sync_failed',
  'skill_exists',
  'skill_import_invalid',
  'mcp_id_invalid',
  'mcp_id_exists',
  'mcp_name_required',
  'mcp_command_required',
  'mcp_url_invalid',
  'mcp_transport',
  'mcp_missing',
  'mcp_store_corrupt',
  'mcp_claude_json_corrupt',
  'import_url',
  'import_payload',
  'import_targets',
  'import_version',
  'import_invalid',
  'ccsw_not_found',
  'ccsw_db_corrupt',
  'ccsw_no_providers',
  'cli_not_found',
  'cli_spawn_failed',
  'cli_timeout',
  'cli_method_unsupported',
  'cli_npm_missing',
  'announcement_invalid',
  'announcement_http',
  'announcement_timeout',
  'app_update_check_failed',
  'app_update_download_failed',
  'app_update_not_downloaded',
  'app_update_unsupported',
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
