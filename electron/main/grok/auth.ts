import { copyFile, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { atomicWriteFile } from '../codex/writer'
import { grokAuthPath, grokAuthRestorePath } from './home'

export const GROK_API_KEY_SCOPE = 'xai::api_key'

type GrokAuthStore = Record<string, unknown>

export function encodeGrokApiKeyAuth(apiKey: string, createTime = new Date()): GrokAuthStore {
  return {
    [GROK_API_KEY_SCOPE]: {
      key: apiKey,
      auth_mode: 'api_key',
      create_time: createTime.toISOString(),
      user_id: '',
      email: null,
      coding_data_retention_opt_out: false,
    },
  }
}

export async function writeStackferryApiKey(grokHome: string, apiKey: string): Promise<void> {
  const trimmed = apiKey.trim()
  if (!trimmed) return
  await stashOriginalAuth(grokHome)
  await atomicWriteFile(
    grokAuthPath(grokHome),
    `${JSON.stringify(encodeGrokApiKeyAuth(trimmed), null, 2)}\n`,
  )
}

export async function restoreGrokAuth(grokHome: string): Promise<void> {
  const live = grokAuthPath(grokHome)
  const restore = grokAuthRestorePath(grokHome)
  if (existsSync(restore)) {
    await copyFile(restore, live)
    await rm(restore, { force: true })
    return
  }
  await removeApiKeyScope(live)
}

async function stashOriginalAuth(grokHome: string): Promise<void> {
  const live = grokAuthPath(grokHome)
  const restore = grokAuthRestorePath(grokHome)
  if (!existsSync(live) || existsSync(restore)) return
  if (await isStackferryApiKeyStore(live)) return
  await copyFile(live, restore)
}

async function isStackferryApiKeyStore(filePath: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false
    const keys = Object.keys(parsed)
    if (keys.length !== 1 || keys[0] !== GROK_API_KEY_SCOPE) return false
    const entry = (parsed as GrokAuthStore)[GROK_API_KEY_SCOPE]
    return Boolean(entry && typeof entry === 'object' && (entry as { auth_mode?: string }).auth_mode === 'api_key')
  } catch {
    return false
  }
}

async function removeApiKeyScope(live: string): Promise<void> {
  if (!existsSync(live)) return
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(live, 'utf8'))
  } catch {
    return
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
  const store = { ...(parsed as GrokAuthStore) }
  if (!(GROK_API_KEY_SCOPE in store)) return
  delete store[GROK_API_KEY_SCOPE]
  if (Object.keys(store).length === 0) {
    await rm(live, { force: true })
    return
  }
  await atomicWriteFile(live, `${JSON.stringify(store, null, 2)}\n`)
}
