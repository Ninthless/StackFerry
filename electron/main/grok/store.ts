import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { safeStorage } from 'electron'
import { AppError } from '../../../shared/app-error'
import { findGrokPreset, isGrokApiBackend } from '../../../shared/grok-presets'
import {
  grokOverlaySession,
  hydrateGrokOverlay,
  migrateGrokOverlayText,
  persistGrokSession,
} from '../../../shared/grok-session'
import { orderByIds } from '../../../shared/id-order'
import type {
  GrokApiBackend,
  GrokProviderApiKeys,
  GrokProviderDraft,
  GrokProviderListItem,
  ProviderKind,
} from '../../../shared/types'
import { atomicWriteFile } from '../codex/writer'

const STORE_VERSION = 1
const OFFICIAL_ID = 'official'

export type StoredGrokProvider = {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  model: string
  apiBackend: GrokApiBackend
  imageModel: string
  imageBaseUrl: string
  videoModel: string
  effortLevel: string
  permissionMode: string
  contextWindow: string
  autoCompact: string
  overlayToml: string
  apiKeyPayload: string
  imageApiKeyPayload: string
  createdAt: string
  updatedAt: string
}

type StoreFile = {
  version: number
  activeProviderId: string | null
  lastWriteAt: string | null
  previousDefault: string | null
  providers: StoredGrokProvider[]
}

export class GrokProviderStore {
  constructor(private readonly filePath: string) {}

  async list(): Promise<GrokProviderListItem[]> {
    const file = await this.read()
    return file.providers.map((provider) => this.toListItem(provider, file.activeProviderId))
  }

  async add(draft: GrokProviderDraft): Promise<GrokProviderListItem> {
    const file = await this.read()
    const kind = this.resolveKind(draft)
    if (kind === 'official' && file.providers.some((provider) => provider.kind === 'official')) {
      throw new AppError('official_exists')
    }
    const now = new Date().toISOString()
    const session = this.sessionFields(kind, draft)
    const image = kind === 'official' ? emptyImageFields() : this.imageFields(draft)
    const provider: StoredGrokProvider = {
      id: kind === 'official' ? OFFICIAL_ID : randomUUID(),
      name: this.requireName(draft.name),
      kind,
      baseUrl: kind === 'official' ? '' : this.requireBaseUrl(draft.baseUrl),
      model: kind === 'official' ? '' : (draft.model ?? '').trim(),
      apiBackend: kind === 'official' ? 'responses' : this.requireBackend(draft.apiBackend),
      ...image,
      ...session,
      apiKeyPayload: this.encryptApiKey(kind, draft.apiKey),
      imageApiKeyPayload: this.encryptApiKey(kind, draft.imageApiKey),
      createdAt: now,
      updatedAt: now,
    }
    this.assertReadyToSave(provider, draft.apiKey)
    file.providers.push(provider)
    await this.write(file)
    return this.toListItem(provider, file.activeProviderId)
  }

  async update(id: string, draft: GrokProviderDraft): Promise<GrokProviderListItem> {
    const file = await this.read()
    const provider = this.requireProvider(file, id)
    provider.name = this.requireName(draft.name)
    if (provider.kind === 'custom') {
      provider.baseUrl = this.requireBaseUrl(draft.baseUrl)
      provider.model = (draft.model ?? '').trim()
      provider.apiBackend = this.requireBackend(draft.apiBackend)
      Object.assign(provider, this.imageFields(draft))
      Object.assign(provider, this.sessionFields(provider.kind, draft))
      if (draft.apiKey?.trim()) {
        provider.apiKeyPayload = this.encryptApiKey(provider.kind, draft.apiKey)
      }
      if (draft.imageApiKey?.trim()) {
        provider.imageApiKeyPayload = this.encryptApiKey(provider.kind, draft.imageApiKey)
      }
    }
    this.assertReadyToSave(provider, draft.apiKey)
    provider.updatedAt = new Date().toISOString()
    await this.write(file)
    return this.toListItem(provider, file.activeProviderId)
  }

  async reorder(ids: string[]): Promise<GrokProviderListItem[]> {
    const file = await this.read()
    const next = orderByIds(file.providers, ids)
    if (!next) throw new AppError('provider_order')
    file.providers = next
    await this.write(file)
    return file.providers.map((provider) => this.toListItem(provider, file.activeProviderId))
  }

