import { describe, expect, it } from 'vitest'
import { parseCcswRow, parseCcswRows, type CcswProviderRow } from '../shared/ccsw-import'

function row(overrides: Partial<CcswProviderRow>): CcswProviderRow {
  return {
    id: 'acme',
    appType: 'codex',
    name: 'Acme',
    category: 'custom',
    settingsConfig: '',
    ...overrides,
  }
}

function codexConfig(settings: Record<string, unknown>): string {
  return JSON.stringify(settings)
}

function codexToml(baseUrl: string): string {
  return [
    'model = "gpt-demo"',
    'model_provider = "acme"',
    'model_reasoning_effort = "high"',
    'approval_policy = "on-request"',
    '',
    '[model_providers.acme]',
    'name = "Acme"',
    `base_url = "${baseUrl}"`,
    'wire_api = "chat"',
    '',
  ].join('\n')
}

describe('parseCcswRow codex', () => {
  it('builds a codex draft from config config/auth fields', () => {
    const outcome = parseCcswRow(
      row({
        settingsConfig: codexConfig({
          config: codexToml('https://example.test/v1'),
          auth: { OPENAI_API_KEY: 'secret-key' },
        }),
      }),
    )
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.draft.target).toBe('codex')
    expect(outcome.draft.name).toBe('Acme')
    expect(outcome.draft.draft.apiKey).toBe('secret-key')
    expect(outcome.draft.draft.tomlText).toContain('model = "gpt-demo"')
    expect(outcome.draft.draft.tomlText).toContain('base_url = "https://example.test/v1"')
    expect(outcome.draft.draft.tomlText).toContain('model_reasoning_effort = "high"')
    expect(outcome.draft.draft.tomlText).toContain('approval_policy = "on-request"')
    // 密钥不进 TOML。
    expect(outcome.draft.draft.tomlText).not.toContain('secret-key')
  })

  it('falls back to experimental_bearer_token when auth map has no key', () => {
    const toml = `${codexToml('https://example.test/v1')}experimental_bearer_token = "bearer-1"\n`
    const outcome = parseCcswRow(row({ settingsConfig: codexConfig({ config: toml, auth: {} }) }))
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.draft.draft.apiKey).toBe('bearer-1')
  })

  it('skips official providers', () => {
    expect(parseCcswRow(row({ category: 'official' }))).toEqual({ ok: false, reason: 'official' })
    expect(parseCcswRow(row({ id: 'openai-official', category: 'custom' }))).toEqual({
      ok: false,
      reason: 'official',
    })
  })

  it('skips unsupported apps and bad configs', () => {
    expect(parseCcswRow(row({ appType: 'grokbuild' }))).toEqual({
      ok: false,
      reason: 'unsupported_app',
    })
    expect(parseCcswRow(row({ name: '  ' }))).toEqual({ ok: false, reason: 'bad_config' })
    expect(parseCcswRow(row({ settingsConfig: '{not json' }))).toEqual({
      ok: false,
      reason: 'bad_config',
    })
    expect(parseCcswRow(row({ settingsConfig: '[]' }))).toEqual({ ok: false, reason: 'bad_config' })
    expect(
      parseCcswRow(row({ settingsConfig: codexConfig({ config: 'model = "x"\n' }) })),
    ).toEqual({ ok: false, reason: 'bad_config' })
  })

  it('skips entries without credentials', () => {
    const outcome = parseCcswRow(
      row({ settingsConfig: codexConfig({ config: codexToml('https://example.test/v1'), auth: {} }) }),
    )
    expect(outcome).toEqual({ ok: false, reason: 'missing_credentials' })
  })
})

describe('parseCcswRow claude', () => {
  function claudeRow(env: Record<string, string>, extra: Record<string, unknown> = {}): CcswProviderRow {
    return row({
      id: 'claude-acme',
      appType: 'claude',
      settingsConfig: JSON.stringify({ env, ...extra }),
    })
  }

  it('builds a bearer claude draft and keeps session fields', () => {
    const outcome = parseCcswRow(
      claudeRow(
        {
          ANTHROPIC_BASE_URL: 'https://claude.test',
          ANTHROPIC_AUTH_TOKEN: 'tok-1',
          ANTHROPIC_MODEL: 'sonnet-x',
          CLAUDE_CODE_MAX_CONTEXT_TOKENS: '200000',
        },
        {
          effortLevel: 'xhigh',
          autoCompactWindow: 180000,
          permissions: { defaultMode: 'acceptEdits', allow: ['Bash'] },
        },
      ),
    )
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.draft.target).toBe('claude')
    const draft = outcome.draft.draft
    expect(draft.baseUrl).toBe('https://claude.test')
    expect(draft.apiKey).toBe('tok-1')
    expect(draft.authScheme).toBe('bearer')
    expect(draft.model).toBe('sonnet-x')
    expect(draft.effortLevel).toBe('xhigh')
    expect(draft.permissionMode).toBe('acceptEdits')
    expect(draft.contextWindow).toBe('200000')
    expect(draft.autoCompact).toBe('180000')
    // 密钥不进 overlay JSON。
    expect(draft.overlayJson).not.toContain('tok-1')
    expect(draft.overlayJson).toContain('ANTHROPIC_BASE_URL')
  })

  it('uses x-api-key scheme when only ANTHROPIC_API_KEY is present', () => {
    const outcome = parseCcswRow(
      claudeRow({ ANTHROPIC_BASE_URL: 'https://claude.test', ANTHROPIC_API_KEY: 'key-1' }),
    )
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.draft.draft.authScheme).toBe('x-api-key')
    expect(outcome.draft.draft.apiKey).toBe('key-1')
  })

  it('skips claude rows without base url or credentials', () => {
    expect(parseCcswRow(claudeRow({ ANTHROPIC_AUTH_TOKEN: 'tok' }))).toEqual({
      ok: false,
      reason: 'bad_config',
    })
    expect(parseCcswRow(claudeRow({ ANTHROPIC_BASE_URL: 'https://claude.test' }))).toEqual({
      ok: false,
      reason: 'missing_credentials',
    })
  })

  it('accepts claude-desktop rows like claude rows', () => {
    const outcome = parseCcswRow(
      row({
        appType: 'claude-desktop',
        settingsConfig: JSON.stringify({
          env: { ANTHROPIC_BASE_URL: 'https://claude.test', ANTHROPIC_AUTH_TOKEN: 'tok' },
        }),
      }),
    )
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.draft.target).toBe('claude')
  })
})

describe('parseCcswRows', () => {
  it('groups codex and claude drafts and collects skip reasons in order', () => {
    const batch = parseCcswRows([
      row({
        settingsConfig: codexConfig({ config: codexToml('https://a.test'), auth: { OPENAI_API_KEY: 'k' } }),
      }),
      row({ appType: 'grokbuild' }),
      row({
        id: 'c1',
        appType: 'claude',
        settingsConfig: JSON.stringify({
          env: { ANTHROPIC_BASE_URL: 'https://c.test', ANTHROPIC_AUTH_TOKEN: 't' },
        }),
      }),
    ])
    expect(batch.codex).toHaveLength(1)
    expect(batch.claude).toHaveLength(1)
    expect(batch.skipped).toEqual(['unsupported_app'])
  })
})
