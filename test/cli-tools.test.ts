import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AppError } from '../shared/app-error'
import { CLI_INSTALL_URLS, nativeInstallArgs, packageManagerArgs } from '../electron/main/cli-tools/commands'
import { classifyInstallMethod, parseCliVersion, parseWhereOutput } from '../electron/main/cli-tools/detect'
import {
  brewCaskOutdatedAvailable,
  cliVersionOutdated,
  grokNativeOutdated,
  grokNativeUpdateAvailable,
  npmLatestUrl,
  npmOutdatedAvailable,
  parseNpmLatestVersion,
  wingetUpgradeAvailable,
} from '../electron/main/cli-tools/outdated'
import {
  expandWindowsEnv,
  isProtectedConfigPath,
  knownSearchDirs,
  knownToolPaths,
  nativeUninstallTargets,
  parseRegPathQuery,
  reconstructSearchDirs,
  removePathEntry,
  wrapWindowsScript,
  type ConfigHomes,
  type PathContext,
} from '../electron/main/cli-tools/paths'

const win = process.platform === 'win32'
const home = win ? 'C:\\Users\\demo' : '/home/demo'
const localAppData = win ? path.join(home, 'AppData', 'Local') : path.join(home, '.local', 'share')
const appData = win ? path.join(home, 'AppData', 'Roaming') : path.join(home, '.config')

function demoPathContext(overrides: Partial<PathContext> = {}): PathContext {
  return {
    platform: process.platform,
    home,
    localAppData,
    appData,
    pathValue: win ? 'C:\\Windows\\System32' : '/usr/bin',
    extraDirs: [],
    systemRoot: 'C:\\Windows',
    ...overrides,
  }
}

function demoHomes(): ConfigHomes {
  return {
    home,
    codexHome: path.join(home, '.codex'),
    claudeHome: path.join(home, '.claude'),
    grokHome: path.join(home, '.grok'),
  }
}

