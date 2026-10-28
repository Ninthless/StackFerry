export function windowsSystemProxyUrl(enabled: boolean, server: string): string | null {
  if (!enabled) return null
  const raw = server.trim()
  if (!raw) return null
  const parts = raw.split(';').map((part) => part.trim()).filter(Boolean)
  const https = parts.find((part) => part.toLowerCase().startsWith('https='))
  const http = parts.find((part) => part.toLowerCase().startsWith('http='))
  const picked = (https ?? http ?? parts[0] ?? '').replace(/^(https|http)=/i, '').trim()
  if (!picked || picked === '<local>') return null
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(picked)) return picked.replace(/\/$/, '')
  return `http://${picked}`
}

export function installProxyEnv(input: {
  env: NodeJS.ProcessEnv
  egressUri?: string | null
  bypass?: string
  windowsProxy?: string | null
}): NodeJS.ProcessEnv {
  const existing = firstProxy(input.env)
  if (existing) return input.env
  const proxy = (input.egressUri || input.windowsProxy || '').trim()
  if (!proxy) return input.env
  const bypass = mergeProxyBypass(input.env.NO_PROXY || input.env.no_proxy || '', input.bypass ?? '')
  return {
    ...input.env,
    HTTP_PROXY: proxy,
    HTTPS_PROXY: proxy,
    http_proxy: proxy,
    https_proxy: proxy,
    NO_PROXY: bypass,
    no_proxy: bypass,
  }
}

export function proxyUrlFromEnv(env: NodeJS.ProcessEnv): string | null {
  return firstProxy(env)
}

export function powershellWithProxy(command: string, proxyUrl: string): string {
  const safe = proxyUrl.replaceAll("'", "''")
  return [
    `$env:HTTP_PROXY='${safe}'`,
    `$env:HTTPS_PROXY='${safe}'`,
    `$env:http_proxy='${safe}'`,
    `$env:https_proxy='${safe}'`,
    '[System.Net.WebRequest]::DefaultWebProxy = New-Object System.Net.WebProxy($env:HTTP_PROXY)',
    command,
  ].join('; ')
}

export function parseRegDword(stdout: string, name: string): number | null {
  const match = stdout.match(new RegExp(`^\\s*${name}\\s+REG_DWORD\\s+(\\S+)\\s*$`, 'im'))
  if (!match?.[1]) return null
  const value = match[1].trim()
  const parsed = value.toLowerCase().startsWith('0x') ? Number.parseInt(value, 16) : Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

export function parseRegString(stdout: string, name: string): string | null {
  const match = stdout.match(new RegExp(`^\\s*${name}\\s+REG_(?:SZ|EXPAND_SZ)\\s+(.*)$`, 'im'))
  const value = match?.[1]?.trim().replace(/\r$/, '')
  return value || null
}

function firstProxy(env: NodeJS.ProcessEnv): string | null {
  const value = env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy
  const trimmed = value?.trim()
  return trimmed || null
}

function mergeProxyBypass(current: string, extra: string): string {
  const seen = new Set<string>()
  const hosts: string[] = []
  for (const part of `${current},localhost,127.0.0.1,::1,${extra}`.split(/[,\s]+/)) {
    const host = part.trim()
    if (!host || seen.has(host.toLowerCase())) continue
    seen.add(host.toLowerCase())
    hosts.push(host)
  }
  return hosts.join(',')
}
