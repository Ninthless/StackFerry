import { describe, expect, it } from 'vitest'
import {
  formatGrokOverlayToml,
  grokOverlayIdentity,
  grokOverlaySession,
  hydrateGrokOverlay,
  hydrateGrokOverlaySession,
  migrateGrokOverlayText,
  parseGrokSession,
  persistGrokSession,
  withGrokOverlayIdentity,
  withGrokOverlaySession,
} from '../shared/grok-session'
import { stringifyToml } from '../shared/provider-overlay'
import { expectAppError } from './expect-app-error'

describe('grok session', () => {
  it('parses empty fields as unset', () => {
    expect(parseGrokSession({})).toEqual({
      effortLevel: '',
      permissionMode: '',
      contextWindow: null,
      autoCompact: null,
      overlay: null,
    })
    expect(parseGrokSession({ overlayToml: '' }).overlay).toBeNull()
  })

  it('accepts persisted effort, window, compact percent, and toml overlay', () => {
    const session = parseGrokSession({
      effortLevel: 'high',
      permissionMode: 'always-approve',
      contextWindow: '200000',
      autoCompact: '85',
      overlayToml: `temperature = 0.2

[models]
max_retries = 3

[extra_headers]
x-api-key = "sk"
`,
    })
    expect(session.effortLevel).toBe('high')
    expect(session.permissionMode).toBe('always-approve')
    expect(session.contextWindow).toBe(200000)
    expect(session.autoCompact).toBe(85)
    expect(session.overlay).toEqual({
      temperature: 0.2,
      extra_headers: { 'x-api-key': 'sk' },
      models: { max_retries: 3 },
    })
  })

  it('rejects invalid effort, compact range, and overlay shapes', () => {
    expectAppError(() => parseGrokSession({ effortLevel: 'ultra' }), 'grok_effort')
    expectAppError(() => parseGrokSession({ permissionMode: 'yolo' }), 'grok_permission')
    expectAppError(() => parseGrokSession({ contextWindow: '0' }), 'overlay_positive_int')
    expectAppError(() => parseGrokSession({ autoCompact: '-1' }), 'grok_compact_range')
    expectAppError(() => parseGrokSession({ autoCompact: '101' }), 'grok_compact_range')
    expectAppError(() => parseGrokSession({ overlayToml: '[' }), 'toml_parse_failed')
    expectAppError(
      () => parseGrokSession({ overlayToml: '[sandbox]\nprofile = "strict"\n' }),
      'grok_overlay_unsupported_top_level',
    )
    expectAppError(
      () => parseGrokSession({ overlayToml: '[model]\nname = "nope"\n' }),
      'grok_overlay_unsupported_top_level',
    )
    expect(parseGrokSession({ overlayToml: 'model = "grok-4"\n' }).overlay).toEqual({
      model: 'grok-4',
    })
    expectAppError(
      () => parseGrokSession({ overlayToml: 'models = "grok-build"\n' }),
      'grok_overlay_table',
    )
  })

  it('formats overlay toml and persists session keys into the overlay', () => {
    expect(formatGrokOverlayToml('')).toBe('')
    expect(formatGrokOverlayToml('temperature = 0.7')).toBe(stringifyToml({ temperature: 0.7 }))
    expect(
      persistGrokSession({
        effortLevel: 'max',
        permissionMode: 'ask',
        contextWindow: '500000',
        autoCompact: '0',
        overlayToml: 'max_completion_tokens = 8192\n',
      }),
    ).toEqual({
      effortLevel: 'max',
      permissionMode: 'ask',
      contextWindow: '500000',
      autoCompact: '0',
      overlayToml: stringifyToml({
        max_completion_tokens: 8192,
        reasoning_effort: 'max',
        context_window: 500000,
        auto_compact_threshold_percent: 0,
        ui: { permission_mode: 'ask' },
      }),
    })
  })

  it('reads and patches session fields on the overlay like Codex', () => {
    expect(grokOverlaySession('')).toEqual({
      effortLevel: '',
      permissionMode: '',
      contextWindow: '',
      autoCompact: '',
    })
    const patched = withGrokOverlaySession('temperature = 0.2\n', {
      effortLevel: 'high',
      permissionMode: 'auto',
      contextWindow: '200000',
      autoCompact: '80',
    })
    expect(grokOverlaySession(patched)).toEqual({
      effortLevel: 'high',
      permissionMode: 'auto',
      contextWindow: '200000',
      autoCompact: '80',
    })
    expect(parseGrokSession({ overlayToml: patched })).toMatchObject({
      effortLevel: 'high',
      permissionMode: 'auto',
      contextWindow: 200000,
      autoCompact: 80,
    })
    expect(persistGrokSession({ overlayToml: patched })).toEqual({
      effortLevel: 'high',
      permissionMode: 'auto',
      contextWindow: '200000',
      autoCompact: '80',
      overlayToml: patched,
    })
    const cleared = withGrokOverlaySession(patched, {
      effortLevel: '',
      permissionMode: '',
      contextWindow: '',
      autoCompact: '',
    })
    expect(grokOverlaySession(cleared)).toEqual({
      effortLevel: '',
      permissionMode: '',
      contextWindow: '',
      autoCompact: '',
    })
    expect(cleared).toBe(stringifyToml({ temperature: 0.2 }))
  })

  it('reads and patches identity fields on the overlay like Codex', () => {
    expect(grokOverlayIdentity('')).toEqual({
      name: '',
      model: '',
      baseUrl: '',
      apiBackend: '',
    })
    const patched = withGrokOverlayIdentity('temperature = 0.2\n', {
      name: 'Custom',
      model: 'grok-4',
      baseUrl: 'https://gateway.test/v1',
      apiBackend: 'chat_completions',
    })
    expect(grokOverlayIdentity(patched)).toEqual({
      name: 'Custom',
      model: 'grok-4',
      baseUrl: 'https://gateway.test/v1',
      apiBackend: 'chat_completions',
    })
    expect(persistGrokSession({
      name: 'Custom',
      model: 'grok-4',
      baseUrl: 'https://gateway.test/v1',
      apiBackend: 'responses',
      overlayToml: 'temperature = 0.2\n',
    }).overlayToml).toBe(
      stringifyToml({
        temperature: 0.2,
        name: 'Custom',
        model: 'grok-4',
        base_url: 'https://gateway.test/v1',
        api_backend: 'responses',
      }),
    )
  })

  it('hydrates missing identity keys from columns without overwriting extras', () => {
    expect(
      hydrateGrokOverlay('temperature = 0.2\n', {
        name: 'Custom',
        model: 'grok-4',
        baseUrl: 'https://gateway.test/v1',
        apiBackend: 'responses',
        effortLevel: 'low',
        permissionMode: 'ask',
        contextWindow: '128000',
        autoCompact: '85',
      }),
    ).toBe(
      stringifyToml({
        temperature: 0.2,
        name: 'Custom',
        model: 'grok-4',
        base_url: 'https://gateway.test/v1',
        api_backend: 'responses',
        reasoning_effort: 'low',
        context_window: 128000,
        auto_compact_threshold_percent: 85,
        ui: { permission_mode: 'ask' },
      }),
    )
  })

  it('hydrates legacy session columns into an overlay that lacks them', () => {
    expect(
      hydrateGrokOverlaySession('temperature = 0.2\n', {
        effortLevel: 'low',
        permissionMode: 'ask',
        contextWindow: '128000',
        autoCompact: '85',
      }),
    ).toBe(
      stringifyToml({
        temperature: 0.2,
        reasoning_effort: 'low',
        context_window: 128000,
        auto_compact_threshold_percent: 85,
        ui: { permission_mode: 'ask' },
      }),
    )
  })

  it('migrates legacy JSON overlay objects into toml', () => {
    expect(migrateGrokOverlayText('')).toBe('')
    expect(migrateGrokOverlayText('{}')).toBe('')
    expect(migrateGrokOverlayText('{"temperature":0.2}')).toBe(stringifyToml({ temperature: 0.2 }))
    expect(migrateGrokOverlayText('temperature = 0.2\n')).toBe('temperature = 0.2\n')
  })
})
