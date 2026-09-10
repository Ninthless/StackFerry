import type { CliToolId } from '../../../shared/cli-tools'
import {
  CLI_NPM_PACKAGES,
  CLI_WINGET_IDS,
  requireBrewCask,
  requireCliPackage,
  type PackageManager,
} from './commands'

export const CHECK_TIMEOUT_MS = 20_000

export function packageManagerCheckArgs(
  id: CliToolId,
  method: PackageManager,
  platform: NodeJS.Platform = process.platform,
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
      args: ['outdated', '--cask', '--json=v2', requireBrewCask(id, platform)],
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

export type CliOutdated = {
  available: boolean
  latestVersion: string | null
}

export function grokNativeUpdateAvailable(stdout: string): boolean {
  return grokNativeOutdated(stdout).available
}

export function grokNativeOutdated(stdout: string): CliOutdated {
  const match = stdout.match(/v([\w.-]+)\s*\(latest:\s*([\w.-]+)\)/i)
  if (match?.[1] && match[2]) {
    return { available: match[1] !== match[2], latestVersion: match[2] }
  }
  return {
    available: /update available|newer version|new version is available/i.test(stdout),
    latestVersion: null,
  }
}

export function packageOutdated(method: PackageManager, stdout: string, id: CliToolId): boolean {
  return packageOutdatedResult(method, stdout, id).available
}

export function packageOutdatedResult(
  method: PackageManager,
  stdout: string,
  id: CliToolId,
  platform: NodeJS.Platform = process.platform,
): CliOutdated {
  if (method === 'npm') return npmOutdatedResult(stdout, requireCliPackage(CLI_NPM_PACKAGES, id))
  if (method === 'homebrew') {
    return brewCaskOutdatedResult(stdout, requireBrewCask(id, platform))
  }
  return {
    available: wingetUpgradeAvailable(stdout, requireCliPackage(CLI_WINGET_IDS, id)),
    latestVersion: null,
  }
}

export function npmLatestUrl(pkg: string): string {
  const encoded = pkg.startsWith('@') ? `@${pkg.slice(1).replace('/', '%2F')}` : pkg
  return `https://registry.npmjs.org/${encoded}/latest`
}

export function parseNpmLatestVersion(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { version?: unknown }
    return typeof parsed.version === 'string' && parsed.version.trim() ? parsed.version.trim() : null
  } catch {
    return null
  }
}

export function cliVersionOutdated(current: string | null, latest: string | null): boolean {
  const installed = extractCliVersion(current ?? '')
  const remote = extractCliVersion(latest ?? '')
  if (!installed || !remote) return false
  return compareSemver(remote, installed) > 0
}

function npmOutdatedResult(stdout: string, pkg: string): CliOutdated {
  const trimmed = stdout.trim()
  if (!trimmed) return { available: false, latestVersion: null }
  try {
    const parsed = JSON.parse(trimmed) as Record<string, { latest?: unknown }>
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed) || !(pkg in parsed)) {
      return { available: false, latestVersion: null }
    }
    const latest = parsed[pkg]?.latest
    return {
      available: true,
      latestVersion: typeof latest === 'string' ? latest : null,
    }
  } catch {
    return { available: false, latestVersion: null }
  }
}

function brewCaskOutdatedResult(stdout: string, cask: string): CliOutdated {
  try {
    const parsed = JSON.parse(stdout) as {
      casks?: Array<{ name?: string; current_version?: unknown }>
    }
    const item = (parsed.casks ?? []).find((entry) => entry.name === cask)
    if (!item) return { available: false, latestVersion: null }
    return {
      available: true,
      latestVersion: typeof item.current_version === 'string' ? item.current_version : null,
    }
  } catch {
    return { available: false, latestVersion: null }
  }
}

function extractCliVersion(text: string): string | null {
  const match = text.match(/v?(\d+(?:\.\d+){1,3}(?:-[\w.]+)?)/i)
  return match?.[1] ?? null
}

function compareSemver(left: string, right: string): number {
  const leftParts = numericParts(left)
  const rightParts = numericParts(right)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (delta !== 0) return delta > 0 ? 1 : -1
  }
  return 0
}

function numericParts(version: string): number[] {
  return version
    .split(/[-+]/, 1)[0]
    .split('.')
    .map((part) => Number(part) || 0)
}
