import { describe, expect, it } from 'vitest'
import {
  formatGrokOverlayJson,
  parseGrokSession,
  persistGrokSession,
} from '../shared/grok-session'
import { expectAppError } from './expect-app-error'

describe('grok session', () => {
  it('parses empty fields as unset', () => {
    expect(parseGrokSession({})).toEqual({
      effortLevel: '',
      contextWindow: null,
      autoCompact: null,
      overlay: null,
    })
    expect(parseGrokSession({ overlayJson: '{}' }).overlay).toBeNull()
  })

  it('accepts persisted effort, window, compact percent, and overlay', () => {
    const session = parseGrokSession({
      effortLevel: 'high',
      contextWindow: '200000',
      autoCompact: '85',
      overlayJson: '{"extra_headers":{"x-api-key":"sk"},"temperature":0.2}',
    })
    expect(session.effortLevel).toBe('high')
    expect(session.contextWindow).toBe(200000)
    expect(session.autoCompact).toBe(85)
    expect(session.overlay).toEqual({
      extra_headers: { 'x-api-key': 'sk' },
      temperature: 0.2,
    })
  })

  it('rejects invalid effort, compact range, and overlay shapes', () => {
    expectAppError(() => parseGrokSession({ effortLevel: 'ultra' }), 'grok_effort')
    expectAppError(() => parseGrokSession({ contextWindow: '0' }), 'overlay_positive_int')
    expectAppError(() => parseGrokSession({ autoCompact: '-1' }), 'grok_compact_range')
    expectAppError(() => parseGrokSession({ autoCompact: '101' }), 'grok_compact_range')
    expectAppError(() => parseGrokSession({ overlayJson: '[' }), 'grok_overlay_json')
    expectAppError(() => parseGrokSession({ overlayJson: '[]' }), 'grok_overlay_object')
    expectAppError(() => parseGrokSession({ overlayJson: '{"n":null}' }), 'grok_overlay_value')
  })

  it('formats overlay json and persists canonical session strings', () => {
    expect(formatGrokOverlayJson('')).toBe('')
    expect(formatGrokOverlayJson('{ }')).toBe('')
    expect(formatGrokOverlayJson('{"temperature":0.7}')).toBe(
      `${JSON.stringify({ temperature: 0.7 }, null, 2)}\n`,
    )
    expect(
      persistGrokSession({
        effortLevel: 'max',
        contextWindow: '500000',
        autoCompact: '0',
        overlayJson: '{"max_completion_tokens":8192}',
      }),
    ).toEqual({
      effortLevel: 'max',
      contextWindow: '500000',
      autoCompact: '0',
      overlayJson: `${JSON.stringify({ max_completion_tokens: 8192 }, null, 2)}\n`,
    })
  })
})
