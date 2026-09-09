export const CLI_TOOL_IDS = ['codex', 'claude-code', 'grok-build'] as const

export type CliToolId = (typeof CLI_TOOL_IDS)[number]

export const CLI_INSTALL_METHODS = ['native', 'npm', 'homebrew', 'winget', 'unknown'] as const

export type CliInstallMethod = (typeof CLI_INSTALL_METHODS)[number]

export type CliToolStatus = {
  id: CliToolId
  installed: boolean
  version: string | null
  path: string | null
  method: CliInstallMethod | null
  updateAvailable: boolean
  latestVersion: string | null
}

export function isCliToolId(value: unknown): value is CliToolId {
  return typeof value === 'string' && (CLI_TOOL_IDS as readonly string[]).includes(value)
}

export function isCliInstallMethod(value: unknown): value is CliInstallMethod {
  return (
    value === 'native' ||
    value === 'npm' ||
    value === 'homebrew' ||
    value === 'winget' ||
    value === 'unknown'
  )
}
