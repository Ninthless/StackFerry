import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { outboundFetch } from '../egress/fetch'
import { AppError } from '../../../shared/app-error'
import {
  CLI_TOOL_IDS,
  isCliToolId,
  type CliInstallMethod,
  type CliToolId,
  type CliToolStatus,
} from '../../../shared/cli-tools'
import { resolveClaudeHome } from '../claude/home'
import { resolveCodexHome } from '../codex/home'
import { resolveGrokHome } from '../grok/home'
import { resolvePiHome } from '../pi/home'
import {
  CLI_NPM_PACKAGES,
  INSTALL_TIMEOUT_MS,
  PI_INSTALL_TIMEOUT_MS,
  VERSION_TIMEOUT_MS,
  nativeInstallArgs,
  packageManagerArgs,
  type PackageManager,
  type ToolName,
} from './commands'
import { candidateBinaries, classifyInstallMethod, firstExisting, parseCliVersion, parseWhereOutput } from './detect'
import {
  installProxyEnv,
  parseRegDword,
  parseRegString,
  powershellWithProxy,
  proxyUrlFromEnv,
  windowsSystemProxyUrl,
} from './install-proxy'
import {
  CHECK_TIMEOUT_MS,
  cliVersionOutdated,
  grokNativeOutdated,
  npmLatestUrl,
  packageManagerCheckArgs,
  packageOutdatedResult,
  parseNpmLatestVersion,
  type CliOutdated,
} from './outdated'
import {
  binaryBaseName,
  expandWindowsEnv,
  executableNames,
  isProtectedConfigPath,
  knownToolPaths,
  nativeCodexWindowsBinDir,
  execFileCaptured,
  insertPiPathLine,
  nativeUninstallTargets,
  parseRegPathQuery,
  pathDelimiter,
  pathHasEntry,
  piAgentBinDir,
  piOwnedCommandDir,
  piPathExportLine,
  piShellName,
  piShellRcPath,
  portableWindowsPathEntry,
  prependPathEntry,
  reconstructSearchDirs,
  removePathEntry,
  stripPiPathLine,
  wrapWindowsScript,
  type PathContext,
} from './paths'

const execFileAsync = promisify(execFile)

type ExecError = NodeJS.ErrnoException & { killed?: boolean; stdout?: string; stderr?: string }

type EgressRoute = {
  route: () => Promise<{ proxyUri: string | null; bypass: string }>
}

export class CliToolService {
  constructor(private readonly egress?: EgressRoute) {}
  async list(): Promise<CliToolStatus[]> {
    return this.inspectAll()
  }

  async checkUpdates(): Promise<CliToolStatus[]> {
    return this.inspectAll({ check: true })
  }

  async install(id: CliToolId): Promise<CliToolStatus[]> {
    requireId(id)
    const current = await this.inspect(id)
    if (!current.installed) await this.runNativeInstall(id)
    else if (id === 'pi' && current.method === 'native' && current.path) await this.ensurePiCommandPath(current.path)
    return this.checkUpdates()
  }

  async update(id: CliToolId): Promise<CliToolStatus[]> {
    requireId(id)
    const current = await this.requireInstalled(id)
    const method = requireManagedMethod(current.method)
    if (method === 'native') {
      if (id === 'grok-build' && current.path) {
        await this.runExec(current.path, ['update'], INSTALL_TIMEOUT_MS, await this.commandEnv())
      } else if (id === 'pi' && current.path) {
        await this.runExec(current.path, ['update'], PI_INSTALL_TIMEOUT_MS, await this.commandEnv(), {
          closeStdin: true,
        })
        await this.ensurePiCommandPath(current.path)
      } else {
        await this.runNativeInstall(id)
      }
    } else {
      await this.runPackageManager(id, method, 'update')
    }
    return this.checkUpdates()
  }

  async uninstall(id: CliToolId): Promise<CliToolStatus[]> {
    requireId(id)
    const current = await this.requireInstalled(id)
    const method = requireManagedMethod(current.method)
    if (method === 'native') await this.uninstallNative(id)
    else await this.runPackageManager(id, method, 'uninstall')
    return this.list()
  }

  private async inspectAll(options?: { check?: boolean }): Promise<CliToolStatus[]> {
    const npmPrefix = await this.readNpmPrefix()
    return Promise.all(CLI_TOOL_IDS.map((id) => this.inspect(id, { ...options, npmPrefix })))
  }

