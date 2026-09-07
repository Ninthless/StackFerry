import { mkdir, rm, symlink, lstat, cp, writeFile, readlink } from 'node:fs/promises'
import path from 'node:path'
import { AppError } from '../../../shared/app-error'
import { requireSkillName } from '../../../shared/skills'
import { isInsideDirectory, resolveInside } from './safe-path'

export async function applySkillLink(
  sourceDir: string,
  destRoot: string,
  name: string,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  const skillName = requireSkillName(name)
  const destination = path.join(destRoot, skillName)
  if (!isInsideDirectory(destRoot, destination)) throw new AppError('skill_sync_failed')
  await mkdir(destRoot, { recursive: true })
  await removeSkillLink(destRoot, skillName)
  const source = path.resolve(sourceDir)
  try {
    await symlink(source, destination, platform === 'win32' ? 'junction' : 'dir')
  } catch {
    try {
      await cp(source, destination, { recursive: true, force: true })
    } catch {
      throw new AppError('skill_sync_failed')
    }
  }
}

export async function removeSkillLink(destRoot: string, name: string): Promise<void> {
  const skillName = requireSkillName(name)
  const destination = path.join(destRoot, skillName)
  if (!isInsideDirectory(destRoot, destination)) throw new AppError('skill_sync_failed')
  await removePath(destination)
}

export async function removePath(target: string): Promise<void> {
  try {
    const info = await lstat(target)
    if (info.isSymbolicLink()) {
      await rm(target, { force: true })
      return
    }
    if (process.platform === 'win32' && info.isDirectory()) {
      try {
        await readlink(target)
        await rm(target, { force: true })
        return
      } catch {
        // real directory
      }
    }
  } catch {
    return
  }
  await rm(target, { recursive: true, force: true })
}

export async function copySkillDirectory(sourceDir: string, destDir: string): Promise<void> {
  await removePath(destDir)
  await mkdir(path.dirname(destDir), { recursive: true })
  await cp(sourceDir, destDir, { recursive: true, force: true })
}

export async function writeSkillFiles(destDir: string, files: Map<string, Uint8Array>): Promise<void> {
  await removePath(destDir)
  await mkdir(destDir, { recursive: true })
  for (const [relative, bytes] of files) {
    const target = resolveInside(destDir, relative)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, bytes)
  }
}
