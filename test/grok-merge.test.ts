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
        overlayJson: '{"extra_headers":{"x-foo":"bar"},"temperature":0.2,"api_key":"ignored"}',
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
