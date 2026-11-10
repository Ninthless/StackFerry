import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { encodeCodexCatalog } from '../../../shared/codex-models'
import { modelEntry, normalizeModelEntries, type ModelEntry } from '../../../shared/model-entry'
import { parseProviderOverlay } from '../../../shared/provider-overlay'
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

export type CatalogImageLookup = (id: string) => boolean

export type EnableResult = {
  backupPath: string
  configPath: string
}

export async function enableThirdPartyLiveConfig(options: {
  codexHome: string
  backupRoot: string
  provider: ThirdPartyLiveConfig
  knownImages?: CatalogImageLookup
}): Promise<EnableResult> {
  const configPath = codexConfigPath(options.codexHome)
  const backupPath = await backupLiveFiles(options.codexHome, options.backupRoot)
  const current = await readTomlOrEmpty(configPath)
  await writeStackferryCatalog(options.codexHome, options.provider.models, options.provider.tomlText, options.knownImages)
  const next = applyThirdPartyProvider(current, withCatalog(options.codexHome, options.provider, options.knownImages))
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
  knownImages?: CatalogImageLookup
}): Promise<EnableResult> {
  const configPath = codexConfigPath(options.codexHome)
  const backupPath = await backupLiveFiles(options.codexHome, options.backupRoot)
  const current = await readTomlOrEmpty(configPath)
  await writeStackferryCatalog(options.codexHome, options.provider.models, options.provider.tomlText, options.knownImages)
  const next = applyRouterProvider(current, {
    port: options.port,
    ...withCatalog(options.codexHome, options.provider, options.knownImages),
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

function withCatalog<T extends { models?: readonly ModelEntry[]; tomlText: string }>(
  codexHome: string,
  provider: T,
  knownImages: CatalogImageLookup = () => false,
): T & { catalogPath: string; models: ModelEntry[] } {
  return {
    ...provider,
    catalogPath: stackferryCatalogPath(codexHome),
    models: catalogModelIds(provider.models, provider.tomlText, knownImages),
  }
}

function catalogModelIds(
  models: readonly ModelEntry[] | undefined,
  tomlText: string,
  knownImages: CatalogImageLookup,
): ModelEntry[] {
  const listed = normalizeModelEntries(models).map((entry) => {
    if (entry.imagesSet || entry.images || !knownImages(entry.id)) return entry
    return modelEntry(entry.id, true)
  })
  if (listed.length > 0) return listed
  // 只填了当前模型时也要写目录。否则 Codex 用未知模型的回退元数据，桌面端会关掉贴图。
  const id = parseProviderOverlay(tomlText).model.trim()
  return normalizeModelEntries([modelEntry(id, knownImages(id) || true)])
}

async function writeStackferryCatalog(
  codexHome: string,
  models: readonly ModelEntry[] | undefined,
  tomlText: string,
  knownImages: CatalogImageLookup = () => false,
): Promise<void> {
  const listed = catalogModelIds(models, tomlText, knownImages)
  if (listed.length === 0) return
  const filePath = stackferryCatalogPath(codexHome)
  await mkdir(path.dirname(filePath), { recursive: true })
  const contextWindow = parseProviderOverlay(tomlText).contextWindow
  await atomicWriteFile(
    filePath,
    `${JSON.stringify(encodeCodexCatalog(listed, contextWindow), null, 2)}\n`,
  )
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
