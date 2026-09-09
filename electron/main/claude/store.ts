import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { safeStorage } from 'electron'
import { AppError } from '../../../shared/app-error'
import { findClaudePreset, isClaudeAuthScheme } from '../../../shared/claude-presets'
import { persistClaudeModels } from '../../../shared/claude-models'
import { hydrateClaudeOverlay, persistClaudeSession } from '../../../shared/claude-session'
import { orderByIds } from '../../../shared/id-order'
import type {
  ClaudeAuthScheme,
  ClaudeProviderDraft,
  ClaudeProviderListItem,
  ProviderKind,
} from '../../../shared/types'
import { atomicWriteFile } from '../codex/writer'

const STORE_VERSION = 1
const OFFICIAL_ID = 'official'

export type StoredClaudeProvider = {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  model: string
  models: string[]
  authScheme: ClaudeAuthScheme
  effortLevel: string
  permissionMode: string
  contextWindow: string
  autoCompact: string
  overlayJson: string
  apiKeyPayload: string
  createdAt: string
  updatedAt: string
}

type StoreFile = {
  version: number
  activeProviderId: string | null
  lastWriteAt: string | null
  providers: StoredClaudeProvider[]
}

export class ClaudeProviderStore {
  constructor(private readonly filePath: string) {}

  async list(): Promise<ClaudeProviderListItem[]> {
    const file = await this.read()
    return file.providers.map((provider) => this.toListItem(provider, file.activeProviderId))
  }

  async add(draft: ClaudeProviderDraft): Promise<ClaudeProviderListItem> {
    const file = await this.read()
    const kind = this.resolveKind(draft)
    if (kind === 'official' && file.providers.some((provider) => provider.kind === 'official')) {
      throw new AppError('official_exists')
    }
    const now = new Date().toISOString()
    const session = this.sessionFields(kind, draft)
    const persistedModels = this.persistModels(kind, draft)
    const provider: StoredClaudeProvider = {
      id: kind === 'official' ? OFFICIAL_ID : randomUUID(),
      name: this.requireName(draft.name),
      kind,
      baseUrl: kind === 'official' ? '' : this.requireBaseUrl(draft.baseUrl),
      ...persistedModels,
      authScheme: kind === 'official' ? 'bearer' : this.requireAuthScheme(draft.authScheme),
      ...session,
      apiKeyPayload: this.encryptApiKey(kind, draft.apiKey),
      createdAt: now,
      updatedAt: now,
    }
    this.assertReadyToSave(provider, draft.apiKey)
    file.providers.push(provider)
    await this.write(file)
    return this.toListItem(provider, file.activeProviderId)
  }

  async update(id: string, draft: ClaudeProviderDraft): Promise<ClaudeProviderListItem> {
    const file = await this.read()
    const provider = this.requireProvider(file, id)
    provider.name = this.requireName(draft.name)
    if (provider.kind === 'custom') {
      provider.baseUrl = this.requireBaseUrl(draft.baseUrl)
      Object.assign(provider, this.persistModels(provider.kind, draft))
      provider.authScheme = this.requireAuthScheme(draft.authScheme)
      Object.assign(provider, this.sessionFields(provider.kind, draft))
      if (draft.apiKey?.trim()) {
        provider.apiKeyPayload = this.encryptApiKey(provider.kind, draft.apiKey)
      }
    }
    this.assertReadyToSave(provider, draft.apiKey)
    provider.updatedAt = new Date().toISOString()
    await this.write(file)
    return this.toListItem(provider, file.activeProviderId)
  }

  async reorder(ids: string[]): Promise<ClaudeProviderListItem[]> {
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
    if (file.activeProviderId === id) {
      file.activeProviderId = null
    }
    await this.write(file)
  }

  async peek(id: string): Promise<StoredClaudeProvider> {
    const file = await this.read()
    return this.requireProvider(file, id)
  }

