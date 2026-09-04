import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { safeStorage } from 'electron'
import { findPreset } from '../../../shared/presets'
import {
  overlayRequiresApiKey,
  parseProviderOverlay,
  starterOverlayToml,
  summarizeProviderOverlay,
} from '../../../shared/provider-overlay'
import type { ProviderDraft, ProviderKind, ProviderListItem } from '../../../shared/types'
import { atomicWriteFile } from '../codex/writer'

const STORE_VERSION = 2
const OFFICIAL_ID = 'official'

export type StoredProvider = {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  model: string
  tomlText: string
  apiKeyPayload: string
  createdAt: string
  updatedAt: string
}

type StoreFile = {
  version: number
  activeProviderId: string | null
  lastWriteAt: string | null
  providers: StoredProvider[]
}

type LegacyStoredProvider = Omit<StoredProvider, 'tomlText'> & {
  tomlText?: string
}

export class ProviderStore {
  constructor(private readonly filePath: string) {}

  async list(): Promise<ProviderListItem[]> {
    const file = await this.read()
    return file.providers.map((provider) => this.toListItem(provider, file.activeProviderId))
  }

  async add(draft: ProviderDraft): Promise<ProviderListItem> {
    const file = await this.read()
    const kind = this.resolveKind(draft)
    if (kind === 'official' && file.providers.some((provider) => provider.kind === 'official')) {
      throw new Error('官方登录配置已存在')
    }
    const now = new Date().toISOString()
    const overlay = this.resolveOverlay(kind, draft.tomlText)
    const provider: StoredProvider = {
      id: kind === 'official' ? OFFICIAL_ID : randomUUID(),
      name: this.requireName(draft.name),
      kind,
      baseUrl: overlay.baseUrl,
      model: overlay.model,
      tomlText: overlay.tomlText,
      apiKeyPayload: this.encryptApiKey(kind, draft.apiKey),
      createdAt: now,
      updatedAt: now,
    }
    this.assertReadyToSave(provider, draft.apiKey)
    file.providers.push(provider)
    await this.write(file)
    return this.toListItem(provider, file.activeProviderId)
  }

  async update(id: string, draft: ProviderDraft): Promise<ProviderListItem> {
    const file = await this.read()
    const provider = this.requireProvider(file, id)
    const overlay = this.resolveOverlay(provider.kind, draft.tomlText)
    provider.name = this.requireName(draft.name)
    provider.baseUrl = overlay.baseUrl
    provider.model = overlay.model
    provider.tomlText = overlay.tomlText
    if (draft.apiKey?.trim()) {
      provider.apiKeyPayload = this.encryptApiKey(provider.kind, draft.apiKey)
    }
    this.assertReadyToSave(provider, draft.apiKey)
    provider.updatedAt = new Date().toISOString()
    await this.write(file)
    return this.toListItem(provider, file.activeProviderId)
  }

  async delete(id: string): Promise<void> {
    const file = await this.read()
    this.requireProvider(file, id)
    file.providers = file.providers.filter((provider) => provider.id !== id)
    if (file.activeProviderId === id) {
      file.activeProviderId = null
    }
    await this.write(file)
  }

  async peek(id: string): Promise<StoredProvider> {
    const file = await this.read()
    return this.requireProvider(file, id)
  }

  async markEnabled(id: string): Promise<StoredProvider> {
    const file = await this.read()
    const provider = this.requireProvider(file, id)
    file.activeProviderId = id
    file.lastWriteAt = new Date().toISOString()
    await this.write(file)
    return provider
  }

  async getActiveId(): Promise<string | null> {
    return (await this.read()).activeProviderId
  }

  async getLastWriteAt(): Promise<string | null> {
    return (await this.read()).lastWriteAt
  }

  decryptApiKey(provider: StoredProvider): string {
    if (!provider.apiKeyPayload) return ''
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('系统密钥存储不可用，无法读取 API Key')
    }
    return safeStorage.decryptString(Buffer.from(provider.apiKeyPayload, 'base64'))
  }

  private toListItem(provider: StoredProvider, activeProviderId: string | null): ProviderListItem {
    return {
      id: provider.id,
      name: provider.name,
      kind: provider.kind,
      baseUrl: provider.baseUrl,
      model: provider.model,
      tomlText: provider.tomlText,
      hasApiKey: Boolean(provider.apiKeyPayload),
      enabled: provider.id === activeProviderId,
    }
  }

  private resolveKind(draft: ProviderDraft): ProviderKind {
    const preset = findPreset(draft.presetId)
    return preset?.kind ?? draft.kind
  }

  private resolveOverlay(kind: ProviderKind, tomlText: string | undefined): {
    tomlText: string
    baseUrl: string
    model: string
  } {
    if (kind === 'official') {
      return { tomlText: '', baseUrl: '', model: '' }
    }
    const text = tomlText ?? ''
    const summary = summarizeProviderOverlay(text)
    return { tomlText: text, baseUrl: summary.baseUrl, model: summary.model }
  }

  private requireName(name: string): string {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('请填写供应商名称')
    return trimmed
  }

  private assertReadyToSave(provider: StoredProvider, incomingKey: string | undefined): void {
    if (provider.kind === 'official') return
    parseProviderOverlay(provider.tomlText)
    if (overlayRequiresApiKey(provider.tomlText) && !provider.apiKeyPayload && !incomingKey?.trim()) {
      throw new Error('请填写 API Key，或在 TOML 中配置 env_key / auth')
    }
  }

  private encryptApiKey(kind: ProviderKind, apiKey: string | undefined): string {
    if (kind === 'official') return ''
    const trimmed = apiKey?.trim() ?? ''
    if (!trimmed) return ''
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('系统密钥存储不可用，无法保存 API Key')
    }
    return safeStorage.encryptString(trimmed).toString('base64')
  }

  private requireProvider(file: StoreFile, id: string): StoredProvider {
    const provider = file.providers.find((item) => item.id === id)
    if (!provider) throw new Error('供应商不存在')
    return provider
  }

  private async read(): Promise<StoreFile> {
    if (!existsSync(this.filePath)) {
      return this.emptyFile()
    }
    const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as StoreFile & {
      providers: LegacyStoredProvider[]
    }
    if (!Array.isArray(parsed.providers) || (parsed.version !== 1 && parsed.version !== STORE_VERSION)) {
      throw new Error('供应商存储文件已损坏')
    }
    const migrated: StoreFile = {
      version: STORE_VERSION,
      activeProviderId: parsed.activeProviderId,
      lastWriteAt: parsed.lastWriteAt,
      providers: parsed.providers.map((provider) => this.migrateProvider(provider)),
    }
    if (parsed.version === 1) await this.write(migrated)
    return migrated
  }

  private migrateProvider(provider: LegacyStoredProvider): StoredProvider {
    if (provider.kind === 'official') {
      return { ...provider, tomlText: '' }
    }
    return {
      ...provider,
      tomlText:
        provider.tomlText ??
        starterOverlayToml({
          providerId: 'custom',
          name: provider.name,
          baseUrl: provider.baseUrl,
          model: provider.model,
        }),
    }
  }

  private async write(file: StoreFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true })
    file.version = STORE_VERSION
    await atomicWriteFile(this.filePath, `${JSON.stringify(file, null, 2)}\n`)
  }

  private emptyFile(): StoreFile {
    return {
      version: STORE_VERSION,
      activeProviderId: null,
      lastWriteAt: null,
      providers: [],
    }
  }
}
