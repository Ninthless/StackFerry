import { describe, expect, it } from 'vitest'
import { isQueuePermutation, moveQueueItem } from '../shared/routing'
import {
  classifyProxyPath,
  displayQueue,
  planAfterQueueChange,
  planEnable,
  planQuit,
  requestOrder,
  shouldFailoverHttp,
  upstreamProxyPath,
  upstreamRequestUrl,
} from '../electron/main/routing/policy'

describe('routing policy', () => {
  it('uses the router only for custom providers with a non-empty queue', () => {
    expect(planEnable('official', 2, false)).toEqual({ action: 'official', needsRestart: true })
    expect(planEnable('custom', 0, false)).toEqual({ action: 'direct', needsRestart: true })
    expect(planEnable('custom', 1, false)).toEqual({ action: 'router', needsRestart: true })
    expect(planEnable('custom', 2, true)).toEqual({ action: 'pointer', needsRestart: false })
    expect(planEnable('custom', 0, false, true)).toEqual({ action: 'router', needsRestart: true })
    expect(planEnable('custom', 0, true, true)).toEqual({ action: 'pointer', needsRestart: false })
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

  it('joins the upstream path onto the provider base url', () => {
    expect(classifyProxyPath('/v1/responses')).toBe('responses')
    expect(classifyProxyPath('/v1/models/')).toBe('models')
    expect(classifyProxyPath('/v1/messages')).toBe('messages')
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