  async markEnabled(id: string): Promise<StoredClaudeProvider> {
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

  decryptApiKey(provider: StoredClaudeProvider): string {
    if (!provider.apiKeyPayload) return ''
    if (!safeStorage.isEncryptionAvailable()) {
      throw new AppError('secret_storage_unavailable_read')
    }
    return safeStorage.decryptString(Buffer.from(provider.apiKeyPayload, 'base64'))
  }

  private toListItem(
    provider: StoredClaudeProvider,
    activeProviderId: string | null,
  ): ClaudeProviderListItem {
    return {
      id: provider.id,
      name: provider.name,
      kind: provider.kind,
      baseUrl: provider.baseUrl,
      model: provider.model,
      models: provider.models,
      authScheme: provider.authScheme,
      effortLevel: provider.effortLevel,
      permissionMode: provider.permissionMode,
      contextWindow: provider.contextWindow,
      autoCompact: provider.autoCompact,
      overlayJson: provider.overlayJson,
      hasApiKey: Boolean(provider.apiKeyPayload),
      enabled: provider.id === activeProviderId,
    }
  }

  private resolveKind(draft: ClaudeProviderDraft): ProviderKind {
    const preset = findClaudePreset(draft.presetId)
    return preset?.kind ?? draft.kind
  }

  private requireName(name: string): string {
    const trimmed = name.trim()
    if (!trimmed) throw new AppError('provider_name_required')
    return trimmed
  }

  private requireBaseUrl(value: string | undefined): string {
    const trimmed = value?.trim() ?? ''
    if (!trimmed) throw new AppError('claude_base_url_required')
    try {
      const url = new URL(trimmed)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new AppError('claude_base_url_invalid')
      }
    } catch (error) {
      if (error instanceof AppError) throw error
      throw new AppError('claude_base_url_invalid')
    }
    return trimmed
  }

  private requireAuthScheme(value: ClaudeAuthScheme | undefined): ClaudeAuthScheme {
    if (!isClaudeAuthScheme(value)) throw new AppError('claude_auth_scheme')
    return value
  }

  private sessionFields(kind: ProviderKind, draft: ClaudeProviderDraft) {
    if (kind === 'official') {
      return { effortLevel: '', permissionMode: '', contextWindow: '', autoCompact: '', overlayJson: '' }
    }
    return persistClaudeSession(draft)
  }

  private persistModels(kind: ProviderKind, draft: ClaudeProviderDraft): { model: string; models: string[] } {
    if (kind === 'official') return { model: '', models: [] }
    return persistClaudeModels(draft.model, draft.models)
  }

  private normalizeProvider(provider: StoredClaudeProvider): StoredClaudeProvider {
    const persisted = persistClaudeModels(provider.model, provider.models)
    const effortLevel = typeof provider.effortLevel === 'string' ? provider.effortLevel : ''
    const permissionMode = typeof provider.permissionMode === 'string' ? provider.permissionMode : ''
    const contextWindow = typeof provider.contextWindow === 'string' ? provider.contextWindow : ''
    const autoCompact = typeof provider.autoCompact === 'string' ? provider.autoCompact : ''
    const overlaySource = typeof provider.overlayJson === 'string' ? provider.overlayJson : ''
    return {
      ...provider,
      ...persisted,
      effortLevel,
      permissionMode,
      contextWindow,
      autoCompact,
      overlayJson: hydrateClaudeOverlay(overlaySource, {
        baseUrl: typeof provider.baseUrl === 'string' ? provider.baseUrl : '',
        model: persisted.model,
        effortLevel,
        permissionMode,
        contextWindow,
        autoCompact,
      }),
    }
  }

  private assertReadyToSave(provider: StoredClaudeProvider, incomingKey: string | undefined): void {
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

  private requireProvider(file: StoreFile, id: string): StoredClaudeProvider {
    const provider = file.providers.find((item) => item.id === id)
    if (!provider) throw new AppError('provider_missing')
    return provider
  }

  private async read(): Promise<StoreFile> {
    if (!existsSync(this.filePath)) {
      return this.emptyFile()
    }
    const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as StoreFile
    if (!Array.isArray(parsed.providers) || parsed.version !== STORE_VERSION) {
      throw new AppError('store_corrupt')
    }
    parsed.providers = parsed.providers.map((provider) => this.normalizeProvider(provider))
    return parsed
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