describe('classifyInstallMethod', () => {
  it('detects Codex native, npm, winget, and unknown Windows layouts', () => {
    expect(
      classifyInstallMethod(path.join(localAppData, 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe'), { home }),
    ).toBe('native')
    expect(classifyInstallMethod(path.join(appData, 'npm', 'codex.cmd'), { home })).toBe('npm')
    expect(
      classifyInstallMethod(path.join(localAppData, 'Microsoft', 'WindowsApps', 'codex.exe'), { home }),
    ).toBe('winget')
    expect(classifyInstallMethod(path.join(home, 'bin', 'codex'), { home })).toBe('unknown')
  })

  it('detects Grok native layouts', () => {
    expect(classifyInstallMethod(path.join(home, '.grok', 'bin', 'grok'), { home })).toBe('native')
    expect(classifyInstallMethod(path.join(home, '.grok', 'bin', 'grok.exe'), { home })).toBe('native')
    const customHome = win ? 'D:\\grok-home' : '/opt/grok'
    expect(
      classifyInstallMethod(path.join(customHome, 'bin', 'grok'), { home, grokHome: customHome }),
    ).toBe('native')
  })

  it('detects Claude native and Homebrew layouts', () => {
    expect(classifyInstallMethod(path.join(home, '.local', 'bin', 'claude'), { home })).toBe('native')
    expect(classifyInstallMethod('/opt/homebrew/bin/claude', { home })).toBe('homebrew')
    expect(classifyInstallMethod('/usr/local/Caskroom/claude-code/latest/claude', { home })).toBe('homebrew')
  })
})

describe('reconstructSearchDirs', () => {
  it('puts known install locations before PATH entries', () => {
    const dirs = reconstructSearchDirs(demoPathContext())
    const known = path.join(home, '.local', 'bin')
    expect(dirs[0]).toBe(known)
    expect(dirs).toContain(path.join(home, '.grok', 'bin'))
    expect(dirs).toContain(win ? 'C:\\Windows\\System32' : '/usr/bin')
  })

  it('includes Homebrew on macOS and Linuxbrew on Linux', () => {
    const mac = knownSearchDirs(demoPathContext({ platform: 'darwin', home: '/Users/demo' }))
    expect(mac).toContain('/opt/homebrew/bin')
    expect(mac).toContain(path.join('/Users/demo', 'Library', 'pnpm'))
    const linux = knownSearchDirs(demoPathContext({ platform: 'linux', home: '/home/demo' }))
    expect(linux).toContain('/home/linuxbrew/.linuxbrew/bin')
    expect(linux).toContain('/snap/bin')
  })
})

describe('native uninstall targets', () => {
  it('never includes Codex, Claude, or Grok config roots', () => {
    const ctx = { ...demoPathContext(), ...demoHomes() }
    const homes = demoHomes()
    const targets = [
      ...nativeUninstallTargets('codex', ctx),
      ...nativeUninstallTargets('claude-code', ctx),
      ...nativeUninstallTargets('grok-build', ctx),
    ]
    expect(targets).not.toContain(homes.codexHome)
    expect(targets).not.toContain(homes.claudeHome)
    expect(targets).not.toContain(homes.grokHome)
    expect(targets).not.toContain(path.join(homes.codexHome, 'config.toml'))
    expect(targets).not.toContain(path.join(homes.claudeHome, 'settings.json'))
    expect(targets).not.toContain(path.join(homes.grokHome, 'config.toml'))
    expect(targets).not.toContain(path.join(home, '.claude.json'))
    expect(targets).toContain(path.join(homes.grokHome, 'bin', 'grok'))
    expect(targets).toContain(path.join(homes.grokHome, 'bin', 'grok.exe'))
    for (const target of targets) {
      expect(isProtectedConfigPath(target, homes)).toBe(false)
    }
  })

  it('protects config files even if they sit under Codex home', () => {
    const homes = demoHomes()
    expect(isProtectedConfigPath(homes.codexHome, homes)).toBe(true)
    expect(isProtectedConfigPath(path.join(homes.codexHome, 'config.toml'), homes)).toBe(true)
    expect(isProtectedConfigPath(path.join(homes.codexHome, 'packages', 'standalone'), homes)).toBe(false)
    expect(isProtectedConfigPath(path.join(homes.grokHome, 'config.toml'), homes)).toBe(true)
    expect(isProtectedConfigPath(path.join(homes.grokHome, 'bin', 'grok'), homes)).toBe(false)
  })
})

describe('PATH helpers', () => {
  it('parses a reg query Path value', () => {
    const stdout = [
      '',
      'HKEY_CURRENT_USER\\Environment',
      '    Path    REG_EXPAND_SZ    %USERPROFILE%\\.local\\bin;C:\\Windows',
    ].join('\n')
    expect(parseRegPathQuery(stdout)).toBe('%USERPROFILE%\\.local\\bin;C:\\Windows')
  })

  it('expands Windows environment tokens', () => {
    expect(expandWindowsEnv('%USERPROFILE%\\bin;%SystemRoot%', { USERPROFILE: 'C:\\Users\\demo', SystemRoot: 'C:\\Windows' })).toBe(
      'C:\\Users\\demo\\bin;C:\\Windows',
    )
  })

  it('removes only the matching PATH entry', () => {
    const bin = path.join(localAppData, 'Programs', 'OpenAI', 'Codex', 'bin')
    const result = removePathEntry(`C:\\Windows;${bin};C:\\Windows\\System32`, bin, ';')
    expect(result.removed).toBe(true)
    expect(result.next).toBe('C:\\Windows;C:\\Windows\\System32')
  })
})

describe('install commands', () => {
  it('uses the official native installer URLs', () => {
    expect(nativeInstallArgs('codex', 'win32').args.join(' ')).toContain(CLI_INSTALL_URLS.codex.win32)
    expect(nativeInstallArgs('claude-code', 'linux').args.join(' ')).toContain(CLI_INSTALL_URLS['claude-code'].posix)
    expect(nativeInstallArgs('grok-build', 'win32').args.join(' ')).toContain(CLI_INSTALL_URLS['grok-build'].win32)
    expect(nativeInstallArgs('grok-build', 'linux').args.join(' ')).toContain(CLI_INSTALL_URLS['grok-build'].posix)
  })

  it('updates npm packages with @latest rather than npm update -g', () => {
    expect(packageManagerArgs('codex', 'npm', 'update').args).toEqual(['install', '-g', '@openai/codex@latest'])
    expect(packageManagerArgs('claude-code', 'npm', 'uninstall').args).toEqual([
      'uninstall',
      '-g',
      '@anthropic-ai/claude-code',
    ])
    expect(packageManagerArgs('grok-build', 'npm', 'update').args).toEqual([
      'install',
      '-g',
      '@xai-official/grok@latest',
    ])
    expect(packageManagerArgs('grok-build', 'winget', 'update').args).toContain('xAI.GrokBuild')
    expect(() => packageManagerArgs('grok-build', 'homebrew', 'update')).toThrow(AppError)
  })
})

describe('parseCliVersion', () => {
  it('keeps the first line', () => {
    expect(parseCliVersion('2.1.211 (Claude Code)\nextra')).toBe('2.1.211 (Claude Code)')
    expect(parseCliVersion('   \n')).toBeNull()
  })
})

describe('winget lookup', () => {
  it('points at the WindowsApps alias path', () => {
    const ctx = demoPathContext({
      platform: 'win32',
      localAppData: 'C:\\Users\\demo\\AppData\\Local',
    })
    expect(knownToolPaths('winget', ctx)).toEqual([
      path.join(ctx.localAppData, 'Microsoft', 'WindowsApps', 'winget.exe'),
    ])
  })

  it('resolves Homebrew at Apple Silicon, Intel, and Linuxbrew paths', () => {
    expect(knownToolPaths('brew', demoPathContext())).toEqual([
      '/opt/homebrew/bin/brew',
      '/usr/local/bin/brew',
      '/home/linuxbrew/.linuxbrew/bin/brew',
    ])
  })

  it('runs winget and .cmd through cmd.exe instead of shell:true', () => {
    expect(wrapWindowsScript('winget', ['upgrade', '--id', 'OpenAI.Codex'], 'win32', 'cmd.exe')).toEqual({
      file: 'cmd.exe',
      args: ['/d', '/s', '/c', 'winget upgrade --id OpenAI.Codex'],
      verbatim: true,
    })
    expect(
      wrapWindowsScript(
        'C:\\Users\\demo\\AppData\\Local\\Microsoft\\WindowsApps\\winget.exe',
        ['upgrade', '--id', 'OpenAI.Codex'],
        'win32',
        'cmd.exe',
      ),
    ).toEqual({
      file: 'cmd.exe',
      args: ['/d', '/s', '/c', 'winget upgrade --id OpenAI.Codex'],
      verbatim: true,
    })
    expect(
      wrapWindowsScript('C:\\Users\\demo\\AppData\\Roaming\\npm\\codex.cmd', ['--version'], 'win32', 'cmd.exe'),
    ).toEqual({
      file: 'cmd.exe',
      args: ['/d', '/s', '/c', '"C:\\Users\\demo\\AppData\\Roaming\\npm\\codex.cmd" --version'],
      verbatim: true,
    })
  })
})

describe('parseWhereOutput', () => {
  it('skips INFO lines and returns the first path', () => {
    expect(parseWhereOutput('INFO: Could not find files\r\nC:\\Apps\\winget.exe\n')).toBe('C:\\Apps\\winget.exe')
    expect(parseWhereOutput('   \nINFO: none\n')).toBeNull()
  })
})

describe('outdated parsers', () => {
  it('treats winget --upgrade-available rows as updates', () => {
    const stdout = [
      'Name         Id                     Version  Available  Source',
      '--------------------------------------------------------------',
      'Claude Code  Anthropic.ClaudeCode   2.1.200  2.1.263    winget',
    ].join('\n')
    expect(wingetUpgradeAvailable(stdout, 'Anthropic.ClaudeCode')).toBe(true)
    expect(wingetUpgradeAvailable('No installed package found matching input criteria.', 'Anthropic.ClaudeCode')).toBe(
      false,
    )
  })

  it('reads npm outdated JSON and brew cask JSON', () => {
    expect(npmOutdatedAvailable('{"@openai/codex":{"current":"1.0.0","latest":"1.1.0"}}', '@openai/codex')).toBe(true)
    expect(npmOutdatedAvailable('{}', '@openai/codex')).toBe(false)
    expect(brewCaskOutdatedAvailable('{"formulae":[],"casks":[{"name":"claude-code"}]}', 'claude-code')).toBe(true)
    expect(brewCaskOutdatedAvailable('{"formulae":[],"casks":[]}', 'claude-code')).toBe(false)
  })

  it('parses grok update --check', () => {
    expect(grokNativeUpdateAvailable('Grok Build - v1.0.10 (latest: 1.0.13) [stable]\n')).toBe(true)
    expect(grokNativeUpdateAvailable('Grok Build - v1.0.13 (latest: 1.0.13) [stable]\n')).toBe(false)
    expect(grokNativeOutdated('Grok Build - v1.0.10 (latest: 1.0.13) [stable]\n')).toEqual({
      available: true,
      latestVersion: '1.0.13',
    })
  })

  it('compares installed CLI versions against npm latest metadata', () => {
    expect(npmLatestUrl('@openai/codex')).toBe('https://registry.npmjs.org/@openai%2Fcodex/latest')
    expect(parseNpmLatestVersion('{"version":"0.50.0"}')).toBe('0.50.0')
    expect(parseNpmLatestVersion('{')).toBeNull()
    expect(cliVersionOutdated('2.1.211 (Claude Code)', '2.1.263')).toBe(true)
    expect(cliVersionOutdated('v1.0.13', '1.0.13')).toBe(false)
    expect(cliVersionOutdated('1.0.10', '1.0.13')).toBe(true)
    expect(cliVersionOutdated(null, '1.0.13')).toBe(false)
  })
})
