import { execFile } from 'node:child_process'
import { existsSync, rmSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
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
import {
  CLI_NPM_PACKAGES,
  INSTALL_TIMEOUT_MS,
  VERSION_TIMEOUT_MS,
  nativeInstallArgs,
  packageManagerArgs,
  type PackageManager,
  type ToolName,
} from './commands'
import { candidateBinaries, classifyInstallMethod, firstExisting, parseCliVersion, parseWhereOutput } from './detect'
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
  nativeUninstallTargets,
  parseRegPathQuery,
  pathDelimiter,
  reconstructSearchDirs,
  removePathEntry,
  wrapWindowsScript,
  type PathContext,
} from './paths'

const execFileAsync = promisify(execFile)

type ExecError = NodeJS.ErrnoException & { killed?: boolean; stdout?: string; stderr?: string }

export class CliToolService {
  async list(): Promise<CliToolStatus[]> {
    return Promise.all(CLI_TOOL_IDS.map((id) => this.inspect(id)))
  }

  async checkUpdates(): Promise<CliToolStatus[]> {
    return Promise.all(CLI_TOOL_IDS.map((id) => this.inspect(id, { check: true })))
  }

  async install(id: CliToolId): Promise<CliToolStatus[]> {
    requireId(id)
    const current = await this.inspect(id)
    if (!current.installed) await this.runNativeInstall(id)
    return this.checkUpdates()
  }

  async update(id: CliToolId): Promise<CliToolStatus[]> {
    requireId(id)
    const current = await this.requireInstalled(id)
    const method = requireManagedMethod(current.method)
    if (method === 'native') {
      if (id === 'grok-build' && current.path) {
        await this.runExec(current.path, ['update'], INSTALL_TIMEOUT_MS)
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

  private async inspect(id: CliToolId, options?: { check?: boolean }): Promise<CliToolStatus> {
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
    const method = classifyInstallMethod(binary, { home: os.homedir(), grokHome: resolveGrokHome() })
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

  private async runNativeInstall(id: CliToolId): Promise<void> {
    const spec = nativeInstallArgs(id, process.platform)
    const file = await this.resolveTool(spec.tool)
    await this.runExec(file, spec.args, spec.timeoutMs)
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
      const spec = packageManagerCheckArgs(id, method)
      const file = await this.resolveTool(spec.tool)
      const { stdout } = await this.runExecCapture(file, spec.args, spec.timeoutMs)
      return packageOutdatedResult(method, stdout, id)
    } catch {
      return none
    }
  }

  private async npmRegistryLatest(id: CliToolId): Promise<string | null> {
    const pkg = CLI_NPM_PACKAGES[id]
    if (!pkg) return null
    try {
      const response = await fetch(npmLatestUrl(pkg), { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) })
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
    const spec = packageManagerArgs(id, method, action)
    const file = await this.resolveTool(spec.tool)
    await this.runExec(file, spec.args, spec.timeoutMs)
  }

  private async uninstallNative(id: CliToolId): Promise<void> {
    const ctx = this.pathContext()
    const homes = {
      home: ctx.home,
      codexHome: resolveCodexHome(),
      claudeHome: resolveClaudeHome(),
      grokHome: resolveGrokHome(),
    }
    const targets = nativeUninstallTargets(id, { ...ctx, ...homes }).filter(
      (target) => !isProtectedConfigPath(target, homes),
    )
    for (const target of targets) {
      if (!existsSync(target) || isProtectedConfigPath(target, homes)) continue
      rmSync(target, { recursive: true, force: true })
    }
    if (id === 'codex' && process.platform === 'win32') await this.removeCodexPathEntry()
  }

  private async removeCodexPathEntry(): Promise<void> {
    const current = await this.queryUserPath()
    if (!current) return
    const bin = nativeCodexWindowsBinDir(this.pathContext().localAppData)
    const { next, removed } = removePathEntry(expandWindowsEnv(current, process.env), bin, ';')
    if (!removed) return
    const powershell = await this.resolveTool('powershell')
    await this.runExec(
      powershell,
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        "[Environment]::SetEnvironmentVariable('Path', $env:STACKFERRY_NEXT_PATH, 'User')",
      ],
      15_000,
      { ...process.env, STACKFERRY_NEXT_PATH: next },
    )
  }

  private async searchDirs(): Promise<string[]> {
    const ctx = this.pathContext()
    const extraDirs = [
      path.join(resolveGrokHome(), 'bin'),
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
  ): Promise<{ stdout: string; stderr: string }> {
    const captured = await this.runExecCapture(file, args, timeoutMs, env)
    if (captured.error) throw captured.error
    return { stdout: captured.stdout, stderr: captured.stderr }
  }

  private async runExecCapture(
    file: string,
    args: string[],
    timeoutMs: number,
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<{ stdout: string; stderr: string; error: AppError | null }> {
    const spawnEnv = env === process.env ? await this.spawnEnv() : env
    const spawn = wrapWindowsScript(file, args)
    try {
      const result = await execFileAsync(spawn.file, spawn.args, {
        timeout: timeoutMs,
        windowsHide: true,
        encoding: 'buffer',
        maxBuffer: 2 * 1024 * 1024,
        env: spawnEnv,
        windowsVerbatimArguments: spawn.verbatim,
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