  private async inspect(
    id: CliToolId,
    options?: { check?: boolean; npmPrefix?: string | null },
  ): Promise<CliToolStatus> {
    const dirs = await this.searchDirs()
    let binary = firstExisting(candidateBinaries(id, dirs, process.platform), isRunnable)
    if (!binary) binary = await this.whichBinary(id)
    if (!binary) {
      return {
        id,
        installed: false,
        version: null,
        path: null,
        method: null,
        updateAvailable: false,
        latestVersion: null,
      }
    }
    const npmPrefix = options?.npmPrefix !== undefined ? options.npmPrefix : await this.readNpmPrefix()
    const method = classifyInstallMethod(resolveRealPath(binary), {
      home: os.homedir(),
      grokHome: resolveGrokHome(),
      piHome: resolvePiHome(),
      npmPrefix: npmPrefix ? resolveRealPath(npmPrefix) : null,
    })
    const version = await this.readVersion(binary)
    const outdated = options?.check
      ? await this.hasUpdate(id, method, binary, version)
      : { available: false, latestVersion: null }
    return {
      id,
      installed: true,
      version,
      path: binary,
      method,
      updateAvailable: outdated.available,
      latestVersion: outdated.latestVersion,
    }
  }

  private async requireInstalled(id: CliToolId): Promise<CliToolStatus> {
    const current = await this.inspect(id)
    if (!current.installed) throw new AppError('cli_not_found')
    return current
  }

  private async readNpmPrefix(): Promise<string | null> {
    try {
      const file = await this.resolveTool('npm')
      const captured = await this.runExecCapture(file, ['prefix', '-g'], VERSION_TIMEOUT_MS)
      if (captured.error) return null
      const prefix = captured.stdout.trim().split(/\r?\n/, 1)[0]?.trim()
      return prefix || null
    } catch {
      return null
    }
  }

  private async runNativeInstall(id: CliToolId): Promise<void> {
    const spec = nativeInstallArgs(id, process.platform)
    const file = await this.resolveTool(spec.tool)
    const env = await this.commandEnv(id === 'codex' ? { CODEX_NON_INTERACTIVE: '1' } : undefined)
    const args = spec.tool === 'powershell' ? applyPowershellProxy(spec.args, proxyUrlFromEnv(env)) : spec.args
    await this.runExec(file, args, spec.timeoutMs, env, { closeStdin: id === 'pi' })
    if (id === 'pi') await this.ensurePiCommandPath(piAgentBinDir(os.homedir(), resolvePiHome()))
  }

  private async hasUpdate(
    id: CliToolId,
    method: CliInstallMethod,
    binary: string | null,
    version: string | null,
  ): Promise<CliOutdated> {
    const none = { available: false, latestVersion: null }
    if (id === 'grok-build' && method === 'native' && binary) {
      try {
        const { stdout } = await this.runExecCapture(binary, ['update', '--check'], CHECK_TIMEOUT_MS)
        return grokNativeOutdated(stdout)
      } catch {
        return none
      }
    }
    if (method === 'native') {
      const latestVersion = await this.npmRegistryLatest(id)
      return { available: cliVersionOutdated(version, latestVersion), latestVersion }
    }
    if (method === 'unknown') return none
    try {
      const platform = this.pathContext().platform
      const spec = packageManagerCheckArgs(id, method, platform)
      const file = await this.resolveTool(spec.tool)
      const { stdout } = await this.runExecCapture(file, spec.args, spec.timeoutMs)
      return packageOutdatedResult(method, stdout, id, platform)
    } catch {
      return none
    }
  }

