import { mkdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { atomicWriteFile } from '../codex/writer'

export function claudeGatewayNeedsReapply(input: {
  appliedBaseUrl: string | null
  expectedBaseUrl: string
  onboardingComplete: boolean
}): boolean {
  if (!input.onboardingComplete) return true
  return normalizeBaseUrl(input.appliedBaseUrl ?? '') !== normalizeBaseUrl(input.expectedBaseUrl)
}

export async function readClaudeAppliedBaseUrl(settingsPath: string): Promise<string | null> {
  if (!existsSync(settingsPath)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(settingsPath, 'utf8')) as unknown
  } catch {
    return null
  }
  if (!isPlainObject(parsed)) return null
  const env = parsed.env
  if (!isPlainObject(env)) return null
  const url = env.ANTHROPIC_BASE_URL
  return typeof url === 'string' && url.trim() ? url : null
}

export async function readClaudeOnboardingComplete(userJsonPath: string): Promise<boolean> {
  if (!existsSync(userJsonPath)) return false
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(userJsonPath, 'utf8')) as unknown
  } catch {
    return true
  }
  if (!isPlainObject(parsed)) return true
  return parsed.hasCompletedOnboarding === true
}

export async function ensureClaudeOnboardingComplete(userJsonPath: string): Promise<void> {
  let current: Record<string, unknown> = {}
  if (existsSync(userJsonPath)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(userJsonPath, 'utf8')) as unknown
    } catch {
      return
    }
    if (!isPlainObject(parsed)) return
    if (parsed.hasCompletedOnboarding === true) return
    current = { ...parsed }
  }
  current.hasCompletedOnboarding = true
  await mkdir(path.dirname(userJsonPath), { recursive: true })
  await atomicWriteFile(userJsonPath, `${JSON.stringify(current, null, 2)}\n`)
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
