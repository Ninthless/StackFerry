import { describe, expect, it } from 'vitest'
import {
  classifyProxyPath,
  planAfterQueueChange,
  planEnable,
  planQuit,
  requestOrder,
  shouldFailoverHttp,
  upstreamRequestUrl,
} from '../electron/main/routing/policy'

describe('routing policy', () => {
  it('uses the router only for custom providers with a non-empty queue', () => {
    expect(planEnable('official', 2, false)).toEqual({ action: 'official', needsRestart: true })
    expect(planEnable('custom', 0, false)).toEqual({ action: 'direct', needsRestart: true })
    expect(planEnable('custom', 1, false)).toEqual({ action: 'router', needsRestart: true })
    expect(planEnable('custom', 2, true)).toEqual({ action: 'pointer', needsRestart: false })
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
    expect(planQuit(true)).toBe('restore-direct')
    expect(planQuit(false)).toBe('none')
  })

  it('tries the enabled custom provider first then the queue', () => {
    expect(requestOrder('active', ['b', 'active', 'c'])).toEqual(['active', 'b', 'c'])
    expect(requestOrder('active', ['b', 'c'])).toEqual(['active', 'b', 'c'])
    expect(requestOrder(null, ['b', 'c'])).toEqual(['b', 'c'])
  })

  it('fails over on 429 and 5xx only', () => {
    expect(shouldFailoverHttp(429)).toBe(true)
    expect(shouldFailoverHttp(502)).toBe(true)
    expect(shouldFailoverHttp(400)).toBe(false)
    expect(shouldFailoverHttp(401)).toBe(false)
    expect(shouldFailoverHttp(200)).toBe(false)
  })

  it('joins the upstream path onto the provider base url', () => {
    expect(classifyProxyPath('/v1/responses')).toBe('responses')
    expect(classifyProxyPath('/v1/models/')).toBe('models')
    expect(classifyProxyPath('/health')).toBeNull()
    expect(upstreamRequestUrl('https://api.example/v1', '/v1/responses')).toBe(
      'https://api.example/v1/responses',
    )
    expect(
      upstreamRequestUrl('https://azure.example/openai', '/v1/responses', { 'api-version': 'preview' }),
    ).toBe('https://azure.example/openai/responses?api-version=preview')
  })
})
