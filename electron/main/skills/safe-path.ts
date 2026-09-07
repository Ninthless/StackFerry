import path from 'node:path'
import { AppError } from '../../../shared/app-error'

export function assertSafeZipEntry(name: string): string {
  const normalized = name.replaceAll('\\', '/')
  if (!normalized || normalized.includes('\0') || normalized.startsWith('/')) {
    throw new AppError('skill_zip_unsafe')
  }
  if (/^[a-zA-Z]:/.test(normalized) || normalized.startsWith('//')) {
    throw new AppError('skill_zip_unsafe')
  }
  const parts = normalized.split('/')
  if (parts.some((part) => part === '..')) {
    throw new AppError('skill_zip_unsafe')
  }
  return parts.filter((part) => part && part !== '.').join('/')
}

export function isInsideDirectory(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(target)
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(resolvedRoot + path.sep)
}

export function resolveInside(root: string, relativePosix: string): string {
  const safe = assertSafeZipEntry(relativePosix)
  const target = path.resolve(root, ...safe.split('/'))
  if (!isInsideDirectory(root, target)) {
    throw new AppError('skill_zip_unsafe')
  }
  return target
}
