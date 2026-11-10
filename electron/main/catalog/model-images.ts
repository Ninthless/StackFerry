import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { outboundFetch } from '../egress/fetch'
import { imageVotes, seesImages } from '../../../shared/model-images'

const CATALOG_URL = 'https://models.dev/api.json'
const CACHE_FILE = 'models-dev.json'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 20_000

type CacheFile = {
  fetchedAt: string
  images: Record<string, true>
}

export type ModelImageCatalog = {
  ready: () => Promise<void>
  seesImages: (id: string) => boolean
}

export function modelImageCatalog(userData: string): ModelImageCatalog {
  const filePath = path.join(userData, CACHE_FILE)
  let images = new Map<string, boolean>()
  let loading: Promise<void> | null = null

  function load(): Promise<void> {
    loading ??= readCache(filePath).then((cached) => {
      images = cached.images
      if (!cached.expired) return
      return refresh(filePath).then((next) => {
        images = next
      })
    })
    return loading
  }

  return {
    ready: load,
    seesImages(id: string): boolean {
      void load()
      return seesImages(id, images)
    },
  }
}

async function readCache(filePath: string): Promise<{ images: Map<string, boolean>; expired: boolean }> {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as Partial<CacheFile>
    if (!parsed.images || typeof parsed.images !== 'object' || Array.isArray(parsed.images)) {
      return { images: new Map(), expired: true }
    }
    const fetchedAt = Date.parse(parsed.fetchedAt ?? '')
    return {
      images: new Map(Object.keys(parsed.images).map((id) => [id, true])),
      expired: !Number.isFinite(fetchedAt) || Date.now() - fetchedAt > CACHE_TTL_MS,
    }
  } catch {
    return { images: new Map(), expired: true }
  }
}

async function refresh(filePath: string): Promise<Map<string, boolean>> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    const response = await outboundFetch(CATALOG_URL, { signal: controller.signal }).finally(() => {
      clearTimeout(timer)
    })
    if (!response.ok) return (await readCache(filePath)).images
    const payload = (await response.json()) as { models?: unknown }[] | Record<string, { models?: unknown }>
    const providers = Array.isArray(payload) ? payload : Object.values(payload)
    const images = imageVotes(providers)
    await mkdir(path.dirname(filePath), { recursive: true })
    const file: CacheFile = {
      fetchedAt: new Date().toISOString(),
      images: Object.fromEntries([...images.keys()].map((id) => [id, true])),
    }
    await writeFile(filePath, `${JSON.stringify(file)}\n`)
    return images
  } catch {
    return (await readCache(filePath)).images
  }
}