  private async npmRegistryLatest(id: CliToolId): Promise<string | null> {
    const pkg = CLI_NPM_PACKAGES[id]
    if (!pkg) return null
    try {
      const response = await outboundFetch(npmLatestUrl(pkg), { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) })
      if (!response.ok) return null
      return parseNpmLatestVersion(await response.text())
    } catch {
      return null
    }
  }

  private async runPackageManager(
    id: CliToolId,
    method: PackageManager,
    action: 'update' | 'uninstall',
  ): Promise<void> {
    const spec = packageManagerArgs(id, method, action, this.pathContext().platform)
    const file = await this.resolveTool(spec.tool)
    await this.runExec(file, spec.args, spec.timeoutMs, await this.commandEnv())
  }

  private async uninstallNative(id: CliToolId): Promise<void> {
    const ctx = this.pathContext()
    const homes = {
      home: ctx.home,
      codexHome: resolveCodexHome(),
      claudeHome: resolveClaudeHome(),
      grokHome: resolveGrokHome(),
    }
    const targets = nativeUninstallTargets(id, { ...ctx, ...homes, piHome: resolvePiHome() }).filter(
      (target) => !isProtectedConfigPath(target, homes),
    )
    for (const target of targets) {
      if (!existsSync(target) || isProtectedConfigPath(target, homes)) continue
      rmSync(target, { recursive: true, force: true })
    }
    if (id === 'codex' && process.platform === 'win32') await this.removeUserPathEntry(nativeCodexWindowsBinDir(ctx.localAppData))
    if (id === 'pi') await this.removePiCommandPath()
  }

  private async removeUserPathEntry(entry: string): Promise<void> {
    const current = await this.queryUserPath()
    if (!current) return
    const expand = (value: string) => expandWindowsEnv(value, process.env)
    const { next, removed } = removePathEntry(current, entry, ';', expand)
    if (!removed) return
    await this.writeWindowsUserPath(next)
  }

  private async commandEnv(extra?: Record<string, string>): Promise<NodeJS.ProcessEnv> {
    const base = await this.spawnEnv()
    const windowsProxy = process.platform === 'win32' ? await this.readWindowsProxyUrl() : null
    let egressUri: string | null = null
    let bypass = ''
    if (this.egress) {
      try {
        const route = await this.egress.route()
        egressUri = route.proxyUri
        bypass = route.bypass
      } catch {
        egressUri = null
      }
    }
    return { ...installProxyEnv({ env: base, egressUri, bypass, windowsProxy }), ...extra }
  }

  private async readWindowsProxyUrl(): Promise<string | null> {
    const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
    try {
      const enable = await execFileAsync('reg', ['query', key, '/v', 'ProxyEnable'], {
        windowsHide: true,
        encoding: 'utf8',
        timeout: 5_000,
      })
      const server = await execFileAsync('reg', ['query', key, '/v', 'ProxyServer'], {
        windowsHide: true,
        encoding: 'utf8',
        timeout: 5_000,
      })
      const enabled = parseRegDword(enable.stdout, 'ProxyEnable') === 1
      return windowsSystemProxyUrl(enabled, parseRegString(server.stdout, 'ProxyServer') ?? '')
    } catch {
      return null
    }
  }

  private async ensurePiCommandPath(binaryOrDir: string): Promise<void> {
    const dir = piOwnedCommandDir(binaryOrDir, os.homedir(), resolvePiHome())
    if (!dir) return
    try {
      if (process.platform === 'win32') await this.ensureWindowsUserPath(dir)
      else this.ensurePosixPiPath(dir)
    } catch {
      return
    }
  }

  private async ensureWindowsUserPath(dir: string): Promise<void> {
    const current = (await this.queryUserPath()) ?? ''
    const entry = portableWindowsPathEntry(dir, os.homedir())
    const expand = (value: string) => expandWindowsEnv(value, process.env)
    if (pathHasEntry(current, entry, ';', expand) || pathHasEntry(current, dir, ';', expand)) return
    await this.writeWindowsUserPath(prependPathEntry(current, entry, ';'))
  }

  private async writeWindowsUserPath(next: string): Promise<void> {
    const powershell = await this.resolveTool('powershell')
    await this.runExec(
      powershell,
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        WINDOWS_USER_PATH_COMMAND,
      ],
      15_000,
      { ...process.env, STACKFERRY_NEXT_PATH: next },
    )
  }

  private ensurePosixPiPath(dir: string): void {
    const { rc, line } = this.piRcTarget(dir)
    const current = existsSync(rc) ? readFileSync(rc, 'utf8') : ''
    const next = insertPiPathLine(current, line)
    if (next === current) return
    mkdirSync(path.dirname(rc), { recursive: true })
    writeFileSync(rc, next, 'utf8')
  }

  private async removePiCommandPath(): Promise<void> {
    const dir = piAgentBinDir(os.homedir(), resolvePiHome())
    if (process.platform === 'win32') {
      const current = await this.queryUserPath()
      if (!current) return
      const expand = (value: string) => expandWindowsEnv(value, process.env)
      const { next, removed } = removePathEntry(current, dir, ';', expand)
      if (!removed) return
      await this.writeWindowsUserPath(next)
      return
    }
    const { rc, line } = this.piRcTarget(dir)
    if (!existsSync(rc)) return
    writeFileSync(rc, stripPiPathLine(readFileSync(rc, 'utf8'), line), 'utf8')
  }

  private piRcTarget(dir: string): { rc: string; line: string } {
    const home = os.homedir()
    const shell = piShellName(process.env.SHELL, os.userInfo().shell)
    return {
      rc: piShellRcPath(home, shell, {
        zdotdir: process.env.ZDOTDIR,
        bashRcExists: existsSync(path.join(home, '.bashrc')),
      }),
      line: piPathExportLine(dir, shell, home),
    }
  }

  private async searchDirs(): Promise<string[]> {
    const ctx = this.pathContext()
    const extraDirs = [
      path.join(resolveGrokHome(), 'bin'),
      piAgentBinDir(ctx.home, resolvePiHome()),
      ...(process.platform === 'win32' ? await this.readWindowsExtraDirs() : []),
    ]
    return reconstructSearchDirs({ ...ctx, extraDirs })
  }

  private async readWindowsExtraDirs(): Promise<string[]> {
    const keys = [
      'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment',
      'HKCU\\Environment',
    ]
    const dirs: string[] = []
    for (const key of keys) {
      const value = await this.queryRegPath(key)
      if (!value) continue
      dirs.push(...expandWindowsEnv(value, process.env).split(';'))
    }
    return dirs
  }

  private async queryUserPath(): Promise<string | null> {
    return this.queryRegPath('HKCU\\Environment')
  }

  private async queryRegPath(key: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('reg', ['query', key, '/v', 'Path'], {
        windowsHide: true,
        encoding: 'utf8',
        timeout: 5_000,
      })
      return parseRegPathQuery(stdout)
    } catch {
      return null
    }
  }

  private async whichBinary(id: CliToolId): Promise<string | null> {
    const env = await this.spawnEnv()
    const name = binaryBaseName(id)
    try {
      const file = process.platform === 'win32' ? 'where.exe' : 'which'
      const { stdout } = await execFileAsync(file, [name], {
        env,
        windowsHide: true,
        encoding: 'utf8',
        timeout: 5_000,
      })
      return parseWhereOutput(stdout)
    } catch {
      return null
    }
  }

  private async readVersion(binary: string): Promise<string | null> {
    try {
      const { stdout } = await this.runExec(binary, ['--version'], VERSION_TIMEOUT_MS)
      return parseCliVersion(stdout)
    } catch {
      return null
    }
  }

  private async resolveTool(name: ToolName): Promise<string> {
    const dirs = await this.searchDirs()
    const ctx = this.pathContext()
    const names = name === 'powershell' ? ['powershell.exe'] : executableNames(name, process.platform)
    const candidates = [...knownToolPaths(name, ctx)]
    for (const dir of dirs) {
      for (const file of names) candidates.push(path.join(dir, file))
    }
    const found = firstExisting(candidates, isRunnable)
    if (found) return found
    const located = await this.lookupOnPath(names)
    if (located) return located
    if (name === 'npm') throw new AppError('cli_npm_missing')
    if (process.platform === 'win32' && name === 'winget') return 'winget'
    throw new AppError('cli_spawn_failed', { detail: `${name} not found` })
  }

  private async lookupOnPath(names: string[]): Promise<string | null> {
    const env = await this.spawnEnv()
    const finder = process.platform === 'win32' ? 'where.exe' : 'which'
    for (const name of names) {
      try {
        const { stdout } = await execFileAsync(finder, [name], {
          env,
          windowsHide: true,
          encoding: 'utf8',
          timeout: 5_000,
        })
        const located = parseWhereOutput(stdout)
        if (located) return located
      } catch {
        continue
      }
    }
    return null
  }

  private async spawnEnv(): Promise<NodeJS.ProcessEnv> {
    const pathValue = (await this.searchDirs()).join(pathDelimiter(process.platform))
    return { ...process.env, PATH: pathValue, Path: pathValue }
  }

  private async runExec(
    file: string,
    args: string[],
    timeoutMs: number,
    env: NodeJS.ProcessEnv = process.env,
    options?: { closeStdin?: boolean },
  ): Promise<{ stdout: string; stderr: string }> {
    const captured = await this.runExecCapture(file, args, timeoutMs, env, options)
    if (captured.error) throw captured.error
    return { stdout: captured.stdout, stderr: captured.stderr }
  }

  private async runExecCapture(
    file: string,
    args: string[],
    timeoutMs: number,
    env: NodeJS.ProcessEnv = process.env,
    options?: { closeStdin?: boolean },
  ): Promise<{ stdout: string; stderr: string; error: AppError | null }> {
    const spawnEnv = env === process.env ? await this.spawnEnv() : env
    const spawn = wrapWindowsScript(file, args)
    try {
      const result = await execFileCaptured(spawn.file, spawn.args, {
        timeout: timeoutMs,
        env: spawnEnv,
        windowsVerbatimArguments: spawn.verbatim,
        closeStdin: options?.closeStdin,
      })
      return { stdout: decodeConsole(result.stdout), stderr: decodeConsole(result.stderr), error: null }
    } catch (error) {
      const decoded = decodeSpawnError(error) as ExecError
      const stdout = typeof decoded.stdout === 'string' ? decoded.stdout : ''
      const stderr = typeof decoded.stderr === 'string' ? decoded.stderr : ''
      return { stdout, stderr, error: mapSpawnError(decoded, spawn.file) }
    }
  }

  private pathContext(): PathContext {
    const home = os.homedir()
    return {
      platform: process.platform,
      home,
      localAppData: process.env.LOCALAPPDATA?.trim() || path.join(home, 'AppData', 'Local'),
      appData: process.env.APPDATA?.trim() || path.join(home, 'AppData', 'Roaming'),
      pathValue: process.env.PATH || process.env.Path || '',
      extraDirs: [],
      systemRoot: process.env.SystemRoot?.trim() || 'C:\\Windows',
    }
  }
}

