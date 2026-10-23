import path from 'node:path'
import { requireSkillName } from '../../../shared/skills'

export function skillsSsotRoot(userData: string): string {
  return path.join(userData, 'skills')
}

export function skillsStorePath(userData: string): string {
  return path.join(userData, 'skills.json')
}

export function skillsCachePath(userData: string): string {
  return path.join(userData, 'skills-catalog-cache.json')
}

export function skillsBackupRoot(userData: string): string {
  return path.join(userData, 'skill-backups')
}

export function skillsZipCacheRoot(userData: string): string {
  return path.join(userData, 'skill-zips')
}

export function skillSsotDirectory(userData: string, name: string): string {
  return path.join(skillsSsotRoot(userData), requireSkillName(name))
}

export function claudeSkillsRoot(claudeHome: string): string {
  return path.join(claudeHome, 'skills')
}

export function agentsSkillsRoot(homedir: string): string {
  return path.join(homedir, '.agents', 'skills')
}

export function legacyCodexSkillsRoot(codexHome: string): string {
  return path.join(codexHome, 'skills')
}

export function resolveDshHome(homedir: string, env: NodeJS.ProcessEnv): string {
  const fromEnv = env.DSH_HOME?.trim()
  if (fromEnv) return fromEnv
  return path.join(homedir, '.dsh')
}

export function dshSkillsRoot(homedir: string, env: NodeJS.ProcessEnv): string {
  return path.join(resolveDshHome(homedir, env), 'skills')
}

export function zipCacheFile(userData: string, owner: string, repo: string, branch: string): string {
  return path.join(skillsZipCacheRoot(userData), `${owner}__${repo}__${encodeURIComponent(branch)}.zip`)
}
