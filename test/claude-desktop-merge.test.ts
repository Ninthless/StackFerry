import { describe, expect, it } from 'vitest'
import { AppError } from '../shared/app-error'
import {
  applyDesktopDeploymentMode,
  applyDesktopGateway,
  applyDesktopOfficial,
  parseDesktopMeta,
  STACKFERRY_DESKTOP_PROFILE_ID,
} from '../electron/main/claude/desktop-merge'

describe('claude desktop merge', () => {
  it('applies the stackferry gateway profile without dropping other entries', () => {
    const current = parseDesktopMeta({
      appliedId: 'other-profile',
      entries: [{ id: 'other-profile', name: 'Bedrock' }],
    })
    const next = applyDesktopGateway(current, {
      name: 'Corp Gateway',
      baseUrl: 'https://gateway.example/v1',
      apiKey: 'gw-key',
      authScheme: 'bearer',
      model: 'claude-sonnet-4-6',
    })

    expect(next.meta.appliedId).toBe(STACKFERRY_DESKTOP_PROFILE_ID)
    expect(next.meta.entries).toEqual([
      { id: 'other-profile', name: 'Bedrock' },
      { id: STACKFERRY_DESKTOP_PROFILE_ID, name: 'Corp Gateway' },
    ])
    expect(next.profile).toEqual({
      inferenceProvider: 'gateway',
      inferenceCredentialKind: 'static',
      inferenceGatewayBaseUrl: 'https://gateway.example/v1',
      inferenceGatewayApiKey: 'gw-key',
      inferenceGatewayAuthScheme: 'bearer',
      disableDeploymentModeChooser: true,
    })
  })

  it('updates the existing stackferry entry in place', () => {
    const current = parseDesktopMeta({
      appliedId: STACKFERRY_DESKTOP_PROFILE_ID,
      entries: [
        { id: STACKFERRY_DESKTOP_PROFILE_ID, name: 'Old' },
        { id: 'other-profile', name: 'Bedrock' },
      ],
    })
    const next = applyDesktopGateway(current, {
      name: 'New Gateway',
      baseUrl: 'https://gateway.example',
      apiKey: 'gw-key',
      authScheme: 'x-api-key',
      model: '',
    })

    expect(next.meta.entries).toEqual([
      { id: STACKFERRY_DESKTOP_PROFILE_ID, name: 'New Gateway' },
      { id: 'other-profile', name: 'Bedrock' },
    ])
    expect(next.profile.inferenceModels).toBeUndefined()
    expect(next.profile.modelDiscoveryEnabled).toBeUndefined()
    expect(next.profile.inferenceGatewayAuthScheme).toBe('x-api-key')
  })

  it('does not pin a one-item Desktop catalog from the default model', () => {
    const next = applyDesktopGateway(
      { appliedId: null, entries: [] },
      {
        name: 'Corp Gateway',
        baseUrl: 'https://gateway.example/v1',
        apiKey: 'gw-key',
        authScheme: 'bearer',
        model: 'claude-sonnet-4-6',
      },
    )
    expect(next.profile.inferenceModels).toBeUndefined()
  })

  it('writes the configured list with the default first', () => {
    const next = applyDesktopGateway(
      { appliedId: null, entries: [] },
      {
        name: 'Corp Gateway',
        baseUrl: 'https://gateway.example/v1',
        apiKey: 'gw-key',
        authScheme: 'bearer',
        model: 'gw-sonnet',
        models: ['gw-opus', 'gw-sonnet', 'gw-haiku'],
      },
    )
    expect(next.profile.modelDiscoveryEnabled).toBeUndefined()
    expect(next.profile.inferenceModels?.map((item) => item.name)).toEqual([
      'gw-sonnet',
      'gw-opus',
      'gw-haiku',
    ])
  })

  it('marks only the default model as 1M when the session window is at least one million', () => {
    const next = applyDesktopGateway(
      { appliedId: null, entries: [] },
      {
        name: 'Corp Gateway',
        baseUrl: 'https://gateway.example/v1',
        apiKey: 'gw-key',
        authScheme: 'bearer',
        model: 'alias-1m',
        models: ['alias-1m', 'other'],
        supports1m: true,
      },
    )
    expect(next.profile.modelDiscoveryEnabled).toBeUndefined()
    expect(next.profile.inferenceModels).toEqual([
      { name: 'alias-1m', labelOverride: 'alias-1m', supports1m: true, prefer1m: true },
      { name: 'other', labelOverride: 'other' },
    ])
  })

  it('replaces the legacy stackferry profile id with the stable UUID', () => {
    const current = parseDesktopMeta({
      appliedId: 'stackferry',
      entries: [
        { id: 'stackferry', name: 'Old' },
        { id: 'other-profile', name: 'Bedrock' },
      ],
    })
    const next = applyDesktopGateway(current, {
      name: 'Corp Gateway',
      baseUrl: 'https://gateway.example/v1',
      apiKey: 'gw-key',
      authScheme: 'bearer',
      model: 'claude-sonnet-4-6',
    })
    expect(next.meta.appliedId).toBe(STACKFERRY_DESKTOP_PROFILE_ID)
    expect(next.meta.entries).toEqual([
      { id: 'other-profile', name: 'Bedrock' },
      { id: STACKFERRY_DESKTOP_PROFILE_ID, name: 'Corp Gateway' },
    ])
  })

  it('writes a per-provider profile and keeps the previous StackFerry entry', () => {
    const firstId = '11111111-1111-1111-1111-111111111111'
    const secondId = '22222222-2222-2222-2222-222222222222'
    const first = applyDesktopGateway(
      { appliedId: null, entries: [] },
      {
        id: firstId,
        name: 'Gateway A',
        baseUrl: 'https://a.example/v1',
        apiKey: 'key-a',
        authScheme: 'bearer',
        model: 'claude-sonnet-4-6',
      },
    )
    const second = applyDesktopGateway(first.meta, {
      id: secondId,
      name: 'Gateway B',
      baseUrl: 'https://b.example/v1',
      apiKey: 'key-b',
      authScheme: 'bearer',
      model: 'claude-sonnet-4-6',
    })
    expect(second.meta.appliedId).toBe(secondId)
    expect(second.meta.entries).toEqual([
      { id: firstId, name: 'Gateway A' },
      { id: secondId, name: 'Gateway B' },
    ])
  })

  it('clears appliedId on official restore and keeps saved entries', () => {
    const next = applyDesktopOfficial({
      appliedId: STACKFERRY_DESKTOP_PROFILE_ID,
      entries: [
        { id: STACKFERRY_DESKTOP_PROFILE_ID, name: 'Corp Gateway' },
        { id: 'other-profile', name: 'Bedrock' },
      ],
    })
    expect(next.appliedId).toBeNull()
    expect(next.entries).toHaveLength(2)
  })

  it('rejects corrupt meta entries', () => {
    expect(() => parseDesktopMeta({ entries: ['nope'] })).toThrow(AppError)
    try {
      parseDesktopMeta({ entries: ['nope'] })
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe('claude_desktop_meta_corrupt')
    }
  })

  it('sets deploymentMode without dropping other app-config keys', () => {
    expect(applyDesktopDeploymentMode({ mcpServers: { keep: true } }, '3p')).toEqual({
      mcpServers: { keep: true },
      deploymentMode: '3p',
    })
    expect(applyDesktopDeploymentMode(null, '1p')).toEqual({ deploymentMode: '1p' })
  })
})
