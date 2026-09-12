import { AppError } from './app-error'
import { isClaudeAuthScheme } from './claude-presets'
import { uniqueCodexModelIds } from './codex-models'
import { isGrokApiBackend } from './grok-presets'
import {
  isOverlayWireApi,
  RESERVED_PROVIDER_IDS,
  starterOverlayToml,
  withOverlayWireApi,
  type OverlayWireApi,
} from './provider-overlay'
import type {
  ClaudeAuthScheme,
  ClaudeProviderDraft,
  GrokApiBackend,
  GrokProviderDraft,
  ProviderDraft,
} from './types'

export const PROVIDER_IMPORT_SCHEME = 'stackferry'
export const PROVIDER_IMPORT_MAX_BYTES = 32_768
export const PROVIDER_IMPORT_TARGETS = ['codex', 'claude', 'grok'] as const

// NewAPI 只替换 `{address}` / `{key}`，不会编码 `{stackferryConfig}`。
export const NEW_API_CHAT_LINK =
  `${PROVIDER_IMPORT_SCHEME}://import/providers?v=1&name=New%20API&baseUrl={address}&apiKey={key}&targets=codex,claude,grok`

export type ProviderImportTarget = (typeof PROVIDER_IMPORT_TARGETS)[number]

export type ProviderImportDrafts = {
  codex?: ProviderDraft
  claude?: ClaudeProviderDraft
  grok?: GrokProviderDraft
}

export type ProviderImportOffer = {
  name: string
  baseUrl: string
  apiKey: string
  targets: ProviderImportTarget[]
  maskedKey: string
  drafts: ProviderImportDrafts
}

type ProviderImportPayload = {
  name: string
  baseUrl: string
  apiKey: string
  targets: ProviderImportTarget[]
  model: string
  models: string[]
  wireApi: OverlayWireApi
  claudeAuthScheme: ClaudeAuthScheme
  grokApiBackend: GrokApiBackend
}

export function isProviderImportTarget(value: unknown): value is ProviderImportTarget {
  return typeof value === 'string' && (PROVIDER_IMPORT_TARGETS as readonly string[]).includes(value)
}

export function encodeProviderImportData(payload: unknown): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
}

export function encodeProviderImportUrl(payload: unknown): string {
  return `${PROVIDER_IMPORT_SCHEME}://import/providers?v=1&data=${encodeProviderImportData(payload)}`
}

export function findProviderImportUrl(argv: readonly string[]): string | null {
  for (const arg of argv) {
    if (arg.startsWith(`${PROVIDER_IMPORT_SCHEME}://`)) return arg
  }
  return null
}

export function parseProviderImportUrl(raw: string): ProviderImportOffer {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new AppError('import_url')
  }
  if (url.protocol !== `${PROVIDER_IMPORT_SCHEME}:`) throw new AppError('import_url')
  if (!isProviderImportPath(url)) throw new AppError('import_url')
  const version = url.searchParams.get('v')
  if (version && version !== '1') throw new AppError('import_version')
  const data = url.searchParams.get('data')
  if (data) return parseProviderImportData(data)
  if (hasQueryPayload(url.searchParams)) return parseProviderImportQuery(url.searchParams)
  throw new AppError('import_payload')
}

export function parseProviderImportData(data: string): ProviderImportOffer {
  if (data.length > PROVIDER_IMPORT_MAX_BYTES * 2) throw new AppError('import_payload')
  let json: string
  try {
    json = new TextDecoder().decode(base64UrlToBytes(data))
  } catch {
    throw new AppError('import_payload')
  }
  if (!json || new TextEncoder().encode(json).byteLength > PROVIDER_IMPORT_MAX_BYTES) {
    throw new AppError('import_payload')
  }
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new AppError('import_payload')
  }
  const payload = parsePayload(raw)
  return toOffer(payload)
}

function hasQueryPayload(params: URLSearchParams): boolean {
  return params.has('baseUrl') || params.has('apiKey')
}

function parseProviderImportQuery(params: URLSearchParams): ProviderImportOffer {
  const baseUrl = optionalQuery(params, 'baseUrl') ?? ''
  const targetsText = params.get('targets')
  const modelsText = optionalQuery(params, 'models')
  return toOffer(
    parsePayload({
      name: optionalQuery(params, 'name') || hostnameFrom(baseUrl),
      baseUrl,
      apiKey: optionalQuery(params, 'apiKey') ?? '',
      targets:
        targetsText === null
          ? [...PROVIDER_IMPORT_TARGETS]
          : targetsText.split(',').map((item) => item.trim()),
      model: optionalQuery(params, 'model'),
      models: modelsText ? modelsText.split(',').map((item) => item.trim()) : undefined,
      wireApi: optionalQuery(params, 'wireApi'),
      claudeAuthScheme: optionalQuery(params, 'claudeAuthScheme'),
      grokApiBackend: optionalQuery(params, 'grokApiBackend'),
    }),
  )
}

