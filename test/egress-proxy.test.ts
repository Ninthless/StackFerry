import { describe, expect, it } from 'vitest'
import { AppError } from '../shared/app-error'
import {
  formatBypass,
  parseEgressProxyUrl,
  proxyUri,
  requestBypassesProxy,
} from '../shared/egress-proxy'

describe('parseEgressProxyUrl', () => {
  it('accepts a remote https proxy and splits credentials', () => {
    expect(parseEgressProxyUrl('https://user:p%40ss@proxy.example.com:8443')).toEqual({
      url: 'https://proxy.example.com:8443',
      username: 'user',
      password: 'p@ss',
    })
  })

  it('accepts a local http proxy without credentials', () => {
    expect(parseEgressProxyUrl('http://127.0.0.1:7890')).toEqual({
      url: 'http://127.0.0.1:7890',
      username: '',
      password: '',
    })
  })

  it('rejects socks and addresses without a host', () => {
    expect(() => parseEgressProxyUrl('socks5://127.0.0.1:1080')).toThrow(AppError)
    expect(() => parseEgressProxyUrl('http://proxy.example.com/path')).toThrow(AppError)
  })
})

describe('proxy routing', () => {
  it('puts auth on the proxy uri', () => {
    expect(proxyUri('https://proxy.example.com:8443', 'user', 'p@ss')).toBe(
      'https://user:p%40ss@proxy.example.com:8443',
    )
  })

  it('keeps loopback direct and sends other hosts through the proxy', () => {
    expect(requestBypassesProxy('http://127.0.0.1:4317/v1/responses', '')).toBe(true)
    expect(requestBypassesProxy('https://api.example.com/v1/responses', '')).toBe(false)
    expect(requestBypassesProxy('https://api.example.com/v1', 'example.com')).toBe(true)
    expect(requestBypassesProxy('https://other.test/v1', formatBypass('example.com, other.test'))).toBe(true)
  })
})
