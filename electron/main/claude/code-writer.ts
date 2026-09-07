import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { atomicWriteFile } from '../codex/writer'
import { applyCodeGateway, applyCodeOfficial, parseCodeSettings, type CodeLiveConfig } from './code-merge'
import { claudeSettingsPath } from './home'

export type ClaudeWriteResult = {
  backupPath: string
  settingsPath: string
}

export async function enableCodeGateway(options: {
  claudeHome: string
  backupRoot: string
  provider: CodeLiveConfig
}): Promise<ClaudeWriteResult> {
  const settingsPath = claudeSettingsPath(options.claudeHome)
  const backupPath = await backupCodeSettings(settingsPath, options.backupRoot)
  const current = await readJsonOrEmpty(settingsPath)
  const next = applyCodeGateway(current, options.provider)
  await mkdir(options.claudeHome, { recursive: true })
  await atomicWriteFile(settingsPath, stringifyJson(next))
  return { backupPath, settingsPath }
}

export async function enableCodeOfficial(options: {
  claudeHome: string
  backupRoot: string
}): Promise<ClaudeWriteResult> {
  const settingsPath = claudeSettingsPath(options.claudeHome)
  const backupPath = await backupCodeSettings(settingsPath, options.backupRoot)
  const current = await readJsonOrEmpty(settingsPath)
  const next = applyCodeOfficial(current)
  await mkdir(options.claudeHome, { recursive: true })
  await atomicWriteFile(settingsPath, stringifyJson(next))
  return { backupPath, settingsPath }
}

async function backupCodeSettings(settingsPath: string, backupRoot: string): Promise<string> {
  const stamp = new Date().toISOString().replaceAll(':', '-')
  const backupPath = path.join(backupRoot, stamp)
  await mkdir(backupPath, { recursive: true })
  await copyIfExists(settingsPath, path.join(backupPath, 'settings.json'))
  return backupPath
}

async function readJsonOrEmpty(filePath: string): Promise<unknown> {
  if (!existsSync(filePath)) return {}
  return parseCodeSettings(await readFile(filePath, 'utf8'))
}

async function copyIfExists(from: string, to: string): Promise<void> {
  if (!existsSync(from)) return
  await copyFile(from, to)
}

function stringifyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}
