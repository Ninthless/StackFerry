import { AppError } from '../../../shared/app-error'
import { persistClaudeModels } from '../../../shared/claude-models'
import type { ClaudeAuthScheme } from '../../../shared/types'

export const STACKFERRY_DESKTOP_PROFILE_ID = '5f00c1a0-de5f-4000-8000-537461636b46'
export const LEGACY_STACKFERRY_DESKTOP_PROFILE_ID = 'stackferry'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type DesktopMetaEntry = {
  id: string
  name: string
}

export type DesktopMeta = {
  appliedId: string | null
  entries: DesktopMetaEntry[]
}

export type DesktopGatewayConfig = {
  id?: string
  name: string
  baseUrl: string
  apiKey: string
  authScheme: ClaudeAuthScheme
  model: string
  models?: string[]
  supports1m?: boolean
}

export type DesktopInferenceModel = {
  name: string
  labelOverride: string
  supports1m?: true
  prefer1m?: true
}

export type DesktopGatewayProfile = {
  inferenceProvider: 'gateway'
  inferenceCredentialKind: 'static'
  inferenceGatewayBaseUrl: string
  inferenceGatewayApiKey: string
  inferenceGatewayAuthScheme: ClaudeAuthScheme
  disableDeploymentModeChooser: true
  inferenceModels?: DesktopInferenceModel[]
}

export type DesktopDeploymentMode = '1p' | '3p'

export function isLeftoverOwnedDesktopProfileId(id: string): boolean {
  if (id === STACKFERRY_DESKTOP_PROFILE_ID) return false
  return id === LEGACY_STACKFERRY_DESKTOP_PROFILE_ID || UUID_RE.test(id)
}

export function parseDesktopMeta(value: unknown): DesktopMeta {
  if (value === undefined || value === null) {
    return { appliedId: null, entries: [] }
  }
  if (!isPlainObject(value)) throw new AppError('claude_desktop_meta_corrupt')
  const appliedId =
    value.appliedId === undefined || value.appliedId === null ? null : String(value.appliedId)
  const rawEntries = Array.isArray(value.entries) ? value.entries : []
  const entries: DesktopMetaEntry[] = []
  for (const item of rawEntries) {
    if (!isPlainObject(item) || typeof item.id !== 'string' || !item.id) {
      throw new AppError('claude_desktop_meta_corrupt')
    }
    entries.push({
      id: item.id,
      name: typeof item.name === 'string' && item.name ? item.name : item.id,
    })
  }
  return { appliedId, entries }
}

export function applyDesktopGateway(
  meta: DesktopMeta,
  provider: DesktopGatewayConfig,
): { meta: DesktopMeta; profile: DesktopGatewayProfile } {
  const profile = buildDesktopGatewayProfile(provider)
  const profileId = STACKFERRY_DESKTOP_PROFILE_ID
  return {
    meta: {
      appliedId: profileId,
      entries: upsertEntry(withoutLeftoverOwnedEntries(meta.entries), {
        id: profileId,
        name: provider.name,
      }),
    },
    profile,
  }
}

export function applyDesktopOfficial(meta: DesktopMeta): DesktopMeta {
  return {
    appliedId: null,
    entries: meta.entries,
  }
}

export function buildDesktopGatewayProfile(provider: DesktopGatewayConfig): DesktopGatewayProfile {
  // 只写入配置的网关 ID；空列表省略 inferenceModels。不要再注入 Claude Code 别名。
  const { models: names } = persistClaudeModels(provider.model, provider.models)
  const profile: DesktopGatewayProfile = {
    inferenceProvider: 'gateway',
    inferenceCredentialKind: 'static',
    inferenceGatewayBaseUrl: provider.baseUrl,
    inferenceGatewayApiKey: provider.apiKey,
    inferenceGatewayAuthScheme: provider.authScheme,
    disableDeploymentModeChooser: true,
  }
  if (names.length === 0) return profile
  profile.inferenceModels = names.map((name, index) =>
    desktopInferenceModel(name, Boolean(provider.supports1m) && index === 0),
  )
  return profile
}

function desktopInferenceModel(model: string, supports1m: boolean | undefined): DesktopInferenceModel {
  if (!supports1m) return { name: model, labelOverride: model }
  return { name: model, labelOverride: model, supports1m: true, prefer1m: true }
}

export function applyDesktopDeploymentMode(
  current: unknown,
  mode: DesktopDeploymentMode,
): Record<string, unknown> {
  const root = isPlainObject(current) ? { ...current } : {}
  root.deploymentMode = mode
  return root
}

export function parseDesktopAppConfig(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new AppError('claude_desktop_config_corrupt')
  }
}

function withoutLeftoverOwnedEntries(entries: DesktopMetaEntry[]): DesktopMetaEntry[] {
  return entries.filter((entry) => !isLeftoverOwnedDesktopProfileId(entry.id))
}

function upsertEntry(entries: DesktopMetaEntry[], next: DesktopMetaEntry): DesktopMetaEntry[] {
  const index = entries.findIndex((entry) => entry.id === next.id)
  if (index < 0) return [...entries, next]
  const copy = [...entries]
  copy[index] = next
  return copy
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
