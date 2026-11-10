import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { safeStorage } from 'electron'
import { AppError } from '../../../shared/app-error'
import { orderByIds } from '../../../shared/id-order'
import { isPiApi, isPiThinkingLevel, type PiApi, type PiProviderDraft, type PiProviderListItem, type ProviderKind } from '../../../shared/types'
import { atomicWriteFile } from '../codex/writer'
import type { PiRememberedDefault } from './config'

const STORE_VERSION = 1
const OFFICIAL_ID = 'official'

export type StoredPiProvider = {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  model: string
  api: PiApi
  apiKeyPayload: string
  thinkingLevel: string
  contextWindow: string
  createdAt: string
  updatedAt: string
}

type StoreFile = {
  version: number
  activeProviderId: string | null
  lastWriteAt: string | null
  previousProvider: string | null
  previousModel: string | null
  providers: StoredPiProvider[]
}

export class PiProviderStore {
  constructor(private readonly filePath: string) {}

  async list(): Promise<PiProviderListItem[]> {
    const file = await this.read()
    return file.providers.map((provider) => this.toListItem(provider, file.activeProviderId))
  }

  async add(draft: PiProviderDraft): Promise<PiProviderListItem> {
    const file = await this.read()
    const kind = draft.kind === 'official' ? 'official' : 'custom'
    if (kind === 'official' && file.providers.some((provider) => provider.kind === 'official')) {
      throw new AppError('official_exists')
    }
    const now = new Date().toISOString()
    const provider: StoredPiProvider = {
      id: kind === 'official' ? OFFICIAL_ID : randomUUID(),
      name: requireName(draft.name),
      kind,
      baseUrl: kind === 'official' ? '' : requireHttpUrl(draft.baseUrl),
      model: kind === 'official' ? '' : requireModel(draft.model),
      api: kind === 'official' ? 'openai-completions' : requireApi(draft.api),
      apiKeyPayload: encryptApiKey(kind, draft.apiKey),
      thinkingLevel: kind === 'official' ? '' : optionalThinking(draft.thinkingLevel),
      contextWindow: kind === 'official' ? '' : optionalContextWindow(draft.contextWindow),
      createdAt: now,
      updatedAt: now,
    }
    assertReady(provider, draft.apiKey)
    file.providers.push(provider)
    await this.write(file)
    return this.toListItem(provider, file.activeProviderId)
  }

  async update(id: string, draft: PiProviderDraft): Promise<PiProviderListItem> {
    const file = await this.read()
    const provider = requireProvider(file, id)
    if (provider.kind === 'official') throw new AppError('official_locked')
    provider.name = requireName(draft.name)
    if (provider.kind === 'custom') {
      provider.baseUrl = requireHttpUrl(draft.baseUrl)
      provider.model = requireModel(draft.model)
      provider.api = requireApi(draft.api)
      if (draft.apiKey?.trim()) provider.apiKeyPayload = encryptApiKey(provider.kind, draft.apiKey)
      provider.thinkingLevel = optionalThinking(draft.thinkingLevel)
      provider.contextWindow = optionalContextWindow(draft.contextWindow)
    }
    assertReady(provider, draft.apiKey)
    provider.updatedAt = new Date().toISOString()
    await this.write(file)
    return this.toListItem(provider, file.activeProviderId)
  }

  async reorder(ids: string[]): Promise<PiProviderListItem[]> {
    const file = await this.read()
    const next = orderByIds(file.providers, ids)
    if (!next) throw new AppError('provider_order')
    file.providers = next
    await this.write(file)
    return file.providers.map((provider) => this.toListItem(provider, file.activeProviderId))
  }

  async delete(id: string): Promise<void> {
    const file = await this.read()
    const provider = requireProvider(file, id)
    if (provider.kind === 'official') throw new AppError('official_locked')
    file.providers = file.providers.filter((item) => item.id !== id)
    if (file.activeProviderId === id) file.activeProviderId = null
    await this.write(file)
  }

  async peek(id: string): Promise<StoredPiProvider> {
    return requireProvider(await this.read(), id)
  }

  async readApiKey(id: string): Promise<string> {
    return this.decryptApiKey(await this.peek(id))
  }

  async markEnabled(id: string): Promise<void> {
    const file = await this.read()
    requireProvider(file, id)
    file.activeProviderId = id
    file.lastWriteAt = new Date().toISOString()
    await this.write(file)
  }

  async getActiveId(): Promise<string | null> {
    return (await this.read()).activeProviderId
  }

  async getLastWriteAt(): Promise<string | null> {
    return (await this.read()).lastWriteAt
  }