function toOffer(payload: ProviderImportPayload): ProviderImportOffer {
  return {
    name: payload.name,
    baseUrl: payload.baseUrl,
    apiKey: payload.apiKey,
    targets: payload.targets,
    maskedKey: maskApiKey(payload.apiKey),
    drafts: toDrafts(payload),
  }
}

function optionalQuery(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)
  if (value === null || !value.trim()) return undefined
  return value.trim()
}

function hostnameFrom(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname
  } catch {
    return ''
  }
}

function parsePayload(raw: unknown): ProviderImportPayload {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new AppError('import_payload')
  const row = raw as Record<string, unknown>
  const name = readRequiredText(row.name, 'import_invalid')
  const baseUrl = readBaseUrl(row.baseUrl)
  const apiKey = readRequiredText(row.apiKey, 'api_key_required')
  const targets = readTargets(row.targets)
  const model = typeof row.model === 'string' ? row.model.trim() : ''
  const models = uniqueCodexModelIds(
    Array.isArray(row.models) ? row.models.filter((item) => typeof item === 'string') : [],
  )
  if (row.wireApi !== undefined && !isOverlayWireApi(row.wireApi)) throw new AppError('overlay_wire_api')
  if (row.claudeAuthScheme !== undefined && !isClaudeAuthScheme(row.claudeAuthScheme)) {
    throw new AppError('claude_auth_scheme')
  }
  if (row.grokApiBackend !== undefined && !isGrokApiBackend(row.grokApiBackend)) {
    throw new AppError('grok_api_backend')
  }
  return {
    name,
    baseUrl,
    apiKey,
    targets,
    model,
    models,
    wireApi: isOverlayWireApi(row.wireApi) ? row.wireApi : 'responses',
    claudeAuthScheme: isClaudeAuthScheme(row.claudeAuthScheme) ? row.claudeAuthScheme : 'bearer',
    grokApiBackend: isGrokApiBackend(row.grokApiBackend) ? row.grokApiBackend : 'responses',
  }
}

function toDrafts(payload: ProviderImportPayload): ProviderImportDrafts {
  const drafts: ProviderImportDrafts = {}
  if (payload.targets.includes('codex')) {
    const tomlText = withOverlayWireApi(
      starterOverlayToml({
        providerId: overlayTableId(payload.name),
        name: payload.name,
        baseUrl: payload.baseUrl,
        model: payload.model,
      }),
      payload.wireApi,
    )
    drafts.codex = {
      name: payload.name,
      kind: 'custom',
      tomlText,
      models: payload.models,
      apiKey: payload.apiKey,
      presetId: 'custom',
    }
  }
  if (payload.targets.includes('claude')) {
    drafts.claude = {
      name: payload.name,
      kind: 'custom',
      baseUrl: payload.baseUrl,
      model: payload.model,
      models: payload.models,
      authScheme: payload.claudeAuthScheme,
      apiKey: payload.apiKey,
      presetId: 'custom',
    }
  }
  if (payload.targets.includes('grok')) {
    drafts.grok = {
      name: payload.name,
      kind: 'custom',
      baseUrl: payload.baseUrl,
      model: payload.model,
      apiBackend: payload.grokApiBackend,
      apiKey: payload.apiKey,
      presetId: 'custom',
    }
  }
  return drafts
}

function readTargets(value: unknown): ProviderImportTarget[] {
  if (!Array.isArray(value) || value.length === 0) throw new AppError('import_targets')
  const seen = new Set<ProviderImportTarget>()
  const targets: ProviderImportTarget[] = []
  for (const item of value) {
    if (!isProviderImportTarget(item)) throw new AppError('import_targets')
    if (seen.has(item)) continue
    seen.add(item)
    targets.push(item)
  }
  if (targets.length === 0) throw new AppError('import_targets')
  return targets
}

function readBaseUrl(value: unknown): string {
  const text = readRequiredText(value, 'import_invalid')
  let parsed: URL
  try {
    parsed = new URL(text)
  } catch {
    throw new AppError('import_invalid')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError('models_unsupported_protocol')
  }
  return text
}

function readRequiredText(value: unknown, code: 'import_invalid' | 'api_key_required'): string {
  if (typeof value !== 'string' || !value.trim()) throw new AppError(code)
  return value.trim()
}

function isProviderImportPath(url: URL): boolean {
  // `stackferry://import/providers` 里 `import` 会被 WHATWG URL 解析成 hostname。
  const hostPath = `${url.hostname}${url.pathname}`.replace(/\/+$/, '')
  return hostPath === 'import/providers' || url.pathname.replace(/\/+$/, '') === '/import/providers'
}

function overlayTableId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)
  const id = slug && /^[a-z]/.test(slug) ? slug : `imported_${slug || 'provider'}`
  return RESERVED_PROVIDER_IDS.has(id) ? `${id}_custom` : id
}

function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 4) return '••••'
  return `••••${apiKey.slice(-4)}`
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(data: string): Uint8Array {
  const padded = padBase64(data.replace(/-/g, '+').replace(/_/g, '/'))
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function padBase64(data: string): string {
  const remainder = data.length % 4
  return remainder === 0 ? data : `${data}${'='.repeat(4 - remainder)}`
}
