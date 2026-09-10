import os from 'node:os'
import path from 'node:path'

export function resolveGrokHome(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  const fromEnv = env.GROK_HOME?.trim()
  if (fromEnv) return fromEnv
  return path.join(homedir(), '.grok')
}

export function grokConfigPath(grokHome: string): string {
  return path.join(grokHome, 'config.toml')
}

export function grokAuthPath(grokHome: string): string {
  return path.join(grokHome, 'auth.json')
}

export function grokAuthRestorePath(grokHome: string): string {
  return path.join(grokHome, 'auth.json.stackferry-restore')
}

export function grokSkillsRoot(grokHome: string): string {
  return path.join(grokHome, 'skills')
}

export function grokManagedConfigPaths(
  grokHome: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const files = [
    path.join(grokHome, 'managed_config.toml'),
    path.join(grokHome, 'requirements.toml'),
  ]
  if (platform === 'win32') {
    const programData = env.ProgramData?.trim() || 'C:\\ProgramData'
    files.push(path.join(programData, 'grok', 'managed_config.toml'))
    files.push(path.join(programData, 'grok', 'requirements.toml'))
    return files
  }
  files.push(path.join('/etc', 'grok', 'managed_config.toml'))
  files.push(path.join('/etc', 'grok', 'requirements.toml'))
  return files
}
