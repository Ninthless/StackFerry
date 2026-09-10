import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { AppError } from '../../../shared/app-error'
import { atomicWriteFile } from '../codex/writer'
import { restoreGrokAuth, writeStackferryApiKey } from './auth'
import { grokAuthPath, grokAuthRestorePath, grokConfigPath } from './home'
import type { GrokSessionInput } from '../../../shared/grok-session'
import {
  applyDirectModel,
  applyOfficialModel,
  applyRouterModel,
  applyMediaBaseUrl,
  grokConfiguredMediaUrl,
  parseToml,
  stringifyToml,
  type GrokDirectLiveConfig,
} from './merge'

export type EnableResult = {
  backupPath: string
  configPath: string
}

export async function enableGrokDirectConfig(options: {
  grokHome: string
  backupRoot: string
  provider: GrokDirectLiveConfig
}): Promise<EnableResult> {
  const result = await writeMerged(options.grokHome, options.backupRoot, (current) => {
    return applyDirectModel(current, options.provider)
  })
  const authKey = options.provider.media?.apiKey.trim() || options.provider.apiKey
  await writeStackferryApiKey(options.grokHome, authKey)
  return result
}

export async function enableGrokOfficialConfig(options: {
  grokHome: string
  backupRoot: string
  previousDefault?: string
}): Promise<EnableResult> {
  const result = await writeMerged(options.grokHome, options.backupRoot, (current) => {
    return applyOfficialModel(current, options.previousDefault ?? '')
  })
  await restoreGrokAuth(options.grokHome)
  return result
}

export async function enableGrokRouterConfig(
  options: {
    grokHome: string
    backupRoot: string
    port: number
    model: string
    apiKey?: string
    media?: GrokDirectLiveConfig['media']
  } & GrokSessionInput,
): Promise<EnableResult> {
  const { grokHome, backupRoot, apiKey, ...input } = options
  const result = await writeMerged(grokHome, backupRoot, (current) => applyRouterModel(current, input))
  if (apiKey?.trim()) await writeStackferryApiKey(grokHome, apiKey)
  return result
}

export async function patchGrokMediaUrl(options: {
  grokHome: string
  backupRoot: string
  baseUrl: string
}): Promise<void> {
  const configPath = grokConfigPath(options.grokHome)
  const current = await readTomlOrEmpty(configPath)
  if (grokConfiguredMediaUrl(current) === options.baseUrl) return
  await writeMerged(options.grokHome, options.backupRoot, (doc) => {
    return applyMediaBaseUrl(doc, options.baseUrl)
  })
}

async function writeMerged(
  grokHome: string,
  backupRoot: string,
  apply: (current: ReturnType<typeof parseToml>) => ReturnType<typeof parseToml>,
): Promise<EnableResult> {
  const configPath = grokConfigPath(grokHome)
  const backupPath = await backupGrokConfig(grokHome, backupRoot)
  const next = apply(await readTomlOrEmpty(configPath))
  await mkdir(grokHome, { recursive: true })
  await atomicWriteFile(configPath, stringifyToml(next))
  return { backupPath, configPath }
}

async function backupGrokConfig(grokHome: string, backupRoot: string): Promise<string> {
  const stamp = new Date().toISOString().replaceAll(':', '-')
  const backupPath = path.join(backupRoot, stamp)
  await mkdir(backupPath, { recursive: true })
  const from = grokConfigPath(grokHome)
  if (existsSync(from)) await copyFile(from, path.join(backupPath, 'config.toml'))
  const auth = grokAuthPath(grokHome)
  if (existsSync(auth)) await copyFile(auth, path.join(backupPath, 'auth.json'))
  const restore = grokAuthRestorePath(grokHome)
  if (existsSync(restore)) await copyFile(restore, path.join(backupPath, 'auth.json.stackferry-restore'))
  return backupPath
}

async function readTomlOrEmpty(filePath: string) {
  if (!existsSync(filePath)) return {}
  try {
    return parseToml(await readFile(filePath, 'utf8'))
  } catch (error) {
    if (error instanceof AppError) throw new AppError('grok_config_corrupt')
    throw error
  }
}
