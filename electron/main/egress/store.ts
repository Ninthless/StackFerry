import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { safeStorage } from 'electron'
import { AppError } from '../../../shared/app-error'
import {
  emptyEgressProxyView,
  formatBypass,
  parseEgressProxyUrl,
  proxyUri,
  type EgressProxyPatch,
  type EgressProxyView,
} from '../../../shared/egress-proxy'
import { atomicWriteFile } from '../codex/writer'

const STORE_VERSION = 1

type EgressFile = {
  version: number
  enabled: boolean
  url: string
  username: string
  bypass: string
  passwordPayload: string | null
}

export class EgressProxyStore {
  constructor(private readonly filePath: string) {}

  async get(): Promise<EgressProxyView> {
    const file = await this.read()
    return toView(file)
  }

  async route(): Promise<{ proxyUri: string | null; bypass: string }> {
    const file = await this.read()
    if (!file.enabled || !file.url) return { proxyUri: null, bypass: file.bypass }
    const password = file.passwordPayload ? this.decrypt(file.passwordPayload) : ''
    return { proxyUri: proxyUri(file.url, file.username, password), bypass: file.bypass }
  }

  async set(patch: EgressProxyPatch): Promise<EgressProxyView> {
    const current = await this.read()
    const next = applyPatch(current, patch, (payload) => this.decrypt(payload))
    if (next.passwordPayload && next.passwordPayload !== current.passwordPayload) {
      next.passwordPayload = this.encrypt(next.passwordPayload)
    }
    await this.write(next)
    return toView(next)
  }

  private encrypt(value: string): string {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new AppError('secret_storage_unavailable_write')
    }
    return safeStorage.encryptString(value).toString('base64')
  }

  private decrypt(payload: string): string {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new AppError('secret_storage_unavailable_read')
    }
    return safeStorage.decryptString(Buffer.from(payload, 'base64'))
  }

  private async read(): Promise<EgressFile> {
    if (!existsSync(this.filePath)) return emptyFile()
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as Record<string, unknown>
      return {
        version: STORE_VERSION,
        enabled: parsed.enabled === true,
        url: typeof parsed.url === 'string' ? parsed.url : '',
        username: typeof parsed.username === 'string' ? parsed.username : '',
        bypass: typeof parsed.bypass === 'string' ? formatBypass(parsed.bypass) : '',
        passwordPayload: typeof parsed.passwordPayload === 'string' ? parsed.passwordPayload : null,
      }
    } catch {
      return emptyFile()
    }
  }

  private async write(file: EgressFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true })
    file.version = STORE_VERSION
    await atomicWriteFile(this.filePath, `${JSON.stringify(file, null, 2)}\n`)
  }
}

function applyPatch(
  current: EgressFile,
  patch: EgressProxyPatch,
  decrypt: (payload: string) => string,
): EgressFile {
  let url = current.url
  let username = current.username
  let password = current.passwordPayload ? decrypt(current.passwordPayload) : ''
  let passwordFromUrl = false
  if (patch.url !== undefined) {
    const trimmed = patch.url.trim()
    if (!trimmed) {
      url = ''
    } else {
      const parsed = parseEgressProxyUrl(trimmed)
      url = parsed.url
      if (parsed.username) username = parsed.username
      if (parsed.password) {
        password = parsed.password
        passwordFromUrl = true
      }
    }
  }
  if (patch.username !== undefined) username = patch.username.trim()
  if (patch.password !== undefined && !passwordFromUrl) password = patch.password
  const bypass = patch.bypass !== undefined ? formatBypass(patch.bypass) : current.bypass
  const enabled = patch.enabled ?? current.enabled
  if (enabled && !url) throw new AppError('egress_proxy_url')
  return {
    version: STORE_VERSION,
    enabled,
    url,
    username,
    bypass,
    passwordPayload: password ? password : null,
  }
}

function toView(file: EgressFile): EgressProxyView {
  if (!file.url) return { ...emptyEgressProxyView(), bypass: file.bypass, username: file.username }
  return {
    enabled: file.enabled,
    url: file.url,
    username: file.username,
    hasPassword: file.passwordPayload != null,
    bypass: file.bypass,
  }
}

function emptyFile(): EgressFile {
  return { version: STORE_VERSION, enabled: false, url: '', username: '', bypass: '', passwordPayload: null }
}
