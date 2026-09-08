import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { AppError } from '../../../shared/app-error'
import { atomicWriteFile } from '../codex/writer'
import { grokConfigPath } from './home'
import {
  applyDirectModel,
  applyOfficialModel,
  applyRouterModel,
  parseToml,
  stringifyToml,
  type GrokDirectLiveConfig,
  type GrokRouterLiveConfig,
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
  return writeMerged(options.grokHome, options.backupRoot, (current) => {
    return applyDirectModel(current, options.provider)
  })
}

export async function enableGrokOfficialConfig(options: {
  grokHome: string
  backupRoot: string
  previousDefault?: string
}): Promise<EnableResult> {
  return writeMerged(options.grokHome, options.backupRoot, (current) => {
    return applyOfficialModel(current, options.previousDefault ?? '')
  })
}

export async function enableGrokRouterConfig(options: {
  grokHome: string
  backupRoot: string
  port: number
  model: string
}): Promise<EnableResult> {
  const input: GrokRouterLiveConfig = { port: options.port, model: options.model }
  return writeMerged(options.grokHome, options.backupRoot, (current) => applyRouterModel(current, input))
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
