import path from 'node:path'
import type { CliInstallMethod, CliToolId } from '../../../shared/cli-tools'
import { binaryNames, grokNativeBinaries, normalizeFsPath } from './paths'

export function classifyInstallMethod(
  binaryPath: string,
  ctx: { home: string; grokHome?: string },
): CliInstallMethod {
  const n = normalizeFsPath(binaryPath)
  const home = normalizeFsPath(ctx.home)

  if (ctx.grokHome) {
    const grokBins = grokNativeBinaries(ctx.grokHome).map((item) => normalizeFsPath(item))
    if (grokBins.includes(n)) return 'native'
  }
  if (n.includes('/.grok/bin/')) return 'native'
  if (n.includes('/programs/openai/codex')) return 'native'
  if (n.includes('/.codex/packages/standalone')) return 'native'
  if (n === `${home}/.local/bin/codex` || n === `${home}/.local/bin/codex.exe`) return 'native'
  if (n === `${home}/.local/bin/claude` || n === `${home}/.local/bin/claude.exe`) return 'native'
  if (n.includes('/.local/share/claude')) return 'native'

  if (
    n.includes('/opt/homebrew/') ||
    n.includes('/home/linuxbrew/') ||
    n.includes('/usr/local/caskroom/') ||
    n.includes('/usr/local/cellar/') ||
    n.includes('/linuxbrew/')
  ) {
    return 'homebrew'
  }

  if (n.includes('/microsoft/winget/') || n.includes('/microsoft/windowsapps/')) return 'winget'

  if (
    n.includes('/node_modules/') ||
    n.includes('/roaming/npm/') ||
    n.includes('/.nvm/') ||
    n.includes('/fnm/') ||
    n.includes('/volta/') ||
    /\/npm\/[^/]+\.(cmd|exe)$/.test(n)
  ) {
    return 'npm'
  }

  return 'unknown'
}

export function parseCliVersion(stdout: string): string | null {
  const line = stdout.trim().split(/\r?\n/, 1)[0]?.trim() ?? ''
  if (!line) return null
  return line.slice(0, 80)
}

export function candidateBinaries(id: CliToolId, dirs: string[], platform: NodeJS.Platform): string[] {
  const names = binaryNames(id, platform)
  const out: string[] = []
  for (const dir of dirs) {
    if (!dir.trim()) continue
    for (const name of names) out.push(path.join(dir, name))
  }
  return out
}

export function firstExisting(paths: string[], exists: (value: string) => boolean): string | null {
  for (const item of paths) {
    if (exists(item)) return item
  }
  return null
}

export function parseWhereOutput(stdout: string): string | null {
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.toUpperCase().startsWith('INFO:')) continue
    return trimmed
  }
  return null
}
