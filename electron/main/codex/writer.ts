import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { encodeCodexCatalog, uniqueCodexModelIds } from '../../../shared/codex-models'
import { migrateCodexHistoryProviderBucket } from './history'
import { codexAuthPath, codexConfigPath, stackferryCatalogPath } from './home'
import {
  applyOfficialProvider,
  applyRouterProvider,
  applyThirdPartyProvider,
  parseToml,
  stringifyToml,
  type RouterLiveConfig,
  type TomlTable,
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
  await writeStackferryCatalog(options.codexHome, options.provider.models)
  const next = applyThirdPartyProvider(current, withCatalog(options.codexHome, options.provider))
  await mkdir(options.codexHome, { recursive: true })
  await atomicWriteFile(configPath, stringifyToml(next))
  await migrateHistory(options.codexHome, options.backupRoot, next)
  return { backupPath, configPath }
}

export async function enableOfficialLiveConfig(options: {
  codexHome: string
  backupRoot: string
}): Promise<EnableResult> {
  const configPath = codexConfigPath(options.codexHome)
  const backupPath = await backupLiveFiles(options.codexHome, options.backupRoot)
  const current = await readTomlOrEmpty(configPath)
  const next = applyOfficialProvider(current, stackferryCatalogPath(options.codexHome))
  await mkdir(options.codexHome, { recursive: true })
  await atomicWriteFile(configPath, stringifyToml(next))
  return { backupPath, configPath }
}

export async function enableRouterLiveConfig(options: {
  codexHome: string
  backupRoot: string
  port: number
  provider: Pick<RouterLiveConfig, 'tomlText' | 'models'>
}): Promise<EnableResult> {
  const configPath = codexConfigPath(options.codexHome)
  const backupPath = await backupLiveFiles(options.codexHome, options.backupRoot)
  const current = await readTomlOrEmpty(configPath)
  await writeStackferryCatalog(options.codexHome, options.provider.models)
  const next = applyRouterProvider(current, {
    port: options.port,
    ...withCatalog(options.codexHome, options.provider),
  })
  await mkdir(options.codexHome, { recursive: true })
  await atomicWriteFile(configPath, stringifyToml(next))
  await migrateHistory(options.codexHome, options.backupRoot, next)
  return { backupPath, configPath }
}

async function migrateHistory(codexHome: string, backupRoot: string, doc: TomlTable): Promise<void> {
  const sqliteHome = typeof doc.sqlite_home === 'string' ? doc.sqlite_home : undefined
  await migrateCodexHistoryProviderBucket({
    codexHome,
    backupRoot,
    sqliteHome,
    env: process.env,
  })
}

function withCatalog<T extends { models?: readonly string[] }>(
  codexHome: string,
  provider: T,
): T & { catalogPath: string } {
  return { ...provider, catalogPath: stackferryCatalogPath(codexHome) }
}

async function writeStackferryCatalog(
  codexHome: string,
  models: readonly string[] | undefined,
): Promise<void> {
  const listed = uniqueCodexModelIds(
    (models ?? []).filter((item): item is string => typeof item === 'string'),
  )
  if (listed.length === 0) return
  const filePath = stackferryCatalogPath(codexHome)
  await mkdir(path.dirname(filePath), { recursive: true })
  await atomicWriteFile(filePath, `${JSON.stringify(encodeCodexCatalog(listed), null, 2)}\n`)
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
