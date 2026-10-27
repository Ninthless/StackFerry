import { AppError } from '../../../shared/app-error'
import { ROUTER_PLACEHOLDER_KEY } from '../../../shared/routing'
import type { PiApi } from '../../../shared/types'

export const STACKFERRY_PI_PREFIX = 'stackferry-'

export type PiJson = Record<string, unknown>

export type PiLiveConfig = {
  id: string
  name: string
  baseUrl: string
  model: string
  api: PiApi
  apiKey: string
  thinkingLevel?: string
  contextWindow?: string
}

export type PiRememberedDefault = {
  provider: string
  model: string
}

export function piProviderKey(id: string): string {
  return `${STACKFERRY_PI_PREFIX}${id}`
}

export function isStackferryPiKey(key: string): boolean {
  return key.startsWith(STACKFERRY_PI_PREFIX)
}

export function parsePiJson(text: string): PiJson {
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    throw new AppError('pi_config_corrupt')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AppError('pi_config_corrupt')
  }
  return parsed as PiJson
}

export function rememberedPiDefault(settings: PiJson): PiRememberedDefault | null {
  const provider = typeof settings.defaultProvider === 'string' ? settings.defaultProvider.trim() : ''
  if (!provider || isStackferryPiKey(provider)) return null
  const model = typeof settings.defaultModel === 'string' ? settings.defaultModel.trim() : ''
  return { provider, model }
}

export function routerPiBaseUrl(port: number): string {
  return `http://127.0.0.1:${port}/v1`
}

export function applyDirectPiDocuments(
  models: PiJson,
  settings: PiJson,
  provider: PiLiveConfig,
): { models: PiJson; settings: PiJson } {
  return applyPiDocuments(models, settings, provider, provider.baseUrl, provider.apiKey)
}

export function applyRouterPiDocuments(
  models: PiJson,
  settings: PiJson,
  provider: PiLiveConfig,
  port: number,
): { models: PiJson; settings: PiJson } {
  return applyPiDocuments(models, settings, provider, routerPiBaseUrl(port), ROUTER_PLACEHOLDER_KEY)
}

export function applyOfficialPiDocuments(
  models: PiJson,
  settings: PiJson,
  previous: PiRememberedDefault | null,
): { models: PiJson; settings: PiJson } {
  const nextModels = { ...models, providers: withoutStackferryProviders(models) }
  const nextSettings = { ...settings }
  if (previous?.provider) {
    nextSettings.defaultProvider = previous.provider
    if (previous.model) nextSettings.defaultModel = previous.model
    else delete nextSettings.defaultModel
  } else if (typeof nextSettings.defaultProvider === 'string' && isStackferryPiKey(nextSettings.defaultProvider)) {
    delete nextSettings.defaultProvider
    delete nextSettings.defaultModel
  }
  assignThinkingLevels(nextSettings, retainedThinkingLevels(nextSettings.modelThinkingLevels))
  return { models: nextModels, settings: nextSettings }
}

export function assertSamePiApi(apis: readonly PiApi[]): void {
  if (new Set(apis).size > 1) throw new AppError('pi_api_mismatch')
}

export function piApisForQueue(
  providers: readonly { id: string; kind: string; api: PiApi }[],
  ids: readonly string[],
  replacement?: { id: string; api: PiApi },
): PiApi[] {
  const byId = new Map(providers.map((provider) => [provider.id, provider]))
  const apis: PiApi[] = []
  for (const id of ids) {
    if (replacement?.id === id) {
      apis.push(replacement.api)
      continue
    }
    const provider = byId.get(id)
    if (provider?.kind === 'custom') apis.push(provider.api)
  }
  return apis
}

function applyPiDocuments(
  models: PiJson,
  settings: PiJson,
  provider: PiLiveConfig,
  baseUrl: string,
  apiKey: string,
): { models: PiJson; settings: PiJson } {
  const key = piProviderKey(provider.id)
  const providers = withoutStackferryProviders(models)
  providers[key] = {
    name: provider.name,
    baseUrl,
    api: provider.api,
    apiKey,
    models: [piModelRecord(provider)],
  }
  const nextSettings: PiJson = {
    ...settings,
    defaultProvider: key,
    defaultModel: provider.model,
  }
  assignThinkingLevels(nextSettings, retainedThinkingLevels(settings.modelThinkingLevels, key, provider))
  return {
    models: { ...models, providers },
    settings: nextSettings,
  }
}

function piModelRecord(provider: PiLiveConfig): Record<string, unknown> {
  const model: Record<string, unknown> = { id: provider.model }
  const level = provider.thinkingLevel?.trim() ?? ''
  if (level) model.reasoning = true
  const context = provider.contextWindow?.trim() ?? ''
  if (/^[1-9]\d*$/.test(context)) model.contextWindow = Number(context)
  return model
}

function retainedThinkingLevels(
  current: unknown,
  key?: string,
  provider?: PiLiveConfig,
): Record<string, unknown> | undefined {
  const next: Record<string, unknown> = {}
  if (current && typeof current === 'object' && !Array.isArray(current)) {
    for (const [entryKey, value] of Object.entries(current)) {
      if (!entryKey.startsWith(STACKFERRY_PI_PREFIX)) next[entryKey] = value
    }
  }
  const level = provider?.thinkingLevel?.trim() ?? ''
  if (key && provider?.model && level) next[`${key}/${provider.model}`] = level
  return Object.keys(next).length > 0 ? next : undefined
}

function assignThinkingLevels(settings: PiJson, levels: Record<string, unknown> | undefined): void {
  if (levels) settings.modelThinkingLevels = levels
  else delete settings.modelThinkingLevels
}

function withoutStackferryProviders(models: PiJson): Record<string, unknown> {
  const current = models.providers
  const providers: Record<string, unknown> = {}
  if (!current || typeof current !== 'object' || Array.isArray(current)) return providers
  for (const [key, value] of Object.entries(current)) {
    if (!isStackferryPiKey(key)) providers[key] = value
  }
  return providers
}