  async getPreviousDefault(): Promise<PiRememberedDefault | null> {
    const file = await this.read()
    if (!file.previousProvider) return null
    return { provider: file.previousProvider, model: file.previousModel ?? '' }
  }

  async setPreviousDefault(value: PiRememberedDefault): Promise<void> {
    const file = await this.read()
    if (file.previousProvider) return
    file.previousProvider = value.provider
    file.previousModel = value.model
    await this.write(file)
  }

  async clearPreviousDefault(): Promise<void> {
    const file = await this.read()
    if (!file.previousProvider && !file.previousModel) return
    file.previousProvider = null
    file.previousModel = null
    await this.write(file)
  }

  decryptApiKey(provider: StoredPiProvider): string {
    if (!provider.apiKeyPayload) return ''
    if (!safeStorage.isEncryptionAvailable()) throw new AppError('secret_storage_unavailable_read')
    return safeStorage.decryptString(Buffer.from(provider.apiKeyPayload, 'base64'))
  }

  private toListItem(provider: StoredPiProvider, activeProviderId: string | null): PiProviderListItem {
    return {
      id: provider.id,
      name: provider.name,
      kind: provider.kind,
      baseUrl: provider.baseUrl,
      model: provider.model,
      api: provider.api,
      thinkingLevel: provider.thinkingLevel,
      contextWindow: provider.contextWindow,
      hasApiKey: Boolean(provider.apiKeyPayload),
      enabled: provider.id === activeProviderId,
    }
  }

  private async read(): Promise<StoreFile> {
    if (!existsSync(this.filePath)) return emptyFile()
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as StoreFile
      if (!Array.isArray(parsed.providers) || parsed.version !== STORE_VERSION) {
        throw new AppError('store_corrupt')
      }
      parsed.previousProvider = typeof parsed.previousProvider === 'string' ? parsed.previousProvider : null
      parsed.previousModel = typeof parsed.previousModel === 'string' ? parsed.previousModel : null
      parsed.activeProviderId = typeof parsed.activeProviderId === 'string' ? parsed.activeProviderId : null
      parsed.lastWriteAt = typeof parsed.lastWriteAt === 'string' ? parsed.lastWriteAt : null
      parsed.providers = parsed.providers.map((provider) => ({
        ...provider,
        thinkingLevel: isPiThinkingLevel(provider.thinkingLevel) ? provider.thinkingLevel : '',
        contextWindow:
          typeof provider.contextWindow === 'string' && /^[1-9]\d*$/.test(provider.contextWindow)
            ? provider.contextWindow
            : '',
      }))
      return parsed
    } catch (error) {
      if (error instanceof AppError) throw error
      throw new AppError('store_corrupt')
    }
  }

  private async write(file: StoreFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true })
    file.version = STORE_VERSION
    await atomicWriteFile(this.filePath, `${JSON.stringify(file, null, 2)}\n`)
  }
}

function emptyFile(): StoreFile {
  return {
    version: STORE_VERSION,
    activeProviderId: null,
    lastWriteAt: null,
    previousProvider: null,
    previousModel: null,
    providers: [],
  }
}

function requireName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new AppError('provider_name_required')
  return trimmed
}

function requireModel(value: string | undefined): string {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) throw new AppError('pi_model_required')
  return trimmed
}

function optionalThinking(value: string | undefined): string {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return ''
  if (!isPiThinkingLevel(trimmed)) throw new AppError('pi_thinking_level')
  return trimmed
}

function optionalContextWindow(value: string | undefined): string {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return ''
  if (!/^[1-9]\d*$/.test(trimmed)) throw new AppError('pi_context_window')
  return trimmed
}

function requireApi(value: PiApi | undefined): PiApi {
  if (!isPiApi(value)) throw new AppError('pi_api')
  return value
}

function requireHttpUrl(value: string | undefined): string {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) throw new AppError('models_missing_base_url')
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new AppError('models_invalid_url')
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError('models_invalid_url')
  }
  return trimmed
}

function assertReady(provider: StoredPiProvider, incomingKey: string | undefined): void {
  if (provider.kind === 'official') return
  if (!provider.apiKeyPayload && !incomingKey?.trim()) throw new AppError('api_key_required')
}

function encryptApiKey(kind: ProviderKind, apiKey: string | undefined): string {
  if (kind === 'official') return ''
  const trimmed = apiKey?.trim() ?? ''
  if (!trimmed) return ''
  if (!safeStorage.isEncryptionAvailable()) throw new AppError('secret_storage_unavailable_write')
  return safeStorage.encryptString(trimmed).toString('base64')
}

function requireProvider(file: StoreFile, id: string): StoredPiProvider {
  const provider = file.providers.find((item) => item.id === id)
  if (!provider) throw new AppError('provider_missing')
  return provider
}
