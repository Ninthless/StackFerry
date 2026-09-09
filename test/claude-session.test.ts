import { describe, expect, it } from 'vitest'
import {
  CLAUDE_AUTO_COMPACT_MAX,
  CLAUDE_AUTO_COMPACT_MIN,
  claudeOverlayFields,
  desktopSupports1m,
  formatClaudeOverlayJson,
  hydrateClaudeOverlay,
  parseClaudeSession,
  persistClaudeSession,
  suggestedClaudeAutoCompact,
  syncedClaudeAutoCompact,
  withClaudeOverlayFields,
} from '../shared/claude-session'
import { expectAppError } from './expect-app-error'

describe('claude session', () => {
  it('parses empty fields as unset', () => {
    expect(parseClaudeSession({})).toEqual({
      effortLevel: '',
      permissionMode: '',
      contextWindow: null,
      autoCompact: null,
      overlay: null,
    })
    expect(parseClaudeSession({ overlayJson: '{}' }).overlay).toBeNull()
  })

  it('accepts persisted effort, window, compact, and overlay', () => {
    const session = parseClaudeSession({
      effortLevel: 'high',
      permissionMode: 'acceptEdits',
      contextWindow: '200000',
      autoCompact: '180000',
      overlayJson: '{"permissions":{"allow":["Read"]},"env":{"KEEP_ME":"yes"}}',
    })
    expect(session.effortLevel).toBe('high')
    expect(session.permissionMode).toBe('acceptEdits')
    expect(session.contextWindow).toBe(200000)
    expect(session.autoCompact).toBe(180000)
    expect(session.overlay).toEqual({
      permissions: { allow: ['Read'] },
      env: { KEEP_ME: 'yes' },
    })
  })

  it('rejects invalid effort, compact range, and overlay shapes', () => {
    expectAppError(() => parseClaudeSession({ effortLevel: 'max' }), 'claude_effort')
    expectAppError(() => parseClaudeSession({ permissionMode: 'yolo' }), 'claude_permission')
    expectAppError(() => parseClaudeSession({ contextWindow: '0' }), 'overlay_positive_int')
    expectAppError(
      () => parseClaudeSession({ autoCompact: String(CLAUDE_AUTO_COMPACT_MIN - 1) }),
      'claude_compact_range',
    )
    expectAppError(
      () => parseClaudeSession({ autoCompact: String(CLAUDE_AUTO_COMPACT_MAX + 1) }),
      'claude_compact_range',
    )
    expectAppError(() => parseClaudeSession({ overlayJson: '[' }), 'claude_overlay_json')
    expectAppError(() => parseClaudeSession({ overlayJson: '[]' }), 'claude_overlay_object')
    expectAppError(() => parseClaudeSession({ overlayJson: '{"env":[]}' }), 'claude_overlay_env')
    expectAppError(
      () => parseClaudeSession({ overlayJson: '{"env":{"KEEP_ME":1}}' }),
      'claude_overlay_env',
    )
  })

  it('formats overlay json and persists canonical session strings', () => {
    expect(formatClaudeOverlayJson('')).toBe('')
    expect(formatClaudeOverlayJson('{ }')).toBe('')
    expect(formatClaudeOverlayJson('{"permissions":{"allow":["Read"]}}')).toBe(
      `${JSON.stringify({ permissions: { allow: ['Read'] } }, null, 2)}\n`,
    )
    expect(
      persistClaudeSession({
        effortLevel: 'xhigh',
        permissionMode: 'plan',
        contextWindow: '1000000',
        autoCompact: '500000',
        overlayJson: '{"statusLine":{"type":"command"}}',
      }),
    ).toEqual({
      effortLevel: 'xhigh',
      permissionMode: 'plan',
      contextWindow: '1000000',
      autoCompact: '500000',
      overlayJson: `${JSON.stringify(
        {
          statusLine: { type: 'command' },
          env: { CLAUDE_CODE_MAX_CONTEXT_TOKENS: '1000000' },
          effortLevel: 'xhigh',
          autoCompactWindow: 500000,
          permissions: { defaultMode: 'plan' },
        },
        null,
        2,
      )}\n`,
    })
  })

  it('reads and patches form-managed overlay fields like Codex', () => {
    expect(claudeOverlayFields('')).toEqual({
      baseUrl: '',
      model: '',
      effortLevel: '',
      permissionMode: '',
      contextWindow: '',
      autoCompact: '',
    })
    const patched = withClaudeOverlayFields('{"statusLine":{"type":"command"}}', {
      baseUrl: 'https://gateway.example/v1',
      model: 'claude-sonnet-4-6',
      effortLevel: 'high',
      permissionMode: 'acceptEdits',
      contextWindow: '200000',
      autoCompact: '180000',
    })
    expect(claudeOverlayFields(patched)).toEqual({
      baseUrl: 'https://gateway.example/v1',
      model: 'claude-sonnet-4-6',
      effortLevel: 'high',
      permissionMode: 'acceptEdits',
      contextWindow: '200000',
      autoCompact: '180000',
    })
    expect(JSON.parse(patched)).toEqual({
      statusLine: { type: 'command' },
      env: {
        ANTHROPIC_BASE_URL: 'https://gateway.example/v1',
        ANTHROPIC_MODEL: 'claude-sonnet-4-6',
        CLAUDE_CODE_MAX_CONTEXT_TOKENS: '200000',
      },
      effortLevel: 'high',
      autoCompactWindow: 180000,
      permissions: { defaultMode: 'acceptEdits' },
    })
  })

  it('hydrates missing overlay keys from columns without dropping extras', () => {
    const next = hydrateClaudeOverlay('{"permissions":{"allow":["Read"]}}', {
      baseUrl: 'https://gateway.example/v1',
      model: 'alias-1m',
      effortLevel: 'low',
      permissionMode: 'plan',
      contextWindow: '1000000',
      autoCompact: '500000',
    })
    expect(JSON.parse(next)).toEqual({
      permissions: { allow: ['Read'], defaultMode: 'plan' },
      env: {
        ANTHROPIC_BASE_URL: 'https://gateway.example/v1',
        ANTHROPIC_MODEL: 'alias-1m',
        CLAUDE_CODE_MAX_CONTEXT_TOKENS: '1000000',
      },
      effortLevel: 'low',
      autoCompactWindow: 500000,
    })
  })

  it('suggests compact at 90% only when the value is in Claude Code range', () => {
    expect(suggestedClaudeAutoCompact(200000)).toBe(180000)
    expect(suggestedClaudeAutoCompact(50000)).toBeNull()
    expect(syncedClaudeAutoCompact('200000', '', '')).toBe('180000')
    expect(syncedClaudeAutoCompact('200000', '200000', '190000')).toBeUndefined()
    expect(syncedClaudeAutoCompact('', '200000', '180000')).toBe('')
    expect(desktopSupports1m(999999)).toBe(false)
    expect(desktopSupports1m(1000000)).toBe(true)
  })
})
