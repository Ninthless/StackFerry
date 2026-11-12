import { describe, expect, it } from 'vitest'
import { isQueuePermutation, moveQueueItem } from '../shared/routing'
import {
  classifyProxyPath,
  candidatesForRequest,
  displayQueue,
  groupOrder,
  planAfterQueueChange,
  planEnable,
  namedFailoverOrder,
  planQuit,
  replaceModelField,
  queueAfterEnable,
  requestOrder,
  routeForModel,
  shouldFailoverHttp,
  upstreamProxyPath,
  upstreamRequestUrl,
} from '../electron/main/routing/policy'

describe('routing policy', () => {
  it('uses the router only for custom providers with a non-empty queue', () => {
    expect(planEnable('official', 2)).toEqual({ action: 'official', needsRestart: true })
    expect(planEnable('custom', 0)).toEqual({ action: 'direct', needsRestart: true })
    expect(planEnable('custom', 1)).toEqual({ action: 'router', needsRestart: true })
    expect(planEnable('custom', 2)).toEqual({ action: 'router', needsRestart: true })
    expect(planEnable('custom', 0, true)).toEqual({ action: 'router', needsRestart: true })
  })

  it('enters the router when a custom provider is active and the queue fills', () => {
    expect(
      planAfterQueueChange({ queueLength: 1, routerLive: false, activeKind: 'custom' }),
    ).toEqual({ action: 'enter-router', needsRestart: true })
    expect(
      planAfterQueueChange({ queueLength: 1, routerLive: false, activeKind: 'official' }),
    ).toEqual({ action: 'none' })
    expect(
      planAfterQueueChange({ queueLength: 0, routerLive: true, activeKind: 'custom' }),
    ).toEqual({ action: 'leave-router', needsRestart: true })
    expect(
      planAfterQueueChange({
        queueLength: 0,
        routerLive: true,
        activeKind: 'custom',
        needsRouter: true,
      }),
    ).toEqual({ action: 'none' })
    expect(planQuit(true)).toBe('restore-direct')
    expect(planQuit(true, true)).toBe('keep-router')
    expect(planQuit(false)).toBe('none')
  })

  it('uses queue order when the enabled provider is already queued', () => {
    expect(requestOrder('active', ['b', 'active', 'c'])).toEqual(['b', 'active', 'c'])
    expect(requestOrder('active', ['b', 'c'])).toEqual(['active', 'b', 'c'])
    expect(requestOrder(null, ['b', 'c'])).toEqual(['b', 'c'])
  })

  it('promotes a queued provider to the head when it is enabled', () => {
    expect(queueAfterEnable(['b', 'a', 'c'], 'a')).toEqual(['a', 'b', 'c'])
    expect(queueAfterEnable(['a', 'b'], 'a')).toEqual(['a', 'b'])
    expect(queueAfterEnable(['b', 'c'], 'a')).toEqual(['b', 'c'])
  })

  it('lists the enabled provider in the routing queue only when failover backups exist', () => {
    expect(displayQueue('active', [])).toEqual([])
    expect(displayQueue('active', ['b', 'c'])).toEqual(['active', 'b', 'c'])
    expect(displayQueue(null, ['b', 'c'])).toEqual(['b', 'c'])
  })

  it('moves a queued provider up or down without changing membership', () => {
    expect(moveQueueItem(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c'])
    expect(moveQueueItem(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b'])
    expect(moveQueueItem(['a', 'b', 'c'], 'a', -1)).toBeNull()
    expect(isQueuePermutation(['a', 'b', 'c'], ['c', 'a', 'b'])).toBe(true)
    expect(isQueuePermutation(['a', 'b', 'c'], ['a', 'a', 'b'])).toBe(false)
  })

  it('fails over on 429 and 5xx only', () => {
    expect(shouldFailoverHttp(429)).toBe(true)
    expect(shouldFailoverHttp(502)).toBe(true)
    expect(shouldFailoverHttp(529)).toBe(true)
    expect(shouldFailoverHttp(400)).toBe(false)
    expect(shouldFailoverHttp(401)).toBe(false)
    expect(shouldFailoverHttp(200)).toBe(false)
  })

  it('sends a provider/model request to that provider and leaves other models on the lane', () => {
    const providers = ['deepseek', 'kimi']
    expect(routeForModel('deepseek/deepseek-v4-pro', providers)).toEqual({
      kind: 'named',
      providerId: 'deepseek',
      model: 'deepseek-v4-pro',
    })
    expect(routeForModel('gpt-5', providers)).toEqual({ kind: 'lane' })
    expect(routeForModel('openai/gpt-5', providers)).toEqual({ kind: 'lane' })
    expect(routeForModel('deepseek/', providers)).toEqual({ kind: 'lane' })
    expect(routeForModel('/deepseek-v4-pro', providers)).toEqual({ kind: 'lane' })
  })

  it('orders a routing group and keeps a turn on the member that answered it', () => {
    const known = ['deepseek', 'kimi', 'glm']
    expect(
      groupOrder({ id: 'fast', members: ['kimi', 'missing', 'deepseek'], strategy: 'order' }, known),
    ).toEqual(['kimi', 'deepseek'])
    expect(
      groupOrder(
        { id: 'fast', members: ['kimi', 'deepseek'], strategy: 'turn' },
        known,
        'deepseek',
      ),
    ).toEqual(['deepseek', 'kimi'])
    expect(
      groupOrder({ id: 'fast', members: ['kimi', 'deepseek'], strategy: 'turn' }, known, 'glm'),
    ).toEqual(['kimi', 'deepseek'])
  })

  it('replaces only the model string and leaves the rest of the body byte for byte', () => {
    const body = Buffer.from(
      '{"model": "deepseek/deepseek-v4-pro", "system":[{"cache_control":{"type":"ephemeral"}}]}',
    )
    const next = replaceModelField(body, 'deepseek-v4-pro')
    expect(next?.toString('utf8')).toBe(
      '{"model": "deepseek-v4-pro", "system":[{"cache_control":{"type":"ephemeral"}}]}',
    )
    expect(replaceModelField(Buffer.from('{"model":1}'), 'x')).toBeNull()
  })

  it('walks a group in member order and leaves the lane queue out of it', () => {
    const providers = ['deepseek', 'kimi', 'glm']
    const groups = [{ id: 'fast', members: ['kimi', 'deepseek'], strategy: 'order' as const }]
    expect(candidatesForRequest({ model: 'fast/m', providerIds: providers, groups })).toEqual({
      order: ['kimi', 'deepseek'],
      model: 'm',
    })
    expect(
      candidatesForRequest({
        model: 'fast/m',
        providerIds: providers,
        groups: [{ id: 'fast', members: ['kimi', 'deepseek'], strategy: 'turn' }],
        stickyId: 'deepseek',
      }),
    ).toEqual({ order: ['deepseek', 'kimi'], model: 'm' })
    expect(candidatesForRequest({ model: 'deepseek/m', providerIds: providers, groups })).toEqual({
      order: ['deepseek', 'kimi', 'glm'],
      model: 'm',
    })
    expect(candidatesForRequest({ model: 'gpt-5', providerIds: providers, groups })).toEqual({
      order: providers,
      model: null,
    })
  })

  it('fails a named provider over to the lane backups, starting with itself', () => {
    expect(namedFailoverOrder('deepseek', ['kimi', 'deepseek', 'glm'])).toEqual([
      'deepseek',
      'kimi',
      'glm',
    ])
    expect(namedFailoverOrder('deepseek', [])).toEqual(['deepseek'])
  })

  it('joins the upstream path onto the provider base url', () => {
    expect(classifyProxyPath('/v1/responses')).toBe('responses')
    expect(classifyProxyPath('/v1/models/')).toBe('models')
    expect(classifyProxyPath('/v1/messages')).toBe('messages')
    expect(classifyProxyPath('/v1/chat/completions')).toBe('chat')
    expect(classifyProxyPath('/health')).toBeNull()
    expect(upstreamProxyPath('/v1/responses', 'chat')).toBe('/v1/chat/completions')
    expect(upstreamProxyPath('/v1/models', 'chat')).toBe('/v1/models')
    expect(upstreamProxyPath('/v1/responses', 'responses')).toBe('/v1/responses')
    expect(upstreamRequestUrl('https://api.example/v1', '/v1/responses')).toBe(
      'https://api.example/v1/responses',
    )
    expect(
      upstreamRequestUrl('https://api.example/v1', upstreamProxyPath('/v1/responses', 'chat')),
    ).toBe('https://api.example/v1/chat/completions')
    expect(
      upstreamRequestUrl('https://azure.example/openai', '/v1/responses', { 'api-version': 'preview' }),
    ).toBe('https://azure.example/openai/responses?api-version=preview')
  })
})
