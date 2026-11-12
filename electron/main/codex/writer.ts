import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { encodeCodexCatalog, gatewayModelId } from '../../../shared/codex-models'
import { normalizeModelEntries, type ModelEntry } from '../../../shared/model-entry'
import { parseProviderOverlay } from '../../../shared/provider-overlay'
import { migrateCodexHistoryProviderBucket } from './history'
import { codexAuthPath, codexConfigPath, stackferryCatalogPath } from './home'
import {
  applyGatewayBase,
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
  await writeStackferryCatalog(options.codexHome, options.provider.models, options.provider.tomlText, '')
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
  provider: Pick<RouterLiveConfig, 'tomlText' | 'models'> & { id: string }
}): Promise<EnableResult> {
  const configPath = codexConfigPath(options.codexHome)
  const backupPath = await backupLiveFiles(options.codexHome, options.backupRoot)
  const current = await readTomlOrEmpty(configPath)
  const signedIn = await hasChatGptLogin(options.codexHome)
  if (!signedIn) {
    await writeStackferryCatalog(
      options.codexHome,
      options.provider.models,
      options.provider.tomlText,
      options.provider.id,
    )
  }
  const next = signedIn
    ? applyGatewayBase(current, options.port, gatewayModelId(options.provider.id, catalogModelIds(options.provider.models, options.provider.tomlText)[0]?.id ?? ''))
    : applyRouterProvider(current, {
        port: options.port,
        ...withCatalog(options.codexHome, options.provider),
      })
  await mkdir(options.codexHome, { recursive: true })
  await atomicWriteFile(configPath, stringifyToml(next))
  if (!signedIn) await migrateHistory(options.codexHome, options.backupRoot, next)
  return { backupPath, configPath }
}

async function hasChatGptLogin(codexHome: string): Promise<boolean> {
  const filePath = codexAuthPath(codexHome)
  if (!existsSync(filePath)) return false
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as { tokens?: unknown }
    return Boolean(parsed.tokens)
  } catch {
    return false
  }
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
): T & { catalogPath: string; models: ModelEntry[] } {
  return {
    ...provider,
    catalogPath: stackferryCatalogPath(codexHome),
    models: catalogModelIds(provider.models, provider.tomlText),
  }
}

function catalogModelIds(models: readonly ModelEntry[] | undefined, tomlText: string): ModelEntry[] {
  const listed = normalizeModelEntries(models)
  if (listed.length > 0) return listed
  // 只填了当前模型时也要写目录。否则 Codex 用未知模型的回退元数据，桌面端会关掉贴图。
  const id = readTomlModel(tomlText)
  return normalizeModelEntries([id])
}

function readTomlModel(tomlText: string): string {
  try {
    return parseProviderOverlay(tomlText).model.trim()
  } catch {
    const match = tomlText.match(/^\s*model\s*=\s*"([^"]*)"/m)
    return match?.[1]?.trim() ?? ''
  }
}

async function writeStackferryCatalog(
  codexHome: string,
  models: readonly ModelEntry[] | undefined,
  tomlText: string,
  providerId: string,
): Promise<void> {
  const listed = catalogModelIds(models, tomlText)
  if (listed.length === 0) return
  const filePath = stackferryCatalogPath(codexHome)
  await mkdir(path.dirname(filePath), { recursive: true })
  const contextWindow = parseProviderOverlay(tomlText).contextWindow
  await atomicWriteFile(
    filePath,
    `${JSON.stringify(encodeCodexCatalog(listed, contextWindow, providerId), null, 2)}\n`,
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
