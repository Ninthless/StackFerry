import os from 'node:os'
import path from 'node:path'

export function resolveCodexHome(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  const fromEnv = env.CODEX_HOME?.trim()
  if (fromEnv) return fromEnv
  return path.join(homedir(), '.codex')
}

export function codexConfigPath(codexHome: string): string {
  return path.join(codexHome, 'config.toml')
}

export function codexAuthPath(codexHome: string): string {
  return path.join(codexHome, 'auth.json')
}
