import { existsSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function resolveClaudeHome(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  const fromEnv = env.CLAUDE_CONFIG_DIR?.trim()
  if (fromEnv) return fromEnv
  return path.join(homedir(), '.claude')
}

export function claudeSettingsPath(claudeHome: string): string {
  return path.join(claudeHome, 'settings.json')
}

export function claudeUserJsonPath(homedir: () => string = os.homedir): string {
  return path.join(homedir(), '.claude.json')
}

export type ListMsixClaudeLibraries = (localAppData: string) => string[]

export function resolveClaudeDesktopLibrary(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA?.trim()
    const base = local || path.join(homedir(), 'AppData', 'Local')
    return path.join(base, 'Claude-3p', 'configLibrary')
  }
  if (platform === 'darwin') {
    return path.join(homedir(), 'Library', 'Application Support', 'Claude-3p', 'configLibrary')
  }
  const xdg = env.XDG_CONFIG_HOME?.trim()
  return path.join(xdg || path.join(homedir(), '.config'), 'Claude-3p', 'configLibrary')
}

export function listWindowsMsixClaudeLibraries(localAppData: string): string[] {
  const packagesRoot = path.join(localAppData, 'Packages')
  if (!existsSync(packagesRoot)) return []
  let names: string[]
  try {
    names = readdirSync(packagesRoot)
  } catch {
    return []
  }
  const libraries: string[] = []
  for (const name of names) {
    if (!/^Claude_/i.test(name)) continue
    const cache = path.join(packagesRoot, name, 'LocalCache')
    libraries.push(path.join(cache, 'Local', 'Claude-3p', 'configLibrary'))
    libraries.push(path.join(cache, 'Roaming', 'Claude-3p', 'configLibrary'))
  }
  return libraries
}

export function resolveClaudeDesktopLibraries(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
  platform: NodeJS.Platform = process.platform,
  listMsixLibraries: ListMsixClaudeLibraries = listWindowsMsixClaudeLibraries,
): string[] {
  const primary = resolveClaudeDesktopLibrary(env, homedir, platform)
  if (platform !== 'win32') return [primary]
  const local = env.LOCALAPPDATA?.trim() || path.join(homedir(), 'AppData', 'Local')
  return uniquePaths([primary, ...listMsixLibraries(local)], platform)
}

export function desktopMetaPath(library: string): string {
  return path.join(library, '_meta.json')
}

export function desktopProfilePath(library: string, id: string): string {
  return path.join(library, `${id}.json`)
}

export function desktopAppConfigPath(library: string): string {
  return path.join(path.dirname(library), 'claude_desktop_config.json')
}

function uniquePaths(paths: string[], platform: NodeJS.Platform): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of paths) {
    if (!item) continue
    const normalized = path.normalize(item)
    const key = platform === 'win32' ? normalized.toLowerCase() : normalized
    if (seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }
  return result
}
