import { describe, expect, it } from 'vitest'
import { ROUTER_PROVIDER_KEY } from '../shared/routing'
import {
  applyDirectModel,
  applyOfficialModel,
  applyRouterModel,
  grokModelKey,
  stringifyToml,
} from '../electron/main/grok/merge'

describe('grok config merge', () => {
  it('writes a StackFerry model table without pinning global API-key auth', () => {
    const next = applyDirectModel(
      {
        ui: { theme: 'auto' },
        models: { default: 'my-byok' },
        grok_com_config: { preferred_method: 'api_key' },
        model: { 'my-byok': { base_url: 'https://example.test/v1', model: 'kept' } },
      },
      {
        id: 'aaaa-bbbb',
        name: 'Custom',
        model: 'demo',
        baseUrl: 'https://gateway.test/v1',
        apiBackend: 'responses',
        apiKey: 'secret',
      },
    )
    const key = grokModelKey('aaaa-bbbb')
    expect(next.models).toMatchObject({
      default: key,
      web_search: key,
      session_summary: key,
      image_description: key,
    })
    expect(next.grok_com_config).toBeUndefined()
    expect(next.stackferry).toBeUndefined()
    expect(next.model).toMatchObject({
      'my-byok': { base_url: 'https://example.test/v1', model: 'kept' },
      [key]: {
        name: 'Custom',
        model: 'demo',
        base_url: 'https://gateway.test/v1',
        api_backend: 'responses',
        api_key: 'secret',
      },
    })
    expect(next.ui).toEqual({ theme: 'auto', fork_secondary_model: key })
    const text = stringifyToml(next)
    expect(text).toContain('[model.my-byok]')
    expect(text).not.toContain('[stackferry]')
    expect(text).not.toContain('preferred_method')
  })

  it('restores the provided default, strips StackFerry tables, and unpins API-key auth', () => {
    const live = applyDirectModel(
      { models: { default: 'my-byok' } },
      {
        id: 'id1',
        name: 'Custom',
        model: 'demo',
        baseUrl: 'https://gateway.test/v1',
        apiBackend: 'chat_completions',
        apiKey: 'secret',
      },
    )
    const official = applyOfficialModel(live, 'my-byok')
    expect(official.models).toEqual({ default: 'my-byok' })
    expect(official.stackferry).toBeUndefined()
    expect(official.grok_com_config).toBeUndefined()
    expect(official.model).toBeUndefined()
    expect(official.ui).toBeUndefined()
  })

  it('reads a leftover stackferry previous_default when no store backup is passed', () => {
    const official = applyOfficialModel({
      stackferry: { previous_default: 'kept-model' },
      models: { default: 'stackferry_abc' },
      model: { stackferry_abc: { model: 'demo' } },
    })
    expect(official.models).toMatchObject({ default: 'kept-model' })
    expect(official.stackferry).toBeUndefined()
  })

  it('points the default model at the local router', () => {
    const next = applyRouterModel({ models: { default: 'grok-build' } }, { port: 41234, model: 'demo' })
    expect(next.models).toMatchObject({
      default: ROUTER_PROVIDER_KEY,
      web_search: ROUTER_PROVIDER_KEY,
    })
    expect(next.grok_com_config).toBeUndefined()
    expect(next.model).toMatchObject({
      [ROUTER_PROVIDER_KEY]: {
        base_url: 'http://127.0.0.1:41234/v1',
        api_backend: 'responses',
        model: 'demo',
      },
    })
  })

  it('keeps a non-StackFerry web_search pin when restoring official', () => {
    const official = applyOfficialModel(
      {
        models: { default: 'stackferry_abc', web_search: 'grok-4.6' },
        model: { stackferry_abc: { model: 'demo' } },
        ui: { fork_secondary_model: 'grok-4.6' },
      },
      'grok-build',
    )
    expect(official.models).toEqual({ default: 'grok-build', web_search: 'grok-4.6' })
    expect(official.ui).toEqual({ fork_secondary_model: 'grok-4.6' })
  })

  it('writes effort, context, compact percent, and overlay keys onto the model table', () => {
    const next = applyDirectModel(
      {},
      {
        id: 'sess-1',
        name: 'Custom',
        model: 'demo',
        baseUrl: 'https://gateway.test/v1',
        apiBackend: 'responses',
        apiKey: 'secret',
        effortLevel: 'high',
        contextWindow: '200000',
        autoCompact: '80',
        overlayToml: `temperature = 0.2
api_key = "ignored"
name = "Stolen"
model = "stolen"
base_url = "https://stolen.example/v1"
api_backend = "chat_completions"

[extra_headers]
x-foo = "bar"
`,
      },
    )
    const key = grokModelKey('sess-1')
    expect(next.models).toMatchObject({
      default: key,
      default_reasoning_effort: 'high',
      web_search: key,
    })
    expect(next.model).toMatchObject({
      [key]: {
        name: 'Custom',
        model: 'demo',
        base_url: 'https://gateway.test/v1',
        api_backend: 'responses',
        api_key: 'secret',
        reasoning_effort: 'high',
        supports_reasoning_effort: true,
        context_window: 200000,
        auto_compact_threshold_percent: 80,
        extra_headers: { 'x-foo': 'bar' },
        temperature: 0.2,
      },
    })
  })

  it('writes ui.permission_mode and clears it when unset', () => {
    const withMode = applyDirectModel(
      { ui: { theme: 'auto' } },
      {
        id: 'perm-1',
        name: 'Custom',
        model: 'demo',
        baseUrl: 'https://gateway.test/v1',
        apiBackend: 'responses',
        apiKey: 'secret',
        permissionMode: 'always-approve',
      },
    )
    const key = grokModelKey('perm-1')
    expect(withMode.ui).toEqual({
      theme: 'auto',
      fork_secondary_model: key,
      permission_mode: 'always-approve',
    })
    expect(withMode.model?.[key]).not.toHaveProperty('permission_mode')

    const cleared = applyDirectModel(withMode, {
      id: 'perm-2',
      name: 'Custom',
      model: 'demo',
      baseUrl: 'https://gateway.test/v1',
      apiBackend: 'responses',
      apiKey: 'secret',
    })
    expect(cleared.ui).toEqual({
      theme: 'auto',
      fork_secondary_model: grokModelKey('perm-2'),
    })
  })

  it('merges overlay root tables and skips session-owned keys', () => {
    const next = applyDirectModel(
      {
        ui: { theme: 'auto' },
        models: { default: 'kept-elsewhere' },
        permission: { deny: ['bash'] },
      },
      {
        id: 'over-1',
        name: 'Custom',
        model: 'demo',
        baseUrl: 'https://gateway.test/v1',
        apiBackend: 'responses',
        apiKey: 'secret',
        permissionMode: 'ask',
        overlayToml: `
[models]
max_retries = 3
default = "ignored"

[ui]
vim_mode = true

[permission]
allow = ["read"]
`,
      },
    )
    const key = grokModelKey('over-1')
    expect(next.models).toMatchObject({
      default: key,
      max_retries: 3,
    })
    expect(next.ui).toEqual({
      theme: 'auto',
      vim_mode: true,
      fork_secondary_model: key,
      permission_mode: 'ask',
    })
    expect(next.permission).toEqual({
      deny: ['bash'],
      allow: ['read'],
    })

    const cleared = applyDirectModel(next, {
      id: 'over-2',
      name: 'Custom',
      model: 'demo',
      baseUrl: 'https://gateway.test/v1',
      apiBackend: 'responses',
      apiKey: 'secret',
      overlayToml: '[ui]\nvim_mode = true\n',
    })
    expect(cleared.ui).toEqual({
      theme: 'auto',
      vim_mode: true,
      fork_secondary_model: grokModelKey('over-2'),
    })
  })

  it('applies overlay session keys when store columns are empty', () => {
    const next = applyDirectModel(
      {},
      {
        id: 'over-sess',
        name: 'Custom',
        model: 'demo',
        baseUrl: 'https://gateway.test/v1',
        apiBackend: 'responses',
        apiKey: 'secret',
        overlayToml: `reasoning_effort = "high"
context_window = 200000
auto_compact_threshold_percent = 80

[ui]
permission_mode = "auto"
`,
      },
    )
    const key = grokModelKey('over-sess')
    expect(next.models).toMatchObject({
      default: key,
      default_reasoning_effort: 'high',
    })
    expect(next.model).toMatchObject({
      [key]: {
        reasoning_effort: 'high',
        supports_reasoning_effort: true,
        context_window: 200000,
        auto_compact_threshold_percent: 80,
      },
    })
    expect(next.ui).toMatchObject({ permission_mode: 'auto' })
  })

  it('keeps session fields on the router model table', () => {
    const next = applyRouterModel(
      {},
      { port: 41234, model: 'demo', effortLevel: 'low', contextWindow: '128000' },
    )
    expect(next.model).toMatchObject({
      [ROUTER_PROVIDER_KEY]: {
        reasoning_effort: 'low',
        supports_reasoning_effort: true,
        context_window: 128000,
      },
    })
  })
})
