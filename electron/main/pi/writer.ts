import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { atomicWriteFile } from '../codex/writer'
import {
  applyDirectPiDocuments,
  applyOfficialPiDocuments,
  applyRouterPiDocuments,
  parsePiJson,
  type PiJson,
  type PiLiveConfig,
  type PiRememberedDefault,
} from './config'
import { piModelsPath, piSettingsPath } from './home'

export async function enablePiDirectConfig(options: {
  piHome: string
  backupRoot: string
  provider: PiLiveConfig
}): Promise<void> {
  await writeDocuments(options.piHome, options.backupRoot, (models, settings) => {
    return applyDirectPiDocuments(models, settings, options.provider)
  })
}

export async function enablePiRouterConfig(options: {
  piHome: string
  backupRoot: string
  port: number
  provider: PiLiveConfig
}): Promise<void> {
  await writeDocuments(options.piHome, options.backupRoot, (models, settings) => {
    return applyRouterPiDocuments(models, settings, options.provider, options.port)
  })
}

export async function enablePiOfficialConfig(options: {
  piHome: string
  backupRoot: string
  previous: PiRememberedDefault | null
}): Promise<void> {
  await writeDocuments(options.piHome, options.backupRoot, (models, settings) => {
    return applyOfficialPiDocuments(models, settings, options.previous)
  })
}

async function writeDocuments(
  piHome: string,
  backupRoot: string,
  apply: (models: PiJson, settings: PiJson) => { models: PiJson; settings: PiJson },
): Promise<void> {
  await backupPiConfig(piHome, backupRoot)
  const models = await readPiFile(piModelsPath(piHome))
  const settings = await readPiFile(piSettingsPath(piHome))
  const next = apply(models, settings)
  await mkdir(piHome, { recursive: true })
  await atomicWriteFile(piModelsPath(piHome), `${JSON.stringify(next.models, null, 2)}\n`)
  await atomicWriteFile(piSettingsPath(piHome), `${JSON.stringify(next.settings, null, 2)}\n`)
}

async function backupPiConfig(piHome: string, backupRoot: string): Promise<void> {
  const stamp = new Date().toISOString().replaceAll(':', '-')
  const backupPath = path.join(backupRoot, stamp)
  await mkdir(backupPath, { recursive: true })
  await copyIfExists(piModelsPath(piHome), path.join(backupPath, 'models.json'))
  await copyIfExists(piSettingsPath(piHome), path.join(backupPath, 'settings.json'))
}

async function copyIfExists(from: string, to: string): Promise<void> {
  if (existsSync(from)) await copyFile(from, to)
}

async function readPiFile(filePath: string): Promise<PiJson> {
  if (!existsSync(filePath)) return {}
  return parsePiJson(await readFile(filePath, 'utf8'))
}
