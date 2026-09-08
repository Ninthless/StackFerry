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

export function grokSkillsRoot(grokHome: string): string {
  return path.join(grokHome, 'skills')
}

export function grokManagedConfigPaths(grokHome: string): string[] {
  return [
    path.join(grokHome, 'managed_config.toml'),
    path.join(grokHome, 'requirements.toml'),
    path.join('/etc', 'grok', 'managed_config.toml'),
    path.join('/etc', 'grok', 'requirements.toml'),
  ]
}
