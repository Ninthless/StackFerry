import type { CliToolId } from '../../../shared/cli-tools'
import {
  CLI_BREW_CASKS,
  CLI_NPM_PACKAGES,
  CLI_WINGET_IDS,
  requireCliPackage,
  type PackageManager,
} from './commands'

export const CHECK_TIMEOUT_MS = 20_000

export function packageManagerCheckArgs(
  id: CliToolId,
  method: PackageManager,
): { tool: 'npm' | 'brew' | 'winget'; args: string[]; timeoutMs: number } {
  if (method === 'npm') {
    return {
      tool: 'npm',
      args: ['outdated', '-g', '--json', requireCliPackage(CLI_NPM_PACKAGES, id)],
      timeoutMs: CHECK_TIMEOUT_MS,
    }
  }
  if (method === 'homebrew') {
    return {
      tool: 'brew',
      args: ['outdated', '--cask', '--json=v2', requireCliPackage(CLI_BREW_CASKS, id)],
      timeoutMs: CHECK_TIMEOUT_MS,
    }
  }
  return {
    tool: 'winget',
    args: [
      'list',
      '--id',
      requireCliPackage(CLI_WINGET_IDS, id),
      '--exact',
      '--upgrade-available',
      '--accept-source-agreements',
      '--disable-interactivity',
    ],
    timeoutMs: CHECK_TIMEOUT_MS,
  }
}

export function wingetUpgradeAvailable(stdout: string, packageId: string): boolean {
  const text = stdout.replace(/\r/g, '')
  if (/no (installed package found|available upgrade|newer package versions)/i.test(text)) return false
  return text.split('\n').some((line) => {
    const trimmed = line.trim()
    if (!trimmed || /^-{3,}/.test(trimmed) || /^name\s+id\b/i.test(trimmed)) return false
    return trimmed.includes(packageId)
  })
}

export function npmOutdatedAvailable(stdout: string, pkg: string): boolean {
  const trimmed = stdout.trim()
  if (!trimmed) return false
  try {
    const parsed = JSON.parse(trimmed) as unknown
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) && pkg in parsed
  } catch {
    return false
  }
}

export function brewCaskOutdatedAvailable(stdout: string, cask: string): boolean {
  try {
    const parsed = JSON.parse(stdout) as { casks?: Array<{ name?: string }> }
    return (parsed.casks ?? []).some((item) => item.name === cask)
  } catch {
    return false
  }
}

export function grokNativeUpdateAvailable(stdout: string): boolean {
  const match = stdout.match(/v([\w.-]+)\s*\(latest:\s*([\w.-]+)\)/i)
  if (match?.[1] && match[2]) return match[1] !== match[2]
  return /update available|newer version|new version is available/i.test(stdout)
}

export function packageOutdated(method: PackageManager, stdout: string, id: CliToolId): boolean {
  if (method === 'npm') return npmOutdatedAvailable(stdout, requireCliPackage(CLI_NPM_PACKAGES, id))
  if (method === 'homebrew') {
    return brewCaskOutdatedAvailable(stdout, requireCliPackage(CLI_BREW_CASKS, id))
  }
  return wingetUpgradeAvailable(stdout, requireCliPackage(CLI_WINGET_IDS, id))
}