function requireId(id: CliToolId): void {
  if (!isCliToolId(id)) throw new AppError('cli_not_found')
}

function requireManagedMethod(method: CliInstallMethod | null): 'native' | PackageManager {
  if (method === 'native' || method === 'npm' || method === 'homebrew' || method === 'winget') {
    return method
  }
  throw new AppError('cli_method_unsupported')
}

function isRunnable(file: string): boolean {
  try {
    return statSync(file).isFile()
  } catch {
    return false
  }
}

function resolveRealPath(file: string): string {
  try {
    return realpathSync(file)
  } catch {
    return file
  }
}

const WINDOWS_USER_PATH_COMMAND = [
  "$reg = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)",
  'if (-not $reg) { exit 1 }',
  "$reg.SetValue('Path', $env:STACKFERRY_NEXT_PATH, 'ExpandString')",
  '$reg.Close()',
  "try { if (-not ('Win32.StackFerryNative' -as [type])) { Add-Type -Namespace Win32 -Name StackFerryNative -MemberDefinition '[DllImport(\"user32.dll\", CharSet=CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);' }; $broadcast = [UIntPtr]::Zero; [Win32.StackFerryNative]::SendMessageTimeout([IntPtr]0xffff, 0x1a, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$broadcast) | Out-Null } catch {}",
].join('; ')

