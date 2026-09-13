import { describe, expect, it } from 'vitest'
import { GROK_EFFORT_LEVELS } from '../shared/grok-session'
import { GROK_DEFAULT_CONTEXT_WINDOW } from '../shared/grok-presets'
import { ROUTER_PROVIDER_KEY } from '../shared/routing'
import {
  applyDirectModel,
  applyMediaBaseUrl,
  applyOfficialModel,
  applyRouterModel,
  GROK_IMAGINE_MODEL_KEY,
  GROK_IMAGINE_VIDEO_KEY,
  GROK_LIVE_MODEL_KEY,
  grokModelKey,
  stringifyToml,
} from '../electron/main/grok/merge'

const GROK_EFFORT_MENU = GROK_EFFORT_LEVELS.map((value) => ({ value }))

describe('grok config merge', () => {
  it('writes a StackFerry model table and pins API-key auth for Imagine and subagents', () => {
    const next = applyDirectModel(
      {
        ui: { theme: 'auto' },
        models: { default: 'my-byok' },
        grok_com_config: { grok_ws_url: 'wss://kept.example' },
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
    const key = GROK_LIVE_MODEL_KEY
    expect(next.models).toMatchObject({
      default: key,
      web_search: key,
      session_summary: key,
      image_description: key,
    })
    expect(next.grok_com_config).toEqual({
      grok_ws_url: 'wss://kept.example',
      preferred_method: 'api_key',
    })
    expect(next.subagents).toEqual({
      models: {
        'general-purpose': key,
        explore: key,
        plan: key,
      },
    })
    expect(next.stackferry).toBeUndefined()
    expect(next.model).toEqual({
      'my-byok': { base_url: 'https://example.test/v1', model: 'kept' },
      [key]: {
        name: 'Custom',
        model: 'demo',
        base_url: 'https://gateway.test/v1',
        api_backend: 'responses',
        api_key: 'secret',
        context_window: GROK_DEFAULT_CONTEXT_WINDOW,
      },
    })
    expect(next.ui).toEqual({ theme: 'auto', fork_secondary_model: key })
    const text = stringifyToml(next)
    expect(text).toContain('[model.my-byok]')
    expect(text).not.toContain('[stackferry]')
    expect(text).toContain('preferred_method')
  })

  it('restores a remaining user default and strips owned live tables', () => {
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
    expect(official.models).toBeUndefined()
    expect(official.stackferry).toBeUndefined()
    expect(official.grok_com_config).toBeUndefined()
    expect(official.subagents).toBeUndefined()
    expect(official.model).toBeUndefined()
    expect(official.ui).toBeUndefined()
  })

  it('drops a leftover previous_default when that model table is gone', () => {
    const official = applyOfficialModel({
      stackferry: { previous_default: 'kept-model' },
      models: { default: 'stackferry_abc' },
      model: { stackferry_abc: { model: 'demo' } },
    })
    expect(official.models).toBeUndefined()
    expect(official.stackferry).toBeUndefined()
    expect(official.model).toBeUndefined()
  })

  it('keeps a remaining user model table as the official default', () => {
    const official = applyOfficialModel(
      {
        models: { default: 'custom' },
        model: {
          custom: { name: 'Custom', model: 'demo', base_url: 'https://gateway.test/v1' },
          'my-byok': { base_url: 'https://example.test/v1', model: 'kept' },
        },
      },
      'my-byok',
    )
    expect(official.models).toEqual({ default: 'my-byok' })
    expect(official.model).toEqual({
      'my-byok': { base_url: 'https://example.test/v1', model: 'kept' },
    })
  })

  it('pins catalog models onto custom and overlays the builtin id for context', () => {
    const next = applyDirectModel(
      {},
      {
        id: 'aaaa-bbbb',
        name: 'Custom',
        model: 'grok-4.6',
        baseUrl: 'https://gateway.test/v1',
        apiBackend: 'chat_completions',
        apiKey: 'secret',
        contextWindow: '1000000',
      },
    )
    expect(next.models).toMatchObject({
      default: GROK_LIVE_MODEL_KEY,
      web_search: GROK_LIVE_MODEL_KEY,
    })
    expect(next.model).toEqual({
      [GROK_LIVE_MODEL_KEY]: {
        name: 'Custom',
        model: 'grok-4.6',
        base_url: 'https://gateway.test/v1',
        api_backend: 'chat_completions',
        api_key: 'secret',
        context_window: 1000000,
      },
      'grok-4.6': {
        model: 'grok-4.6',
        base_url: 'https://gateway.test/v1',
        api_backend: 'chat_completions',
        api_key: 'secret',
        context_window: 1000000,
        supports_reasoning_effort: true,
        reasoning_efforts: GROK_EFFORT_MENU,
      },
    })
    expect(next.model).not.toHaveProperty(grokModelKey('aaaa-bbbb'))
    expect(next.stackferry).toEqual({ owned: ['grok-4.6'] })

    const switched = applyDirectModel(next, {
      id: 'cccc-dddd',
      name: 'Other',
      model: 'grok-4.5',
      baseUrl: 'https://gateway.test/v1',
      apiBackend: 'responses',
      apiKey: 'secret',
      contextWindow: '256000',
    })
    expect(switched.models).toMatchObject({ default: GROK_LIVE_MODEL_KEY })
    expect(switched.model).toMatchObject({
      [GROK_LIVE_MODEL_KEY]: {
        name: 'Other',
        model: 'grok-4.5',
        base_url: 'https://gateway.test/v1',
        api_backend: 'responses',
        api_key: 'secret',
        context_window: 256000,
      },
      'grok-4.6': {
        model: 'grok-4.6',
        base_url: 'https://gateway.test/v1',
        api_key: 'secret',
        context_window: 256000,
        supports_reasoning_effort: true,
        reasoning_efforts: GROK_EFFORT_MENU,
      },
      'grok-4.5': {
        model: 'grok-4.5',
        base_url: 'https://gateway.test/v1',
        api_key: 'secret',
        context_window: 256000,
        supports_reasoning_effort: true,
        reasoning_efforts: GROK_EFFORT_MENU,
      },
    })

    const official = applyOfficialModel(next, 'grok-build')
    expect(official.model).toBeUndefined()
    expect(official.stackferry).toBeUndefined()
    expect(official.models).toBeUndefined()
  })

  it('retargets leftover catalog overlays without making them live', () => {
    const next = applyDirectModel(
      {
        stackferry: { owned: ['grok-4.6'] },
        model: {
          'grok-4.6': { model: 'grok-4.6', base_url: 'https://old.test/v1', api_key: 'old' },
        },
      },
      {
        id: 'cccc-dddd',
        name: 'Custom',
        model: 'my-proxy',
        baseUrl: 'https://gateway.test/v1',
        apiBackend: 'responses',
        apiKey: 'secret',
      },
    )
    expect(next.models).toMatchObject({ default: GROK_LIVE_MODEL_KEY })
    expect(next.model).toMatchObject({
      [GROK_LIVE_MODEL_KEY]: {
        name: 'Custom',
        model: 'my-proxy',
        base_url: 'https://gateway.test/v1',
        api_key: 'secret',
      },
      'grok-4.6': {
        model: 'grok-4.6',
        base_url: 'https://gateway.test/v1',
        api_key: 'secret',
      },
    })
    expect(next.stackferry).toEqual({ owned: ['grok-4.6'] })
  })

  it('keeps the same custom id when toggling the failover router', () => {
    const provider = {
      id: 'aaaa-bbbb',
      name: 'Custom',
      model: 'demo',
      baseUrl: 'https://a.example/v1',
      apiBackend: 'responses' as const,
      apiKey: 'secret',
    }
    const direct = applyDirectModel({}, provider)
    const routed = applyRouterModel(direct, { port: 41234, model: 'demo' })
    const back = applyDirectModel(routed, provider)
    expect(direct.models).toMatchObject({ default: GROK_LIVE_MODEL_KEY })
    expect(routed.models).toMatchObject({ default: GROK_LIVE_MODEL_KEY })
    expect(back.models).toMatchObject({ default: GROK_LIVE_MODEL_KEY })
    expect(direct.model).toMatchObject({
      [GROK_LIVE_MODEL_KEY]: { base_url: 'https://a.example/v1', api_key: 'secret' },
    })
    expect(routed.model).toMatchObject({
      [GROK_LIVE_MODEL_KEY]: {
        base_url: 'http://127.0.0.1:41234/v1',
        api_key: 'stackferry-router',
      },
    })
    expect(back.model).toMatchObject({
      [GROK_LIVE_MODEL_KEY]: { base_url: 'https://a.example/v1', api_key: 'secret' },
    })
  })

  it('keeps failover on the custom live table and overlays the catalog id', () => {
    const next = applyRouterModel({}, { port: 41234, model: 'grok-4.6' })
    expect(next.models).toMatchObject({ default: GROK_LIVE_MODEL_KEY })
    expect(next.model).toEqual({
      [GROK_LIVE_MODEL_KEY]: {
        name: 'StackFerry Router',
        base_url: 'http://127.0.0.1:41234/v1',
        api_backend: 'responses',
        api_key: 'stackferry-router',
        model: 'grok-4.6',
        context_window: GROK_DEFAULT_CONTEXT_WINDOW,
      },
      'grok-4.6': {
        base_url: 'http://127.0.0.1:41234/v1',
        api_backend: 'responses',
        api_key: 'stackferry-router',
        model: 'grok-4.6',
        context_window: GROK_DEFAULT_CONTEXT_WINDOW,
        supports_reasoning_effort: true,
        reasoning_efforts: GROK_EFFORT_MENU,
      },
    })
    expect(next.stackferry).toEqual({ owned: ['grok-4.6'] })
  })

  it('points the default model at the local router', () => {
    const next = applyRouterModel({ models: { default: 'grok-build' } }, { port: 41234, model: 'demo' })
    expect(next.models).toMatchObject({
      default: GROK_LIVE_MODEL_KEY,
      web_search: GROK_LIVE_MODEL_KEY,
    })
    expect(next.grok_com_config).toEqual({ preferred_method: 'api_key' })
    expect(next.subagents).toEqual({
      models: {
        'general-purpose': GROK_LIVE_MODEL_KEY,
        explore: GROK_LIVE_MODEL_KEY,
        plan: GROK_LIVE_MODEL_KEY,
      },
    })
    expect(next.model).toEqual({
      [GROK_LIVE_MODEL_KEY]: {
        name: 'StackFerry Router',
        base_url: 'http://127.0.0.1:41234/v1',
        api_backend: 'responses',
        api_key: 'stackferry-router',
        model: 'demo',
        context_window: GROK_DEFAULT_CONTEXT_WINDOW,
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
    expect(official.models).toEqual({ web_search: 'grok-4.6' })
    expect(official.model).toBeUndefined()
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
    const key = GROK_LIVE_MODEL_KEY
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
        reasoning_efforts: GROK_EFFORT_MENU,
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
    const key = GROK_LIVE_MODEL_KEY
    expect(withMode.ui).toEqual({
      theme: 'auto',
      fork_secondary_model: key,
      permission_mode: 'always-approve',
    })
    expect(Object.values(withMode.model ?? {})).toEqual([
      expect.not.objectContaining({ permission_mode: expect.anything() }),
    ])

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
      fork_secondary_model: GROK_LIVE_MODEL_KEY,
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
    const key = GROK_LIVE_MODEL_KEY
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
      fork_secondary_model: GROK_LIVE_MODEL_KEY,
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
    const key = GROK_LIVE_MODEL_KEY
    expect(next.models).toMatchObject({
      default: key,
      default_reasoning_effort: 'high',
    })
    expect(next.model).toMatchObject({
      [key]: {
        reasoning_effort: 'high',
        supports_reasoning_effort: true,
        reasoning_efforts: GROK_EFFORT_MENU,
        context_window: 200000,
        auto_compact_threshold_percent: 80,
      },
    })
    expect(next.ui).toMatchObject({ permission_mode: 'auto' })
  })

  it('owns the /effort menu and keeps catalog overlays from wiping xhigh', () => {
    const next = applyDirectModel(
      {
        stackferry: { owned: ['grok-4.6'] },
        model: {
          'grok-4.6': {
            model: 'grok-4.6',
            reasoning_efforts: ['low', 'medium', 'high'],
          },
        },
      },
      {
        id: 'menu-1',
        name: 'Custom',
        model: 'grok-4.6',
        baseUrl: 'https://gateway.test/v1',
        apiBackend: 'responses',
        apiKey: 'secret',
        effortLevel: 'xhigh',
        overlayToml: 'reasoning_efforts = ["low", "medium", "high"]\n',
      },
    )
    expect(next.model?.[GROK_LIVE_MODEL_KEY]).toMatchObject({
      reasoning_effort: 'xhigh',
      supports_reasoning_effort: true,
      reasoning_efforts: GROK_EFFORT_MENU,
    })
    expect(next.model?.['grok-4.6']).toMatchObject({
      model: 'grok-4.6',
      reasoning_effort: 'xhigh',
      supports_reasoning_effort: true,
      reasoning_efforts: GROK_EFFORT_MENU,
    })
    expect(stringifyToml(next)).toContain('value = "xhigh"')
  })

  it('keeps session fields on the router model table', () => {
    const next = applyRouterModel(
      {},
      { port: 41234, model: 'demo', effortLevel: 'low', contextWindow: '128000' },
    )
    expect(next.model).toMatchObject({
      [GROK_LIVE_MODEL_KEY]: {
        reasoning_effort: 'low',
        supports_reasoning_effort: true,
        reasoning_efforts: GROK_EFFORT_MENU,
        context_window: 128000,
      },
    })
  })

  it('pins third-party Imagine settings when an image model is provided', () => {
    const next = applyDirectModel(
      {},
      {
        id: 'img-1',
        name: 'Custom',
        model: 'chat-demo',
        baseUrl: 'https://gateway.test/v1',
        apiBackend: 'responses',
        apiKey: 'chat-secret',
        media: {
          imageModel: 'flux-schnell',
          baseUrl: 'https://gateway.test/v1',
          apiKey: 'chat-secret',
        },
      },
    )
    expect(next.endpoints).toEqual({ xai_api_base_url: 'https://gateway.test/v1' })
    expect(next.features).toEqual({
      image_gen: true,
      image_gen_model_override: 'flux-schnell',
    })
    expect(next.model).toMatchObject({
      [GROK_IMAGINE_MODEL_KEY]: {
        model: 'flux-schnell',
        base_url: 'https://gateway.test/v1',
        api_backend: 'chat_completions',
        api_key: 'chat-secret',
      },
    })
    expect(next.stackferry).toMatchObject({
      owned: [GROK_IMAGINE_MODEL_KEY],
      media_gen: true,
    })

    const official = applyOfficialModel(next, 'grok-build')
    expect(official.endpoints).toBeUndefined()
    expect(official.features).toBeUndefined()
    expect(official.model).toBeUndefined()
    expect(official.stackferry).toBeUndefined()
  })

  it('keeps Imagine on the real upstream during router mode', () => {
    const next = applyRouterModel(
      {},
      {
        port: 41234,
        model: 'demo',
        media: {
          imageModel: 'flux-pro',
          baseUrl: 'https://images.test/v1',
          apiKey: 'image-secret',
        },
      },
    )
    expect(next.endpoints).toEqual({ xai_api_base_url: 'https://images.test/v1' })
    expect(next.features).toMatchObject({ image_gen_model_override: 'flux-pro' })
    expect(next.model?.[GROK_LIVE_MODEL_KEY]).toMatchObject({
      base_url: 'http://127.0.0.1:41234/v1',
      api_key: 'stackferry-router',
    })
    expect(next.model?.[GROK_IMAGINE_MODEL_KEY]).toMatchObject({
      model: 'flux-pro',
      base_url: 'https://images.test/v1',
      api_key: 'image-secret',
    })
  })

  it('pins video to the real Imagine URL without a local proxy', () => {
    const next = applyDirectModel(
      {},
      {
        id: 'vid-1',
        name: 'Custom',
        model: 'chat-demo',
        baseUrl: 'https://gateway.test/v1',
        apiBackend: 'responses',
        apiKey: 'chat-secret',
        media: {
          videoModel: 'kling-v1',
          baseUrl: 'https://gateway.test/v1',
          apiKey: 'media-secret',
        },
      },
    )
    expect(next.endpoints).toEqual({ xai_api_base_url: 'https://gateway.test/v1' })
    expect(next.features).toEqual({ video_gen: true })
    expect(next.model?.[GROK_IMAGINE_VIDEO_KEY]).toMatchObject({
      model: 'kling-v1',
      base_url: 'https://gateway.test/v1',
      api_key: 'media-secret',
    })
  })

  it('keeps image and video on the same real Imagine URL', () => {
    const next = applyDirectModel(
      {},
      {
        id: 'both-1',
        name: 'Custom',
        model: 'chat-demo',
        baseUrl: 'https://chat.test/v1',
        apiBackend: 'responses',
        apiKey: 'chat-secret',
        media: {
          imageModel: 'flux-schnell',
          videoModel: 'kling-v1',
          baseUrl: 'https://media.test/v1',
          apiKey: 'media-secret',
        },
      },
    )
    expect(next.endpoints).toEqual({ xai_api_base_url: 'https://media.test/v1' })
    expect(next.features).toEqual({
      image_gen: true,
      image_gen_model_override: 'flux-schnell',
      video_gen: true,
    })
  })

  it('rewrites a stale loopback Imagine URL to the real upstream', () => {
    const next = applyMediaBaseUrl(
      { endpoints: { xai_api_base_url: 'http://127.0.0.1:61325/v1' }, ui: { theme: 'auto' } },
      'https://gateway.test/v1',
    )
    expect(next.endpoints).toEqual({ xai_api_base_url: 'https://gateway.test/v1' })
    expect(next.ui).toEqual({ theme: 'auto' })
  })

  it('points leftover stackferry tables at the current live model', () => {
    const leftover = grokModelKey('aaaa-bbbb')
    const first = applyDirectModel(
      {
        model: {
          [leftover]: { name: 'Old', model: 'old', base_url: 'https://old.test/v1', api_key: 'old' },
          [ROUTER_PROVIDER_KEY]: { name: 'Router', model: 'old', base_url: 'http://127.0.0.1:1/v1' },
        },
      },
      {
        id: 'bbbb-cccc',
        name: 'New',
        model: 'demo',
        baseUrl: 'https://new.test/v1',
        apiBackend: 'responses',
        apiKey: 'new-key',
      },
    )
    expect(first.models).toMatchObject({ default: GROK_LIVE_MODEL_KEY })
    expect(first.model).toMatchObject({
      [GROK_LIVE_MODEL_KEY]: {
        name: 'New',
        model: 'demo',
        base_url: 'https://new.test/v1',
        api_key: 'new-key',
      },
      [leftover]: {
        name: 'New',
        model: 'demo',
        base_url: 'https://new.test/v1',
        api_key: 'new-key',
      },
      [ROUTER_PROVIDER_KEY]: {
        name: 'New',
        model: 'demo',
        base_url: 'https://new.test/v1',
        api_key: 'new-key',
      },
    })
  })
})
