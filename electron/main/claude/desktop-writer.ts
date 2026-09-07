import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { AppError } from '../../../shared/app-error'
import { atomicWriteFile } from '../codex/writer'
import {
  applyDesktopDeploymentMode,
  applyDesktopGateway,
  applyDesktopOfficial,
  LEGACY_STACKFERRY_DESKTOP_PROFILE_ID,
  parseDesktopAppConfig,
  parseDesktopMeta,
  STACKFERRY_DESKTOP_PROFILE_ID,
  type DesktopDeploymentMode,
  type DesktopGatewayConfig,
  type DesktopMeta,
} from './desktop-merge'
import { desktopAppConfigPath, desktopMetaPath, desktopProfilePath } from './home'
import { createWindowsClaudePolicyProbe, type ManagedPolicyProbe } from './policy'

export type DesktopWriteResult = {
  backupPath: string
  metaPath: string
  profilePath: string
}

export async function enableDesktopGateway(options: {
  library: string
  backupRoot: string
  provider: DesktopGatewayConfig
  isManaged?: ManagedPolicyProbe
}): Promise<DesktopWriteResult> {
  await assertLocalLibraryWritable(options.isManaged)
  const metaPath = desktopMetaPath(options.library)
  const profilePath = desktopProfilePath(options.library, STACKFERRY_DESKTOP_PROFILE_ID)
  const backupPath = await backupDesktopLibrary(options.library, options.backupRoot)
  const current = await readMeta(metaPath)
  const next = applyDesktopGateway(current, options.provider)
  await mkdir(options.library, { recursive: true })
  await atomicWriteFile(profilePath, stringifyJson(next.profile))
  await atomicWriteFile(metaPath, stringifyJson(next.meta))
  await writeDeploymentMode(options.library, '3p')
  await removeLegacyProfile(options.library)
  return { backupPath, metaPath, profilePath }
}

export async function enableDesktopOfficial(options: {
  library: string
  backupRoot: string
  isManaged?: ManagedPolicyProbe
}): Promise<DesktopWriteResult> {
  await assertLocalLibraryWritable(options.isManaged)
  const metaPath = desktopMetaPath(options.library)
  const profilePath = desktopProfilePath(options.library, STACKFERRY_DESKTOP_PROFILE_ID)
  const backupPath = await backupDesktopLibrary(options.library, options.backupRoot)
  const current = await readMeta(metaPath)
  const next = applyDesktopOfficial(current)
  await mkdir(options.library, { recursive: true })
  await atomicWriteFile(metaPath, stringifyJson(next))
  await writeDeploymentMode(options.library, '1p')
  return { backupPath, metaPath, profilePath }
}

async function assertLocalLibraryWritable(isManaged?: ManagedPolicyProbe): Promise<void> {
  const probe = isManaged ?? createWindowsClaudePolicyProbe()
  if (await probe()) {
    throw new AppError('claude_desktop_managed_policy')
  }
}

async function backupDesktopLibrary(library: string, backupRoot: string): Promise<string> {
  const stamp = new Date().toISOString().replaceAll(':', '-')
  const tag = createHash('sha1').update(library).digest('hex').slice(0, 8)
  const backupPath = path.join(backupRoot, `${stamp}-${tag}`)
  await mkdir(backupPath, { recursive: true })
  await copyIfExists(desktopMetaPath(library), path.join(backupPath, '_meta.json'))
  await copyIfExists(
    desktopProfilePath(library, STACKFERRY_DESKTOP_PROFILE_ID),
    path.join(backupPath, `${STACKFERRY_DESKTOP_PROFILE_ID}.json`),
  )
  await copyIfExists(
    desktopProfilePath(library, LEGACY_STACKFERRY_DESKTOP_PROFILE_ID),
    path.join(backupPath, `${LEGACY_STACKFERRY_DESKTOP_PROFILE_ID}.json`),
  )
  await copyIfExists(desktopAppConfigPath(library), path.join(backupPath, 'claude_desktop_config.json'))
  return backupPath
}

async function removeLegacyProfile(library: string): Promise<void> {
  const legacyPath = desktopProfilePath(library, LEGACY_STACKFERRY_DESKTOP_PROFILE_ID)
  if (!existsSync(legacyPath)) return
  await unlink(legacyPath)
}

async function writeDeploymentMode(library: string, mode: DesktopDeploymentMode): Promise<void> {
  const configPath = desktopAppConfigPath(library)
  const current = await readAppConfig(configPath)
  const next = applyDesktopDeploymentMode(current, mode)
  await mkdir(path.dirname(configPath), { recursive: true })
  await atomicWriteFile(configPath, stringifyJson(next))
}

async function readAppConfig(filePath: string): Promise<unknown> {
  if (!existsSync(filePath)) return {}
  return parseDesktopAppConfig(await readFile(filePath, 'utf8'))
}

async function readMeta(filePath: string): Promise<DesktopMeta> {
  if (!existsSync(filePath)) return parseDesktopMeta(null)
  try {
    return parseDesktopMeta(JSON.parse(await readFile(filePath, 'utf8')) as unknown)
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError('claude_desktop_meta_corrupt')
  }
}

async function copyIfExists(from: string, to: string): Promise<void> {
  if (!existsSync(from)) return
  await copyFile(from, to)
}

function stringifyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}
