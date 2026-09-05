import { describe, expect, it } from 'vitest'
import { CircuitBreaker } from '../electron/main/routing/breaker'
import { RequestLog } from '../electron/main/routing/log'

describe('circuit breaker', () => {
  it('opens after the failure threshold and skips until recovery', () => {
    let now = 1_000
    const breaker = new CircuitBreaker(
      () => ({ failureThreshold: 2, recoveryWaitMs: 30_000, halfOpenSuccesses: 1 }),
      () => now,
    )
    expect(breaker.admit('a')).toBe(true)
    breaker.recordFailure('a')
    expect(breaker.admit('a')).toBe(true)
    breaker.recordFailure('a')
    expect(breaker.admit('a')).toBe(false)
    expect(breaker.snapshot(['a'])[0]?.state).toBe('open')
    now += 30_000
    expect(breaker.admit('a')).toBe(true)
    expect(breaker.snapshot(['a'])[0]?.state).toBe('halfOpen')
    expect(breaker.admit('a')).toBe(false)
    breaker.recordSuccess('a')
    expect(breaker.snapshot(['a'])[0]?.state).toBe('closed')
    expect(breaker.admit('a')).toBe(true)
  })

  it('reopens from a failed half-open probe', () => {
    let now = 1
    const breaker = new CircuitBreaker(
      () => ({ failureThreshold: 1, recoveryWaitMs: 10, halfOpenSuccesses: 2 }),
      () => now,
    )
    breaker.recordFailure('b')
    now += 10
    expect(breaker.admit('b')).toBe(true)
    breaker.recordFailure('b')
    expect(breaker.admit('b')).toBe(false)
    now += 10
    expect(breaker.admit('b')).toBe(true)
    breaker.recordSuccess('b')
    expect(breaker.snapshot(['b'])[0]?.state).toBe('halfOpen')
    expect(breaker.admit('b')).toBe(true)
    breaker.recordSuccess('b')
    expect(breaker.snapshot(['b'])[0]?.state).toBe('closed')
  })
})

describe('request log', () => {
  it('keeps a metadata-only ring and newest first', () => {
    const log = new RequestLog(() => 2)
    log.append({ providerId: 'a', model: 'm1', status: 200, latencyMs: 10, errorCode: '', at: 't1' })
    log.append({ providerId: 'b', model: 'm2', status: 429, latencyMs: 20, errorCode: 'http_429', at: 't2' })
    log.append({ providerId: 'c', model: 'm3', status: 0, latencyMs: 30, errorCode: 'timeout', at: 't3' })
    expect(log.list()).toEqual([
      { at: 't3', providerId: 'c', model: 'm3', status: 0, latencyMs: 30, errorCode: 'timeout' },
      { at: 't2', providerId: 'b', model: 'm2', status: 429, latencyMs: 20, errorCode: 'http_429' },
    ])
    expect(JSON.stringify(log.list())).not.toContain('authorization')
  })
})