  async delete(id: string): Promise<void> {
    const file = await this.read()
    this.requireProvider(file, id)
    file.providers = file.providers.filter((provider) => provider.id !== id)
    if (file.activeProviderId === id) file.activeProviderId = null
    await this.write(file)
  }

  async peek(id: string): Promise<StoredGrokProvider> {
    const file = await this.read()
    return this.requireProvider(file, id)
  }

  async readApiKeys(id: string): Promise<GrokProviderApiKeys> {
    const provider = await this.peek(id)
    return {
      apiKey: this.decryptApiKey(provider),
      imageApiKey: this.decryptImageApiKey(provider),
    }
  }

  async markEnabled(id: string): Promise<StoredGrokProvider> {
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

  async getPreviousDefault(): Promise<string | null> {
    return (await this.read()).previousDefault
  }

  async setPreviousDefault(modelId: string): Promise<void> {
    const file = await this.read()
    if (file.previousDefault) return
    file.previousDefault = modelId
    await this.write(file)
  }

  async clearPreviousDefault(): Promise<void> {
    const file = await this.read()
    if (!file.previousDefault) return
    file.previousDefault = null
    await this.write(file)
  }

  decryptApiKey(provider: StoredGrokProvider): string {
    return this.decryptPayload(provider.apiKeyPayload)
  }

  decryptImageApiKey(provider: StoredGrokProvider): string {
    return this.decryptPayload(provider.imageApiKeyPayload)
  }

  private decryptPayload(payload: string): string {
    if (!payload) return ''
    if (!safeStorage.isEncryptionAvailable()) {
      throw new AppError('secret_storage_unavailable_read')
    }
    return safeStorage.decryptString(Buffer.from(payload, 'base64'))
  }

  private toListItem(provider: StoredGrokProvider, activeProviderId: string | null): GrokProviderListItem {
    return {
      id: provider.id,
      name: provider.name,
      kind: provider.kind,
      baseUrl: provider.baseUrl,
      model: provider.model,
      apiBackend: provider.apiBackend,
      imageModel: provider.imageModel,
      imageBaseUrl: provider.imageBaseUrl,
      videoModel: provider.videoModel,
      effortLevel: provider.effortLevel,
      permissionMode: provider.permissionMode,
      contextWindow: provider.contextWindow,
      autoCompact: provider.autoCompact,
      overlayToml: provider.overlayToml,
      hasApiKey: Boolean(provider.apiKeyPayload),
      hasImageApiKey: Boolean(provider.imageApiKeyPayload),
      enabled: provider.id === activeProviderId,
    }
  }

  private resolveKind(draft: GrokProviderDraft): ProviderKind {
    const preset = findGrokPreset(draft.presetId)
    return preset?.kind ?? draft.kind
  }

  private requireName(name: string): string {
    const trimmed = name.trim()
    if (!trimmed) throw new AppError('provider_name_required')
    return trimmed
  }

  private requireBaseUrl(value: string | undefined): string {
    const trimmed = value?.trim() ?? ''
    if (!trimmed) throw new AppError('grok_base_url_required')
    try {
      const url = new URL(trimmed)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new AppError('grok_base_url_invalid')
      }
    } catch (error) {
      if (error instanceof AppError) throw error
      throw new AppError('grok_base_url_invalid')
    }
    return trimmed
  }

  private requireBackend(value: GrokApiBackend | undefined): GrokApiBackend {
    if (!isGrokApiBackend(value)) throw new AppError('grok_api_backend')
    return value
  }

  private assertReadyToSave(provider: StoredGrokProvider, incomingKey: string | undefined): void {
    if (provider.kind === 'official') return
    if (!provider.apiKeyPayload && !incomingKey?.trim()) {
      throw new AppError('api_key_required')
    }
  }

  private encryptApiKey(kind: ProviderKind, apiKey: string | undefined): string {
    if (kind === 'official') return ''
    const trimmed = apiKey?.trim() ?? ''
    if (!trimmed) return ''
    if (!safeStorage.isEncryptionAvailable()) {
      throw new AppError('secret_storage_unavailable_write')
    }
    return safeStorage.encryptString(trimmed).toString('base64')
  }

