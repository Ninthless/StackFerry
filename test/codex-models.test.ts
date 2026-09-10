import { describe, expect, it } from 'vitest'
import {
  catalogPathForToml,
  encodeCodexCatalog,
  isOwnedCatalogPath,
  persistCodexModels,
  uniqueCodexModelIds,
} from '../shared/codex-models'

describe('unique Codex model ids', () => {
  it('keeps order and drops blanks and duplicates', () => {
    expect(uniqueCodexModelIds(['  gpt-5.4 ', '', 'gpt-5', 'gpt-5.4'])).toEqual(['gpt-5.4', 'gpt-5'])
  })
})

describe('persist Codex models', () => {
  it('does not seed an empty catalog from the default model', () => {
    expect(persistCodexModels('gpt-5.4', undefined)).toEqual({ model: 'gpt-5.4', models: [] })
    expect(persistCodexModels('gpt-5.4', [])).toEqual({ model: 'gpt-5.4', models: [] })
  })

  it('keeps the default first when it is already in the catalog', () => {
    expect(persistCodexModels(' gpt-5.4 ', ['gpt-5', 'gpt-5.4', 1, '  '])).toEqual({
      model: 'gpt-5.4',
      models: ['gpt-5.4', 'gpt-5'],
    })
  })

  it('falls back to the first catalog id when the default is missing', () => {
    expect(persistCodexModels('missing', ['gpt-5', 'gpt-5.4'])).toEqual({
      model: 'gpt-5',
      models: ['gpt-5', 'gpt-5.4'],
    })
  })
})

describe('Codex catalog encoding', () => {
  it('writes Codex ModelInfo required catalog fields', () => {
    expect(encodeCodexCatalog([' gpt-5.4 ', 'gpt-5.4', 'gpt-5'])).toEqual({
      models: [expectedCatalogEntry('gpt-5.4'), expectedCatalogEntry('gpt-5')],
    })
  })

  it('treats Windows and POSIX paths to the same catalog as owned', () => {
    const owned = 'C:\\Users\\me\\.codex\\model-catalogs\\stackferry.json'
    expect(catalogPathForToml(owned)).toBe('C:/Users/me/.codex/model-catalogs/stackferry.json')
    expect(isOwnedCatalogPath('C:/Users/me/.codex/model-catalogs/stackferry.json', owned)).toBe(true)
    expect(isOwnedCatalogPath('/tmp/other.json', owned)).toBe(false)
  })
})

function expectedCatalogEntry(slug: string) {
  return {
    slug,
    display_name: slug,
    description: slug,
    visibility: 'list',
    shell_type: 'default',
    supported_reasoning_levels: [],
    input_modalities: ['text'],
    supported_in_api: true,
    priority: 1000,
    availability_nux: null,
    upgrade: null,
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
