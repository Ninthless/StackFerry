import { AppError } from './app-error'

export type EgressProxyView = {
  enabled: boolean
  url: string
  username: string
  hasPassword: boolean
  bypass: string
}

export type EgressProxyPatch = {
  enabled?: boolean
  url?: string
  username?: string
  password?: string
  bypass?: string
}

export type ParsedEgressProxyUrl = {
  url: string
  username: string
  password: string
}

export function emptyEgressProxyView(): EgressProxyView {
  return { enabled: false, url: '', username: '', hasPassword: false, bypass: '' }
}

export function parseEgressProxyUrl(raw: string): ParsedEgressProxyUrl {
  const trimmed = raw.trim()
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new AppError('egress_proxy_url')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError('egress_proxy_url')
  }
  if (!parsed.hostname || (parsed.pathname !== '' && parsed.pathname !== '/')) {
    throw new AppError('egress_proxy_url')
  }
  return {
    url: parsed.origin,
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
  }
}

export function proxyUri(url: string, username: string, password: string): string {
  const parsed = new URL(url)
  if (username) parsed.username = username
  if (password) parsed.password = password
  return parsed.href.replace(/\/$/, '')
}

export function requestBypassesProxy(targetHref: string, bypass: string): boolean {
  let hostname = ''
  try {
    hostname = new URL(targetHref).hostname.toLowerCase()
  } catch {
    return false
  }
  if (isLoopbackHost(hostname)) return true
  for (const entry of bypassHosts(bypass)) {
    if (hostMatches(hostname, entry)) return true
  }
  return false
}

export function bypassHosts(bypass: string): string[] {
  const seen = new Set<string>()
  const hosts: string[] = []
  for (const part of bypass.split(/[,\s]+/)) {
    const host = part.trim().toLowerCase().replace(/^\.+/, '')
    if (!host || host === '*' || seen.has(host)) continue
    seen.add(host)
    hosts.push(host)
  }
  return hosts
}

export function formatBypass(bypass: string): string {
  return bypassHosts(bypass).join(', ')
}

function isLoopbackHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true
  if (hostname === '::1' || hostname === '0:0:0:0:0:0:0:1') return true
  return hostname.startsWith('127.')
}

function hostMatches(hostname: string, entry: string): boolean {
  return hostname === entry || hostname.endsWith(`.${entry}`)
}