  private requireProvider(file: StoreFile, id: string): StoredGrokProvider {
    const provider = file.providers.find((item) => item.id === id)
    if (!provider) throw new AppError('provider_missing')
    return provider
  }

  private async read(): Promise<StoreFile> {
    if (!existsSync(this.filePath)) return this.emptyFile()
    const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as StoreFile
    if (!Array.isArray(parsed.providers) || parsed.version !== STORE_VERSION) {
      throw new AppError('store_corrupt')
    }
    parsed.previousDefault = typeof parsed.previousDefault === 'string' ? parsed.previousDefault : null
    parsed.providers = parsed.providers.map((provider) => this.normalizeProvider(provider))
    return parsed
  }

  private sessionFields(kind: ProviderKind, draft: GrokProviderDraft) {
    if (kind === 'official') {
      return { effortLevel: '', permissionMode: '', contextWindow: '', autoCompact: '', overlayToml: '' }
    }
    return persistGrokSession(draft)
  }

  private imageFields(
    draft: GrokProviderDraft,
  ): Pick<StoredGrokProvider, 'imageModel' | 'imageBaseUrl' | 'videoModel'> {
    return {
      imageModel: (draft.imageModel ?? '').trim(),
      imageBaseUrl: draft.imageBaseUrl?.trim()
        ? this.requireBaseUrl(draft.imageBaseUrl)
        : '',
      videoModel: (draft.videoModel ?? '').trim(),
    }
  }

  private normalizeProvider(
    provider: StoredGrokProvider & { overlayJson?: string },
  ): StoredGrokProvider {
    const { overlayJson, overlayToml, ...rest } = provider
    const overlaySource = typeof overlayToml === 'string' ? overlayToml : overlayJson
    const columns = {
      effortLevel: typeof rest.effortLevel === 'string' ? rest.effortLevel : '',
      permissionMode: typeof rest.permissionMode === 'string' ? rest.permissionMode : '',
      contextWindow: typeof rest.contextWindow === 'string' ? rest.contextWindow : '',
      autoCompact: typeof rest.autoCompact === 'string' ? rest.autoCompact : '',
    }
    const nextOverlay = hydrateGrokOverlay(migrateGrokOverlayText(overlaySource), {
      name: typeof rest.name === 'string' ? rest.name : '',
      model: typeof rest.model === 'string' ? rest.model : '',
      baseUrl: typeof rest.baseUrl === 'string' ? rest.baseUrl : '',
      apiBackend: isGrokApiBackend(rest.apiBackend) ? rest.apiBackend : 'responses',
      ...columns,
    })
    const session = grokOverlaySession(nextOverlay)
    return {
      ...rest,
      apiBackend: isGrokApiBackend(rest.apiBackend) ? rest.apiBackend : 'responses',
      imageModel: typeof rest.imageModel === 'string' ? rest.imageModel : '',
      imageBaseUrl: typeof rest.imageBaseUrl === 'string' ? rest.imageBaseUrl : '',
      videoModel: typeof rest.videoModel === 'string' ? rest.videoModel : '',
      imageApiKeyPayload: typeof rest.imageApiKeyPayload === 'string' ? rest.imageApiKeyPayload : '',
      effortLevel: session.effortLevel || columns.effortLevel,
      permissionMode: session.permissionMode || columns.permissionMode,
      contextWindow: session.contextWindow || columns.contextWindow,
      autoCompact: session.autoCompact || columns.autoCompact,
      overlayToml: nextOverlay,
    }
  }

  private async write(file: StoreFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true })
    file.version = STORE_VERSION
    await this.writeAtomic(file)
  }

  private async writeAtomic(file: StoreFile): Promise<void> {
    await atomicWriteFile(this.filePath, `${JSON.stringify(file, null, 2)}\n`)
  }

  private emptyFile(): StoreFile {
    return {
      version: STORE_VERSION,
      activeProviderId: null,
      lastWriteAt: null,
      previousDefault: null,
      providers: [],
    }
  }
}

function emptyImageFields(): Pick<StoredGrokProvider, 'imageModel' | 'imageBaseUrl' | 'videoModel'> {
  return { imageModel: '', imageBaseUrl: '', videoModel: '' }
}
