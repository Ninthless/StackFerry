import { AppError } from '../../../shared/app-error'
import type { CliToolId } from '../../../shared/cli-tools'

export const VERSION_TIMEOUT_MS = 8_000
export const INSTALL_TIMEOUT_MS = 5 * 60_000
export const UNINSTALL_TIMEOUT_MS = 2 * 60_000

export const CLI_NPM_PACKAGES: Partial<Record<CliToolId, string>> = {
  codex: '@openai/codex',
  'claude-code': '@anthropic-ai/claude-code',
  'grok-build': '@xai-official/grok',
}

export const CLI_WINGET_IDS: Partial<Record<CliToolId, string>> = {
  codex: 'OpenAI.Codex',
  'claude-code': 'Anthropic.ClaudeCode',
  'grok-build': 'xAI.GrokBuild',
}

export const CLI_BREW_CASKS: Partial<Record<CliToolId, string>> = {
  codex: 'codex',
  'claude-code': 'claude-code',
}

export const CLI_INSTALL_URLS: Record<CliToolId, { win32: string; posix: string }> = {
  codex: {
    win32: 'https://chatgpt.com/codex/install.ps1',
    posix: 'https://chatgpt.com/codex/install.sh',
  },
  'claude-code': {
    win32: 'https://claude.ai/install.ps1',
    posix: 'https://claude.ai/install.sh',
  },
  'grok-build': {
    win32: 'https://x.ai/cli/install.ps1',
    posix: 'https://x.ai/cli/install.sh',
  },
}

export function requireCliPackage(map: Partial<Record<CliToolId, string>>, id: CliToolId): string {
  const value = map[id]
  if (!value) throw new AppError('cli_method_unsupported')
  return value
}

// Homebrew cask 只在 macOS 上存在；Linuxbrew 没有等价的 cask 安装面。
export function requireBrewCask(id: CliToolId, platform: NodeJS.Platform): string {
  if (platform !== 'darwin') throw new AppError('cli_method_unsupported')
  return requireCliPackage(CLI_BREW_CASKS, id)
}

export type PackageManager = 'npm' | 'homebrew' | 'winget'

export type ToolName = 'npm' | 'brew' | 'winget' | 'powershell' | 'sh'

export function nativeInstallArgs(
  id: CliToolId,
  platform: NodeJS.Platform,
): { tool: 'powershell' | 'sh'; args: string[]; timeoutMs: number } {
  if (platform === 'win32') {
    const url = CLI_INSTALL_URLS[id].win32
    return {
      tool: 'powershell',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `irm ${url} | iex`],
      timeoutMs: INSTALL_TIMEOUT_MS,
    }
  }
  const url = CLI_INSTALL_URLS[id].posix
  return {
    tool: 'sh',
    args: ['-c', `curl -fsSL ${url} | sh`],
    timeoutMs: INSTALL_TIMEOUT_MS,
  }
}

export function packageManagerArgs(
  id: CliToolId,
  method: PackageManager,
  action: 'update' | 'uninstall',
  platform: NodeJS.Platform = process.platform,
): { tool: 'npm' | 'brew' | 'winget'; args: string[]; timeoutMs: number } {
  const timeoutMs = action === 'uninstall' ? UNINSTALL_TIMEOUT_MS : INSTALL_TIMEOUT_MS
  if (method === 'npm') {
    const pkg = requireCliPackage(CLI_NPM_PACKAGES, id)
    return {
      tool: 'npm',
      args: action === 'update' ? ['install', '-g', `${pkg}@latest`] : ['uninstall', '-g', pkg],
      timeoutMs,
    }
  }
  if (method === 'homebrew') {
    const cask = requireBrewCask(id, platform)
    return {
      tool: 'brew',
      args: action === 'update' ? ['upgrade', '--cask', cask] : ['uninstall', '--cask', cask],
      timeoutMs,
    }
  }
  const wingetId = requireCliPackage(CLI_WINGET_IDS, id)
  if (action === 'update') {
    return {
      tool: 'winget',
      args: [
        'upgrade',
        '--id',
        wingetId,
        '--accept-package-agreements',
        '--accept-source-agreements',
        '--disable-interactivity',
      ],
      timeoutMs,
    }
  }
  return {
    tool: 'winget',
    args: ['uninstall', '--id', wingetId, '--accept-source-agreements', '--disable-interactivity'],
    timeoutMs,
  }
}