function applyPowershellProxy(args: string[], proxyUrl: string | null): string[] {
  if (!proxyUrl) return args
  const commandIndex = args.lastIndexOf('-Command')
  const command = args[commandIndex + 1]
  if (commandIndex < 0 || commandIndex !== args.length - 2 || !command) return args
  return [...args.slice(0, commandIndex + 1), powershellWithProxy(command, proxyUrl)]
}

function decodeConsole(bytes: Buffer): string {
  const utf8 = bytes.toString('utf8')
  if (!utf8.includes('\uFFFD') && !utf8.includes('锟斤拷')) return utf8
  try {
    return new TextDecoder('gbk').decode(bytes)
  } catch {
    return utf8
  }
}

function decodeSpawnError(error: unknown): unknown {
  if (!error || typeof error !== 'object') return error
  const err = error as ExecError & { stdout?: Buffer | string; stderr?: Buffer | string }
  if (Buffer.isBuffer(err.stderr)) err.stderr = decodeConsole(err.stderr)
  if (Buffer.isBuffer(err.stdout)) err.stdout = decodeConsole(err.stdout)
  return err
}

function mapSpawnError(error: unknown, command: string): AppError {
  if (error instanceof AppError) return error
  const err = error as ExecError
  if (err.code === 'ENOENT') {
    const base = path.basename(command).toLowerCase()
    if (base === 'npm' || base === 'npm.cmd' || base === 'npm.exe') return new AppError('cli_npm_missing')
    return new AppError('cli_spawn_failed', { detail: `${path.basename(command)} not found` })
  }
  if (err.killed) return new AppError('cli_timeout')
  const detail = String(err.stderr || err.message || 'spawn failed').trim().slice(0, 400)
  return new AppError('cli_spawn_failed', { detail: detail || 'spawn failed' })
}
