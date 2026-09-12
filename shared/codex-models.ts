import { REASONING_EFFORTS, type ReasoningEffort } from './provider-overlay'

export type CodexReasoningLevel = {
  effort: ReasoningEffort
  description: string
}

// Codex ModelInfo 若干字段没有 serde default；catalog 缺一项就会在启动时整份拒读。
export type CodexCatalogEntry = {
  slug: string
  display_name: string
  description: string
  visibility: 'list'
  shell_type: 'default'
  supported_reasoning_levels: CodexReasoningLevel[]
  input_modalities: ['text']
  supported_in_api: true
  priority: 1000
  availability_nux: null
  upgrade: null
  base_instructions: ''
  supports_reasoning_summaries: false
  support_verbosity: false
  default_verbosity: null
  apply_patch_tool_type: null
  truncation_policy: { mode: 'bytes'; limit: 10_000 }
  supports_parallel_tool_calls: false
  experimental_supported_tools: []
}

export type CodexCatalogFile = {
  models: CodexCatalogEntry[]
}

export function uniqueCodexModelIds(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const id of ids) {
    const trimmed = id.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

export function persistCodexModels(
  defaultModel: string | undefined,
  models: readonly unknown[] | undefined,
): { model: string; models: string[] } {
  // 合集为空时不把默认模型塞进去，避免启用后用单条 catalog 盖掉 Codex 内置 /model。
  const listed = uniqueCodexModelIds(
    (models ?? []).filter((item): item is string => typeof item === 'string'),
  )
  const fallback = (defaultModel ?? '').trim()
  if (listed.length === 0) {
    return { model: fallback, models: [] }
  }
  const ordered = listed.includes(fallback) ? uniqueCodexModelIds([fallback, ...listed]) : listed
  return { model: ordered[0] ?? '', models: ordered }
}

export function encodeCodexCatalog(models: readonly string[]): CodexCatalogFile {
  return {
    models: uniqueCodexModelIds(models).map(codexCatalogEntry),
  }
}

function codexCatalogEntry(slug: string): CodexCatalogEntry {
  return {
    slug,
    display_name: slug,
    description: slug,
    visibility: 'list',
    shell_type: 'default',
    // 空数组时 Codex App 没有可选档位，思考等级会落在 ReasoningEffort 默认值 medium 且无法改。
    supported_reasoning_levels: catalogReasoningLevels(),
    input_modalities: ['text'],
    supported_in_api: true,
    priority: 1000,
    availability_nux: null,
    upgrade: null,
    // 留空：自定义 slug 没有 Codex 官方系统提示。
    base_instructions: '',
    supports_reasoning_summaries: false,
    support_verbosity: false,
    default_verbosity: null,
    apply_patch_tool_type: null,
    truncation_policy: { mode: 'bytes', limit: 10_000 },
    supports_parallel_tool_calls: false,
    experimental_supported_tools: [],
  }
}

function catalogReasoningLevels(): CodexReasoningLevel[] {
  return REASONING_EFFORTS.map((effort) => ({
    effort,
    description: REASONING_LEVEL_DESCRIPTIONS[effort],
  }))
}

const REASONING_LEVEL_DESCRIPTIONS: Record<ReasoningEffort, string> = {
  none: 'No extra reasoning; fastest replies',
  minimal: 'Lowest reasoning for simple, well-specified tasks',
  low: 'Light reasoning for small, well-scoped changes',
  medium: 'Balances speed and reasoning depth for everyday tasks',
  high: 'Greater reasoning depth for complex problems',
  xhigh: 'Extra high reasoning depth for complex problems',
  max: 'Maximum reasoning depth for the hardest problems',
  ultra: 'Maximum reasoning with automatic task delegation',
  persistent: 'Sustained high reasoning across a long session',
}

export function catalogPathForToml(filePath: string): string {
  return filePath.replaceAll('\\', '/')
}

export function isOwnedCatalogPath(value: unknown, ownedPath: string): boolean {
  if (typeof value !== 'string') return false
  const current = catalogPathForToml(value.trim())
  const owned = catalogPathForToml(ownedPath.trim())
  if (!current || !owned) return false
  return current.localeCompare(owned, undefined, { sensitivity: 'accent' }) === 0
}
