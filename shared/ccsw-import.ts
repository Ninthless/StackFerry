import { AppError } from './app-error'
import {
  REASONING_EFFORTS,
  RESERVED_PROVIDER_IDS,
  isApprovalPolicy,
  parseToml,
  serializeProviderOverlay,
  type ProviderOverlay,
  type TomlTable,
} from './provider-overlay'
import type { ClaudeAuthScheme, ClaudeProviderDraft, ProviderDraft } from './types'

export const CCSW_DB_FILE_NAME = 'cc-switch.db'
export const CCSW_DIR_NAME = '.cc-switch'

export type CcswAppType = 'claude' | 'claude-desktop' | 'codex'

export type CcswProviderRow = {
  id: string
  appType: string
  name: string
  category: string | null
  settingsConfig: string
}

export type CcswDraft =
  | { target: 'codex'; name: string; draft: ProviderDraft }
  | { target: 'claude'; name: string; draft: ClaudeProviderDraft }

export type CcswSkipReason =
  | 'unsupported_app'
  | 'official'
  | 'bad_config'
  | 'missing_credentials'

export type CcswImportCandidate = {
  dbPath: string
  codex: number
  claude: number
  skipped: number
}

export type CcswImportResult = {
  dbPath: string
  importedCodex: number
  importedClaude: number
  skipped: number
}

export type CcswParseOutcome =
  | { ok: true; draft: CcswDraft }
  | { ok: false; reason: CcswSkipReason }

/**
 * cc-switch providers 表覆盖 claude / claude-desktop / codex / gemini / grokbuild，
 * StackFerry 目前只承接 claude、claude-desktop 与 codex。
 */
export function isCcswAppType(value: string): value is CcswAppType {
  return value === 'claude' || value === 'claude-desktop' || value === 'codex'
}

export function parseCcswRow(row: CcswProviderRow): CcswParseOutcome {
  if (!isCcswAppType(row.appType)) return { ok: false, reason: 'unsupported_app' }
  const name = row.name.trim()
  if (!name) return { ok: false, reason: 'bad_config' }
  if (row.category === 'official' || row.id.endsWith('-official')) {
    return { ok: false, reason: 'official' }
  }
  let config: unknown
  try {
    config = JSON.parse(row.settingsConfig)
  } catch {
    return { ok: false, reason: 'bad_config' }
  }
  if (!isPlainObject(config)) return { ok: false, reason: 'bad_config' }
  try {
    return row.appType === 'codex' ? parseCodexConfig(name, config) : parseClaudeConfig(name, config)
  } catch (error) {
    if (error instanceof AppError) return { ok: false, reason: 'bad_config' }
    return { ok: false, reason: 'bad_config' }
  }
}

export type CcswParsedBatch = {
  codex: Extract<CcswDraft, { target: 'codex' }>[]
  claude: Extract<CcswDraft, { target: 'claude' }>[]
  skipped: CcswSkipReason[]
}

export function parseCcswRows(rows: CcswProviderRow[]): CcswParsedBatch {
  const batch: CcswParsedBatch = { codex: [], claude: [], skipped: [] }
  for (const row of rows) {
    const outcome = parseCcswRow(row)
    if (!outcome.ok) {
      batch.skipped.push(outcome.reason)
      continue
    }
    if (outcome.draft.target === 'codex') batch.codex.push(outcome.draft)
    else batch.claude.push(outcome.draft)
  }
  return batch
}

function parseCodexConfig(name: string, config: TomlTable): CcswParseOutcome {
  const tomlText = typeof config.config === 'string' ? config.config : ''
  const doc = tomlText.trim() ? parseToml(tomlText) : {}
  const providers = isPlainObject(doc.model_providers) ? doc.model_providers : null
  if (!providers) return { ok: false, reason: 'bad_config' }

  const tableKey = pickProviderKey(doc, providers)
  const sourceTable = providers[tableKey]
  if (!isPlainObject(sourceTable)) return { ok: false, reason: 'bad_config' }
  const baseUrl = asTrimmedString(sourceTable.base_url)
  if (!baseUrl) return { ok: false, reason: 'bad_config' }

  const apiKey = resolveCodexApiKey(config, sourceTable)
  if (!apiKey) return { ok: false, reason: 'missing_credentials' }

  const model = asTrimmedString(doc.model)
  const effort = pickAllowed(asTrimmedString(doc.model_reasoning_effort), REASONING_EFFORTS)
  const approvalRaw = asTrimmedString(doc.approval_policy)
  const approval = isApprovalPolicy(approvalRaw) ? approvalRaw : ''

  // 只保留 StackFerry 认识的 provider 表字段；密钥交给安全存储，不写进 TOML。
  const table: TomlTable = { name, base_url: baseUrl, wire_api: asTrimmedString(sourceTable.wire_api) === 'chat' ? 'chat' : 'responses' }
  if (isPlainObject(sourceTable.http_headers)) table.http_headers = sourceTable.http_headers
  const envKey = asTrimmedString(sourceTable.env_key)
  if (envKey) table.env_key = envKey
  if (isPlainObject(sourceTable.auth) && asTrimmedString((sourceTable.auth as TomlTable).command)) {
    table.auth = sourceTable.auth
  }

  const overlay: ProviderOverlay = {
    tableKey: 'custom',
    table,
    model,
    reasoningEffort: effort,
    contextWindow: null,
    autoCompact: null,
    approvalPolicy: approval,
  }
  return {
    ok: true,
    draft: {
      target: 'codex',
      name,
      draft: {
        name,
        kind: 'custom',
        tomlText: serializeProviderOverlay(overlay),
        apiKey,
        presetId: 'custom',
      },
    },
  }
}

