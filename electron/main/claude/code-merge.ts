import { AppError } from '../../../shared/app-error'
import { parseClaudeSession, type ClaudeSessionInput } from '../../../shared/claude-session'
import type { ClaudeAuthScheme } from '../../../shared/types'

export const MANAGED_CODE_ENV_KEYS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'CLAUDE_CODE_MAX_CONTEXT_TOKENS',
  'CLAUDE_CODE_EFFORT_LEVEL',
  'CLAUDE_CODE_AUTO_COMPACT_WINDOW',
  'CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS',
  'CLAUDE_CODE_ATTRIBUTION_HEADER',
] as const

export const MANAGED_CODE_ROOT_KEYS = ['effortLevel', 'autoCompactWindow'] as const

export type CodeLiveConfig = {
  baseUrl: string
  apiKey: string
  authScheme: ClaudeAuthScheme
  model: string
} & ClaudeSessionInput

export function applyCodeGateway(
  current: unknown,
  provider: CodeLiveConfig,
): Record<string, unknown> {
  const session = parseClaudeSession(provider)
  const root = cloneRoot(current)
  if (session.overlay) applyOverlay(root, session.overlay)
  const env = cloneEnv(root.env)
  env.ANTHROPIC_BASE_URL = provider.baseUrl
  if (provider.authScheme === 'bearer') {
    env.ANTHROPIC_AUTH_TOKEN = provider.apiKey
    delete env.ANTHROPIC_API_KEY
  } else {
    env.ANTHROPIC_API_KEY = provider.apiKey
    delete env.ANTHROPIC_AUTH_TOKEN
  }
  const model = provider.model.trim()
  if (model) env.ANTHROPIC_MODEL = model
  else delete env.ANTHROPIC_MODEL
  delete env.CLAUDE_CODE_EFFORT_LEVEL
  delete env.CLAUDE_CODE_AUTO_COMPACT_WINDOW
  if (session.contextWindow != null) {
    env.CLAUDE_CODE_MAX_CONTEXT_TOKENS = String(session.contextWindow)
  } else {
    delete env.CLAUDE_CODE_MAX_CONTEXT_TOKENS
  }
  // 第三方网关常因实验 beta 字段 400；attribution 块在非 api.anthropic.com 上会进 cache key。
  // 不写 DISABLE_PROMPT_CACHING：基础 cache_control 应继续发给上游。
  env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS = '1'
  env.CLAUDE_CODE_ATTRIBUTION_HEADER = '0'
  if (session.effortLevel) root.effortLevel = session.effortLevel
  else delete root.effortLevel
  if (session.autoCompact != null) root.autoCompactWindow = session.autoCompact
  else delete root.autoCompactWindow
  applyPermissionMode(root, session.permissionMode)
  root.env = env
  return root
}

export function applyCodeOfficial(current: unknown): Record<string, unknown> {
  const root = cloneRoot(current)
  const env = cloneEnv(root.env)
  for (const key of MANAGED_CODE_ENV_KEYS) {
    delete env[key]
  }
  for (const key of MANAGED_CODE_ROOT_KEYS) {
    delete root[key]
  }
  applyPermissionMode(root, '')
  if (Object.keys(env).length === 0) delete root.env
  else root.env = env
  return root
}

export function parseCodeSettings(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new AppError('claude_settings_corrupt')
  }
}

function applyPermissionMode(root: Record<string, unknown>, mode: string): void {
  // 只改 defaultMode；allow / ask / deny 仍由用户或 overlay 持有。
  const current = isPlainObject(root.permissions) ? { ...root.permissions } : {}
  if (mode) {
    current.defaultMode = mode
    root.permissions = current
    return
  }
  delete current.defaultMode
  if (Object.keys(current).length === 0) delete root.permissions
  else root.permissions = current
}

function applyOverlay(root: Record<string, unknown>, overlay: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(overlay)) {
    if (key === 'env' && isPlainObject(value)) {
      root.env = { ...cloneEnv(root.env), ...value }
      continue
    }
    root[key] = structuredClone(value)
  }
}

function cloneRoot(current: unknown): Record<string, unknown> {
  if (!isPlainObject(current)) return {}
  return { ...current }
}

function cloneEnv(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) return {}
  return { ...value }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
