import os from 'node:os'
import path from 'node:path'

export function resolvePiHome(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  const fromEnv = env.PI_CODING_AGENT_DIR?.trim()
  if (fromEnv) return fromEnv
  return path.join(homedir(), '.pi', 'agent')
}

export function piModelsPath(piHome: string): string {
  return path.join(piHome, 'models.json')
}

export function piSettingsPath(piHome: string): string {
  return path.join(piHome, 'settings.json')
}

export function piMcpPath(piHome: string): string {
  return path.join(piHome, 'mcp.json')
}

export function piSkillsRoot(piHome: string): string {
  return path.join(piHome, 'skills')
}
