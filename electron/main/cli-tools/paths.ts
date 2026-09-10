import path from 'node:path'
import type { CliToolId } from '../../../shared/cli-tools'

export type PathContext = {
  platform: NodeJS.Platform
  home: string
  localAppData: string
  appData: string
  pathValue: string
  extraDirs: string[]
  systemRoot: string
}

export type ConfigHomes = {
  home: string
  codexHome: string
  claudeHome: string
  grokHome: string
}

export function normalizeFsPath(value: string): string {
  return value.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()
}

export function pathDelimiter(platform: NodeJS.Platform): string {
  return platform === 'win32' ? ';' : ':'
}

export function uniqueDirs(dirs: string[], platform: NodeJS.Platform): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const dir of dirs) {
    const trimmed = dir.trim()
    if (!trimmed) continue
    const key = platform === 'win32' ? normalizeFsPath(trimmed) : trimmed
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

const BINARY_BASE_NAMES: Record<CliToolId, string> = {
  codex: 'codex',
  'claude-code': 'claude',
  'grok-build': 'grok',
}

export function binaryBaseName(id: CliToolId): string {
  return BINARY_BASE_NAMES[id]
}

export function binaryNames(id: CliToolId, platform: NodeJS.Platform): string[] {
  const base = binaryBaseName(id)
  if (platform === 'win32') return [`${base}.exe`, `${base}.cmd`, base]
  return [base]
}

export function executableNames(base: string, platform: NodeJS.Platform): string[] {
  if (platform === 'win32') return [`${base}.cmd`, `${base}.exe`, base]
  return [base]
}

export function knownSearchDirs(ctx: PathContext): string[] {
  const { platform, home, localAppData, appData, systemRoot } = ctx
  if (platform === 'win32') {
    return [
      path.join(home, '.local', 'bin'),
      path.join(home, '.grok', 'bin'),
      nativeCodexWindowsBinDir(localAppData),
      path.join(appData, 'npm'),
      path.join(localAppData, 'pnpm'),
      path.join(localAppData, 'Microsoft', 'WindowsApps'),
      path.join(systemRoot, 'System32'),
      path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0'),
    ]
  }
  const posix = [
    path.join(home, '.local', 'bin'),
    path.join(home, '.grok', 'bin'),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.volta', 'bin'),
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ]
  if (platform === 'darwin') {
    return [
      ...posix,
      '/opt/homebrew/bin',
      path.join(home, 'Library', 'pnpm'),
    ]
  }
  return [
    ...posix,
    path.join(home, '.local', 'share', 'pnpm'),
    path.join(home, '.linuxbrew', 'bin'),
    '/home/linuxbrew/.linuxbrew/bin',
    '/snap/bin',
  ]
}

export function reconstructSearchDirs(ctx: PathContext): string[] {
  const delimiter = pathDelimiter(ctx.platform)
  const fromPath = ctx.pathValue.split(delimiter)
  return uniqueDirs([...knownSearchDirs(ctx), ...ctx.extraDirs, ...fromPath], ctx.platform)
}

export function nativeCodexWindowsBinDir(localAppData: string): string {
  return path.join(localAppData, 'Programs', 'OpenAI', 'Codex', 'bin')
}

export function knownToolPaths(name: 'npm' | 'brew' | 'winget' | 'powershell' | 'sh', ctx: PathContext): string[] {
  if (name === 'powershell') {
    return [path.join(ctx.systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')]
  }
  if (name === 'sh') return ['/bin/sh']
  if (name === 'winget') return [path.join(ctx.localAppData, 'Microsoft', 'WindowsApps', 'winget.exe')]
  if (name === 'brew') {
    return ['/opt/homebrew/bin/brew', '/usr/local/bin/brew', '/home/linuxbrew/.linuxbrew/bin/brew']
  }
  return []
}

export function wrapWindowsScript(
  file: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
  comspec = process.env.ComSpec,
): { file: string; args: string[]; verbatim: boolean } {
  if (platform === 'win32' && needsWindowsCmd(file)) {
    const cmd = comspec?.trim() || 'cmd.exe'
    return {
      file: cmd,
      args: ['/d', '/s', '/c', [windowsCmdName(file), ...args].join(' ')],
      verbatim: true,
    }
  }
  return { file, args, verbatim: false }
}

export function needsWindowsCmd(file: string): boolean {
  if (/\.(cmd|bat)$/i.test(file)) return true
  if (normalizeFsPath(file).includes('/microsoft/windowsapps/')) return true
  const base = commandBaseName(file)
  return base === 'winget' || base === 'winget.exe'
}

export function windowsCmdName(file: string): string {
  if (/\.(cmd|bat)$/i.test(file)) return `"${file.replaceAll('"', '')}"`
  // 执行别名不能按 WindowsApps 全路径启动，只能走命令名让 cmd 解析。
  if (normalizeFsPath(file).includes('/microsoft/windowsapps/') || needsWindowsCmd(file)) {
    return commandBaseName(file).replace(/\.exe$/i, '')
  }
  return file
}

function commandBaseName(file: string): string {
  return (file.replaceAll('\\', '/').split('/').pop() ?? file).toLowerCase()
}

export function grokNativeBinaries(grokHome: string): string[] {
  return [path.join(grokHome, 'bin', 'grok'), path.join(grokHome, 'bin', 'grok.exe')]
}

export function nativeUninstallTargets(id: CliToolId, ctx: PathContext & ConfigHomes): string[] {
  if (id === 'codex') {
    const targets = [path.join(ctx.codexHome, 'packages', 'standalone')]
    if (ctx.platform === 'win32') targets.push(nativeCodexWindowsBinDir(ctx.localAppData))
    else targets.push(path.join(ctx.home, '.local', 'bin', 'codex'))
    if (ctx.platform === 'darwin') {
      targets.push(path.join(ctx.home, '.local', 'bin', 'codex-code-mode-host'))
    }
    return targets
  }
  if (id === 'grok-build') return grokNativeBinaries(ctx.grokHome)
  const claudeBin = ctx.platform === 'win32' ? 'claude.exe' : 'claude'
  return [path.join(ctx.home, '.local', 'bin', claudeBin), path.join(ctx.home, '.local', 'share', 'claude')]
}

export function isInside(root: string, target: string): boolean {
  if (process.platform === 'win32') {
    const nRoot = normalizeFsPath(path.resolve(root))
    const nTarget = normalizeFsPath(path.resolve(target))
    return nTarget === nRoot || nTarget.startsWith(`${nRoot}/`)
  }
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(target)
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(resolvedRoot + path.sep)
}

// 卸载只允许删除二进制和包缓存，不得进入 ~/.codex 配置根、~/.claude 或 ~/.grok 配置。
export function isProtectedConfigPath(target: string, homes: ConfigHomes): boolean {
  const resolved = path.resolve(target)
  if (isInside(homes.claudeHome, resolved)) return true
  if (sameResolvedPath(resolved, path.join(homes.home, '.claude.json'))) return true
  const grokBins = grokNativeBinaries(homes.grokHome)
  if (grokBins.some((item) => sameResolvedPath(resolved, item))) return false
  if (isInside(homes.grokHome, resolved)) return true
  const standalone = path.resolve(homes.codexHome, 'packages', 'standalone')
  if (sameResolvedPath(resolved, standalone) || isInside(standalone, resolved)) return false
  return isInside(homes.codexHome, resolved)
}

function sameResolvedPath(left: string, right: string): boolean {
  const resolvedLeft = path.resolve(left)
  const resolvedRight = path.resolve(right)
  if (process.platform === 'win32') {
    return normalizeFsPath(resolvedLeft) === normalizeFsPath(resolvedRight)
  }
  return resolvedLeft === resolvedRight
}

export function parseRegPathQuery(stdout: string): string | null {
  const match = stdout.match(/^\s*Path\s+REG_(?:SZ|EXPAND_SZ)\s+(.*)$/im)
  const value = match?.[1]?.trim().replace(/\r$/, '')
  return value || null
}

export function expandWindowsEnv(value: string, env: NodeJS.ProcessEnv): string {
  return value.replace(/%([^%]+)%/g, (whole, name: string) => {
    const found = env[name] ?? env[name.toUpperCase()]
    return found ?? whole
  })
}

export function removePathEntry(
  pathValue: string,
  entry: string,
  delimiter: string,
): { next: string; removed: boolean } {
  const needle = normalizeFsPath(entry)
  const kept: string[] = []
  let removed = false
  for (const part of pathValue.split(delimiter)) {
    const trimmed = part.trim()
    if (!trimmed) continue
    if (normalizeFsPath(trimmed) === needle) {
      removed = true
      continue
    }
    kept.push(part)
  }
  return { next: kept.join(delimiter), removed }
}
