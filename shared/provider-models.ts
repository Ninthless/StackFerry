import { AppError } from './app-error'
import { modelEntry, type ModelEntry } from './model-entry'

export type ListedModel = {
  id: string
  images?: boolean
}

export function modelsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim()
  if (!trimmed) {
    throw new AppError('models_missing_base_url')
  }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new AppError('models_invalid_url')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError('models_unsupported_protocol')
  }
  const path = parsed.pathname.replace(/\/+$/, '')
  parsed.pathname = `${path}/models`
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}

export function parseModelsResponse(payload: unknown): ListedModel[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new AppError('models_invalid_payload')
  }
  const seen = new Set<string>()
  const models: ListedModel[] = []
  for (const item of payload.data) {
    const model = readListedModel(item)
    if (!model || seen.has(model.id)) continue
    seen.add(model.id)
    models.push(model)
  }
  if (models.length === 0) {
    throw new AppError('models_empty')
  }
  return models
}

export function applyListedImages(
  entries: readonly ModelEntry[],
  listed: readonly ListedModel[],
  knownImages: (id: string) => boolean = () => false,
): ModelEntry[] {
  const stated = new Map(
    listed.flatMap((model) => (model.images === undefined ? [] : [[model.id, model.images] as const])),
  )
  return entries.map((entry) => resolveListedImages(entry, stated.get(entry.id), knownImages))
}

function resolveListedImages(
  entry: ModelEntry,
  stated: boolean | undefined,
  knownImages: (id: string) => boolean,
): ModelEntry {
  if (entry.imagesSet) return entry
  const images = stated ?? (knownImages(entry.id) || entry.images)
  return images === entry.images ? entry : modelEntry(entry.id, images)
}

function readListedModel(item: unknown): ListedModel | null {
  if (!isRecord(item) || typeof item.id !== 'string') return null
  const id = item.id.trim()
  if (!id) return null
  const images = readListedImages(item)
  return images === undefined ? { id } : { id, images }
}

function readListedImages(item: Record<string, unknown>): boolean | undefined {
  const modalities = listedModalities(item)
  if (modalities) return modalities.some(isImageModality)
  if (Array.isArray(item.capabilities) && item.capabilities.some(isImageCapability)) return true
  return undefined
}

function listedModalities(item: Record<string, unknown>): string[] | null {
  if (Array.isArray(item.input_modalities)) return stringList(item.input_modalities)
  if (!isRecord(item.modalities) || !Array.isArray(item.modalities.input)) return null
  return stringList(item.modalities.input)
}

function stringList(values: readonly unknown[]): string[] {
  return values.filter((value): value is string => typeof value === 'string')
}

function isImageModality(value: string): boolean {
  const kind = value.trim().toLowerCase()
  return kind === 'image' || kind.startsWith('image/')
}

function isImageCapability(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().toLowerCase() === 'vision'
  if (!isRecord(value) || value.type !== 'image') return false
  return value.input !== false
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
