import { describe, expect, it } from 'vitest'
import { AppError } from '../shared/app-error'
import { applyCodeGateway, applyCodeOfficial, parseCodeSettings } from '../electron/main/claude/code-merge'

describe('claude code merge', () => {
  it('merges gateway env without dropping unrelated keys', () => {
    const next = applyCodeGateway(
      {
        permissions: { allow: ['Bash(npm *)'] },
        env: { KEEP_ME: 'yes', ANTHROPIC_API_KEY: 'old-key' },
      },
      {
        baseUrl: 'https://gateway.example/v1',
        apiKey: 'token-a',
        authScheme: 'bearer',
        model: 'claude-sonnet-4-6',
      },
    )

    expect(next.permissions).toEqual({ allow: ['Bash(npm *)'] })
    expect(next.env).toEqual({
      KEEP_ME: 'yes',
      ANTHROPIC_BASE_URL: 'https://gateway.example/v1',
      ANTHROPIC_AUTH_TOKEN: 'token-a',
      ANTHROPIC_MODEL: 'claude-sonnet-4-6',
      CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
      CLAUDE_CODE_ATTRIBUTION_HEADER: '0',
    })
  })

  it('writes x-api-key and clears the bearer token', () => {
    const next = applyCodeGateway(
      {
        env: { ANTHROPIC_AUTH_TOKEN: 'old-token' },
      },
      {
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-ant',
        authScheme: 'x-api-key',
        model: '',
      },
    )

    expect(next.env).toEqual({
      ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
      ANTHROPIC_API_KEY: 'sk-ant',
      CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
      CLAUDE_CODE_ATTRIBUTION_HEADER: '0',
    })
  })

  it('writes session fields and overlays extra settings without letting overlay steal managed keys', () => {
    const next = applyCodeGateway(
      {
        permissions: { deny: ['WebFetch'] },
        env: { KEEP_ME: 'yes' },
        effortLevel: 'low',
      },
      {
        baseUrl: 'https://gateway.example/v1',
        apiKey: 'token-a',
        authScheme: 'bearer',
        model: 'alias-1m',
        effortLevel: 'high',
        contextWindow: '1000000',
        autoCompact: '500000',
        overlayJson: JSON.stringify({
          permissions: { allow: ['Read'] },
          statusLine: { type: 'command' },
          effortLevel: 'low',
          env: {
            KEEP_ME: 'from-overlay',
            ANTHROPIC_AUTH_TOKEN: 'stolen',
            CLAUDE_CODE_MAX_CONTEXT_TOKENS: '1',
            CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '0',
            CLAUDE_CODE_ATTRIBUTION_HEADER: '1',
            DISABLE_PROMPT_CACHING: '1',
          },
        }),
      },
    )

    expect(next.permissions).toEqual({ allow: ['Read'] })
    expect(next.statusLine).toEqual({ type: 'command' })
    expect(next.effortLevel).toBe('high')
    expect(next.autoCompactWindow).toBe(500000)
    expect(next.env).toEqual({
      KEEP_ME: 'from-overlay',
      ANTHROPIC_BASE_URL: 'https://gateway.example/v1',
      ANTHROPIC_AUTH_TOKEN: 'token-a',
      ANTHROPIC_MODEL: 'alias-1m',
      CLAUDE_CODE_MAX_CONTEXT_TOKENS: '1000000',
      CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
      CLAUDE_CODE_ATTRIBUTION_HEADER: '0',
      DISABLE_PROMPT_CACHING: '1',
    })
  })

  it('clears managed session keys when they are left unset', () => {
    const next = applyCodeGateway(
      {
        effortLevel: 'high',
        autoCompactWindow: 500000,
        env: {
          CLAUDE_CODE_MAX_CONTEXT_TOKENS: '200000',
          CLAUDE_CODE_EFFORT_LEVEL: 'max',
          CLAUDE_CODE_AUTO_COMPACT_WINDOW: '500000',
        },
      },
      {
        baseUrl: 'https://gateway.example/v1',
        apiKey: 'token-a',
        authScheme: 'bearer',
        model: '',
      },
    )

    expect(next.effortLevel).toBeUndefined()
    expect(next.autoCompactWindow).toBeUndefined()
    expect(next.env).toEqual({
      ANTHROPIC_BASE_URL: 'https://gateway.example/v1',
      ANTHROPIC_AUTH_TOKEN: 'token-a',
      CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
      CLAUDE_CODE_ATTRIBUTION_HEADER: '0',
    })
  })

  it('writes permissions.defaultMode without replacing allow or deny rules', () => {
    const next = applyCodeGateway(
      {
        permissions: { allow: ['Bash(npm *)'], deny: ['WebFetch'] },
      },
      {
        baseUrl: 'https://gateway.example/v1',
        apiKey: 'token-a',
        authScheme: 'bearer',
        model: 'claude-sonnet-4-6',
        permissionMode: 'acceptEdits',
      },
    )

    expect(next.permissions).toEqual({
      allow: ['Bash(npm *)'],
      deny: ['WebFetch'],
      defaultMode: 'acceptEdits',
    })
  })

  it('lets the session defaultMode replace an overlay defaultMode', () => {
    const next = applyCodeGateway(
      {},
      {
        baseUrl: 'https://gateway.example/v1',
        apiKey: 'token-a',
        authScheme: 'bearer',
        model: '',
        permissionMode: 'plan',
        overlayJson: JSON.stringify({
          permissions: { allow: ['Read'], defaultMode: 'auto' },
        }),
      },
    )

    expect(next.permissions).toEqual({ allow: ['Read'], defaultMode: 'plan' })
  })

  it('clears defaultMode when unset and drops an empty permissions object', () => {
    const next = applyCodeGateway(
      {
        permissions: { defaultMode: 'auto' },
      },
      {
        baseUrl: 'https://gateway.example/v1',
        apiKey: 'token-a',
        authScheme: 'bearer',
        model: '',
      },
    )

    expect(next.permissions).toBeUndefined()
  })

  it('strips managed session keys on official restore', () => {
    const next = applyCodeOfficial({
      permissions: { deny: ['WebFetch'], defaultMode: 'auto' },
      effortLevel: 'high',
      autoCompactWindow: 500000,
      env: {
        KEEP_ME: 'yes',
        ANTHROPIC_BASE_URL: 'https://gateway.example/v1',
        ANTHROPIC_AUTH_TOKEN: 'token-a',
        ANTHROPIC_API_KEY: 'sk-ant',
        ANTHROPIC_MODEL: 'claude-sonnet-4-6',
        CLAUDE_CODE_MAX_CONTEXT_TOKENS: '1000000',
        CLAUDE_CODE_EFFORT_LEVEL: 'high',
        CLAUDE_CODE_AUTO_COMPACT_WINDOW: '500000',
        CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
        CLAUDE_CODE_ATTRIBUTION_HEADER: '0',
      },
    })

    expect(next.permissions).toEqual({ deny: ['WebFetch'] })
    expect(next.effortLevel).toBeUndefined()
    expect(next.autoCompactWindow).toBeUndefined()
    expect(next.env).toEqual({ KEEP_ME: 'yes' })
  })

  it('drops an empty env object after official restore', () => {
    const next = applyCodeOfficial({
      env: { ANTHROPIC_BASE_URL: 'https://gateway.example/v1' },
    })
    expect(next.env).toBeUndefined()
  })

  it('rejects corrupt settings json', () => {
    expect(() => parseCodeSettings('{')).toThrow(AppError)
    try {
      parseCodeSettings('{')
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe('claude_settings_corrupt')
    }
  })
})