function pickProviderKey(doc: TomlTable, providers: TomlTable): string {
  const declared = asTrimmedString(doc.model_provider)
  const keys = Object.keys(providers)
  if (declared && keys.includes(declared) && !RESERVED_PROVIDER_IDS.has(declared)) return declared
  // cc-switch 常在同一份 live config 里残留多个 provider 表，优先非保留的自定义项。
  const custom = keys.find((key) => !RESERVED_PROVIDER_IDS.has(key))
  return custom ?? keys[0]
}

function resolveCodexApiKey(config: TomlTable, table: TomlTable): string {
  const auth = isPlainObject(config.auth) ? config.auth : null
  const fromAuth = asTrimmedString(auth?.OPENAI_API_KEY)
  if (fromAuth) return fromAuth
  return asTrimmedString(table.experimental_bearer_token)
}

function parseClaudeConfig(name: string, config: TomlTable): CcswParseOutcome {
  const sourceEnv = isPlainObject(config.env) ? config.env : {}
  const baseUrl = asTrimmedString(sourceEnv.ANTHROPIC_BASE_URL)
  if (!baseUrl) return { ok: false, reason: 'bad_config' }

  const authToken = asTrimmedString(sourceEnv.ANTHROPIC_AUTH_TOKEN)
  const apiKeyEnv = asTrimmedString(sourceEnv.ANTHROPIC_API_KEY)
  const resolvedKey = authToken || apiKeyEnv
  if (!resolvedKey) return { ok: false, reason: 'missing_credentials' }
  const authScheme: ClaudeAuthScheme = apiKeyEnv && !authToken ? 'x-api-key' : 'bearer'

  const model = asTrimmedString(sourceEnv.ANTHROPIC_MODEL)
  const effort = pickAllowed(asTrimmedString(config.effortLevel), ['low', 'medium', 'high', 'xhigh'])
  const sourcePermissions = isPlainObject(config.permissions) ? config.permissions : null
  const permissionMode = pickAllowed(asTrimmedString(sourcePermissions?.defaultMode), [
    'default',
    'acceptEdits',
    'plan',
    'auto',
    'dontAsk',
    'bypassPermissions',
  ])
  const contextWindow = positiveIntText(sourceEnv.CLAUDE_CODE_MAX_CONTEXT_TOKENS)
  const autoCompact = positiveIntText(config.autoCompactWindow)

  const env: TomlTable = { ANTHROPIC_BASE_URL: baseUrl }
  for (const [key, value] of Object.entries(sourceEnv)) {
    if (key === 'ANTHROPIC_BASE_URL') continue
    if (key === 'ANTHROPIC_AUTH_TOKEN' || key === 'ANTHROPIC_API_KEY') continue
    if (typeof value === 'string' && value) env[key] = value
  }
  const overlay: TomlTable = { env }
  if (effort) overlay.effortLevel = effort
  if (permissionMode && sourcePermissions) {
    overlay.permissions = { ...sourcePermissions, defaultMode: permissionMode }
  }
  if (autoCompact) overlay.autoCompactWindow = Number(autoCompact)

  return {
    ok: true,
    draft: {
      target: 'claude',
      name,
      draft: {
        name,
        kind: 'custom',
        presetId: 'custom',
        baseUrl,
        model,
        authScheme,
        apiKey: resolvedKey,
        effortLevel: effort,
        permissionMode,
        contextWindow,
        autoCompact,
        overlayJson: `${JSON.stringify(overlay, null, 2)}\n`,
      },
    },
  }
}

function positiveIntText(value: unknown): string {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return String(value)
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^\d+$/.test(trimmed) && Number(trimmed) > 0) return trimmed
  }
  return ''
}

function pickAllowed(value: string, allowed: readonly string[]): string {
  return value && allowed.includes(value) ? value : ''
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isPlainObject(value: unknown): value is TomlTable {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
