import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { codexAuthPath, codexConfigPath } from './home'
import {
  applyOfficialProvider,
  applyRouterProvider,
  applyThirdPartyProvider,
  parseToml,
  stringifyToml,
  type RouterLiveConfig,
  type ThirdPartyLiveConfig,
} from './merge'

export type EnableResult = {
  backupPath: string
  configPath: string
}

export async function enableThirdPartyLiveConfig(options: {
  codexHome: string
  backupRoot: string
  provider: ThirdPartyLiveConfig
}): Promise<EnableResult> {
  const configPath = codexConfigPath(options.codexHome)
  const backupPath = await backupLiveFiles(options.codexHome, options.backupRoot)
  const current = await readTomlOrEmpty(configPath)
  const next = applyThirdPartyProvider(current, options.provider)
  await mkdir(options.codexHome, { recursive: true })
  await atomicWriteFile(configPath, stringifyToml(next))
  return { backupPath, configPath }
}

export async function enableOfficialLiveConfig(options: {
  codexHome: string
  backupRoot: string
}): Promise<EnableResult> {
  const configPath = codexConfigPath(options.codexHome)
  const backupPath = await backupLiveFiles(options.codexHome, options.backupRoot)
  const current = await readTomlOrEmpty(configPath)
  const next = applyOfficialProvider(current)
  await mkdir(options.codexHome, { recursive: true })
  await atomicWriteFile(configPath, stringifyToml(next))
  return { backupPath, configPath }
}

export async function enableRouterLiveConfig(options: {
  codexHome: string
  backupRoot: string
  port: number
  provider: Pick<RouterLiveConfig, 'tomlText'>
}): Promise<EnableResult> {
  const configPath = codexConfigPath(options.codexHome)
  const backupPath = await backupLiveFiles(options.codexHome, options.backupRoot)
  const current = await readTomlOrEmpty(configPath)
  const next = applyRouterProvider(current, { port: options.port, tomlText: options.provider.tomlText })
  await mkdir(options.codexHome, { recursive: true })
  await atomicWriteFile(configPath, stringifyToml(next))
  return { backupPath, configPath }
}

export async function backupLiveFiles(codexHome: string, backupRoot: string): Promise<string> {
  const stamp = new Date().toISOString().replaceAll(':', '-')
  const backupPath = path.join(backupRoot, stamp)
  await mkdir(backupPath, { recursive: true })
  await copyIfExists(codexConfigPath(codexHome), path.join(backupPath, 'config.toml'))
  await copyIfExists(codexAuthPath(codexHome), path.join(backupPath, 'auth.json'))
  return backupPath
}

async function readTomlOrEmpty(filePath: string) {
  if (!existsSync(filePath)) return {}
  return parseToml(await readFile(filePath, 'utf8'))
}

async function copyIfExists(from: string, to: string): Promise<void> {
  if (!existsSync(from)) return
  await copyFile(from, to)
}

export async function atomicWriteFile(filePath: string, contents: string): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tempPath, contents, 'utf8')
  try {
    await rename(tempPath, filePath)
  } catch {
    await writeFile(filePath, contents, 'utf8')
    await rm(tempPath, { force: true })
  }
}
