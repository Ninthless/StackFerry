import { execFile, type ExecFileException } from 'node:child_process'
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
  pi: 'pi',
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
      piAgentBinDir(home),
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
    piAgentBinDir(home),
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

type CapturedError = ExecFileException & { stdout?: Buffer; stderr?: Buffer }

export function execFileCaptured(
  file: string,
  args: string[],
  options: {
    timeout: number
    env?: NodeJS.ProcessEnv
    windowsVerbatimArguments?: boolean
    maxBuffer?: number
    closeStdin?: boolean
  },
): Promise<{ stdout: Buffer; stderr: Buffer }> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      file,
      args,
      {
        timeout: options.timeout,
        windowsHide: true,
        encoding: 'buffer',
        maxBuffer: options.maxBuffer ?? 2 * 1024 * 1024,
        env: options.env,
        windowsVerbatimArguments: options.windowsVerbatimArguments,
      },
      (error, stdout, stderr) => {
        const out = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout ?? '')
        const errOut = Buffer.isBuffer(stderr) ? stderr : Buffer.from(stderr ?? '')
        if (error) {
          const failed = error as CapturedError
          failed.stdout = out
          failed.stderr = errOut
          reject(failed)
          return
        }
        resolve({ stdout: out, stderr: errOut })
      },
    )
    if (options.closeStdin) {
      const closeInput = () => {
        if (child.stdin && !child.stdin.writableEnded) child.stdin.end()
      }
      child.once('spawn', closeInput)
      if (child.pid) closeInput()
    }
  })
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

export function piAgentDir(home: string, piHome?: string): string {
  const configured = piHome?.trim()
  if (configured) return configured
  return path.join(home, '.pi', 'agent')
}

export function piAgentBinDir(home: string, piHome?: string): string {
  return path.join(piAgentDir(home, piHome), 'bin')
}

export function piOwnedCommandDir(binaryOrDir: string, home: string, piHome?: string): string | null {
  const managed = piAgentBinDir(home, piHome)
  const normalizedManaged = normalizeFsPath(managed)
  const normalizedInput = normalizeFsPath(binaryOrDir)
  if (normalizedInput === normalizedManaged || normalizedInput.startsWith(`${normalizedManaged}/`)) return managed
  return null
}

export function piShellName(envShell?: string, loginShell?: string | null): string {
  const fromEnv = shellFileName(envShell)
  if (fromEnv) return fromEnv
  const fromLogin = shellFileName(loginShell)
  if (fromLogin) return fromLogin
  return 'sh'
}

function shellFileName(value?: string | null): string {
  const trimmed = value?.trim()
  if (!trimmed) return ''
  return path.basename(trimmed)
}

export function piNativeUninstallTargets(
  ctx: { home: string; platform: NodeJS.Platform; piHome?: string },
): string[] {
  const agent = piAgentDir(ctx.home, ctx.piHome)
  const bin = path.join(agent, 'bin')
  const names = ctx.platform === 'win32' ? ['pi', 'pi.cmd', 'pi.ps1', 'pi-launcher.js', 'pi.exe'] : ['pi']
  const legacy = ctx.platform === 'win32' ? 'pi.exe' : 'pi'
  return [
    ...names.map((name) => path.join(bin, name)),
    path.join(agent, 'install'),
    path.join(ctx.home, '.local', 'bin', legacy),
  ]
}

export function pathHasEntry(
  pathValue: string,
  entry: string,
  delimiter: string,
  expand: (value: string) => string = (value) => value,
): boolean {
  const needle = normalizeFsPath(expand(entry))
  if (!needle) return false
  return pathValue.split(delimiter).some((part) => normalizeFsPath(expand(part.trim())) === needle)
}

export function prependPathEntry(pathValue: string, entry: string, delimiter: string): string {
  const kept = pathValue
    .split(delimiter)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => normalizeFsPath(part) !== normalizeFsPath(entry))
  return [entry, ...kept].join(delimiter)
}

export function portableWindowsPathEntry(entry: string, home: string): string {
  const normalizedEntry = normalizeFsPath(entry)
  const normalizedHome = normalizeFsPath(home)
  if (!normalizedEntry.startsWith(`${normalizedHome}/`)) return entry
  const rest = normalizedEntry.slice(normalizedHome.length)
  return `%USERPROFILE%${rest.replaceAll('/', '\\')}`
}

export function piShellRcPath(
  home: string,
  shellName: string,
  options?: { zdotdir?: string; bashRcExists?: boolean },
): string {
  switch (shellName) {
    case 'fish':
      return path.join(home, '.config', 'fish', 'config.fish')
    case 'zsh':
      return path.join(options?.zdotdir?.trim() || home, '.zshrc')
    case 'bash':
      return path.join(home, options?.bashRcExists ? '.bashrc' : '.profile')
    default:
      return path.join(home, '.profile')
  }
}

export function piPathExportLine(binDir: string, shellName: string, home: string): string {
  const expr = normalizeFsPath(binDir) === normalizeFsPath(path.join(home, '.local', 'bin')) ? '$HOME/.local/bin' : binDir
  if (shellName === 'fish') return `fish_add_path "${expr}"`
  return `export PATH="${expr}:$PATH"`
}

export function insertPiPathLine(content: string, line: string): string {
  if (content.split(/\r?\n/).some((item) => item.trim() === line)) return content
  const base = content.replace(/\s*$/, '')
  return `${base}${base ? '\n' : ''}# Pi\n${line}\n`
}

export function stripPiPathLine(content: string, line: string): string {
  const lines = content.split(/\r?\n/)
  const kept: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]?.trim() === '# Pi' && lines[index + 1]?.trim() === line) {
      index += 1
      continue
    }
    if (lines[index]?.trim() === line) continue
    kept.push(lines[index] ?? '')
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n')
}

export function grokNativeBinaries(grokHome: string): string[] {
  return [path.join(grokHome, 'bin', 'grok'), path.join(grokHome, 'bin', 'grok.exe')]
}

export function nativeUninstallTargets(
  id: CliToolId,
  ctx: PathContext & ConfigHomes & { piHome?: string },
): string[] {
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
  if (id === 'pi') return piNativeUninstallTargets(ctx)
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
  expand: (value: string) => string = (value) => value,
): { next: string; removed: boolean } {
  const needle = normalizeFsPath(expand(entry))
  const kept: string[] = []
  let removed = false
  for (const part of pathValue.split(delimiter)) {
    const trimmed = part.trim()
    if (!trimmed) continue
    if (normalizeFsPath(expand(trimmed)) === needle) {
      removed = true
      continue
    }
    kept.push(part)
  }
  return { next: kept.join(delimiter), removed }
}
