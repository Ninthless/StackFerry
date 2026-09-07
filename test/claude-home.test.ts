import { mkdir, mkdtemp } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { desktopAppConfigPath, listWindowsMsixClaudeLibraries, resolveClaudeDesktopLibraries, resolveClaudeDesktopLibrary, resolveClaudeHome } from '../electron/main/claude/home'

describe('resolveClaudeHome', () => {
  it('uses CLAUDE_CONFIG_DIR when set', () => {
    expect(resolveClaudeHome({ CLAUDE_CONFIG_DIR: 'D:\\tmp\\claude' }, () => 'C:\\Users\\demo')).toBe(
      'D:\\tmp\\claude',
    )
  })

  it('falls back to the user home .claude directory', () => {
    const home = os.platform() === 'win32' ? 'C:\\Users\\demo' : '/home/demo'
    expect(resolveClaudeHome({}, () => home)).toBe(path.join(home, '.claude'))
  })
})

describe('resolveClaudeDesktopLibrary', () => {
  it('uses LOCALAPPDATA on Windows', () => {
    expect(
      resolveClaudeDesktopLibrary(
        { LOCALAPPDATA: 'C:\\Users\\demo\\AppData\\Local' },
        () => 'C:\\Users\\demo',
        'win32',
      ),
    ).toBe(path.join('C:\\Users\\demo\\AppData\\Local', 'Claude-3p', 'configLibrary'))
  })

  it('uses Application Support on macOS', () => {
    expect(resolveClaudeDesktopLibrary({}, () => '/Users/demo', 'darwin')).toBe(
      path.join('/Users/demo', 'Library', 'Application Support', 'Claude-3p', 'configLibrary'),
    )
  })

  it('uses XDG_CONFIG_HOME on Linux', () => {
    expect(
      resolveClaudeDesktopLibrary({ XDG_CONFIG_HOME: '/home/demo/.config' }, () => '/home/demo', 'linux'),
    ).toBe(path.join('/home/demo/.config', 'Claude-3p', 'configLibrary'))
  })
})

describe('resolveClaudeDesktopLibraries', () => {
  it('keeps a single library on macOS', () => {
    expect(resolveClaudeDesktopLibraries({}, () => '/Users/demo', 'darwin', () => ['ignored'])).toEqual([
      path.join('/Users/demo', 'Library', 'Application Support', 'Claude-3p', 'configLibrary'),
    ])
  })

  it('adds MSIX LocalCache Claude-3p libraries on Windows', () => {
    const local = 'C:\\Users\\demo\\AppData\\Local'
    const msixLocal = path.join(
      local,
      'Packages',
      'Claude_pzs8sxrjxfjjc',
      'LocalCache',
      'Local',
      'Claude-3p',
      'configLibrary',
    )
    const msixRoaming = path.join(
      local,
      'Packages',
      'Claude_pzs8sxrjxfjjc',
      'LocalCache',
      'Roaming',
      'Claude-3p',
      'configLibrary',
    )
    expect(
      resolveClaudeDesktopLibraries({ LOCALAPPDATA: local }, () => 'C:\\Users\\demo', 'win32', () => [
        msixLocal,
        msixRoaming,
        msixLocal,
      ]),
    ).toEqual([path.join(local, 'Claude-3p', 'configLibrary'), msixLocal, msixRoaming])
  })
})

describe('listWindowsMsixClaudeLibraries', () => {
  it('returns Local and Roaming libraries for Claude_* packages even if Claude-3p is missing', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'stackferry-msix-'))
    await mkdir(path.join(root, 'Packages', 'Claude_pzs8sxrjxfjjc', 'LocalCache'), { recursive: true })
    await mkdir(path.join(root, 'Packages', 'OtherApp_abc'), { recursive: true })
    expect(listWindowsMsixClaudeLibraries(root)).toEqual([
      path.join(root, 'Packages', 'Claude_pzs8sxrjxfjjc', 'LocalCache', 'Local', 'Claude-3p', 'configLibrary'),
      path.join(
        root,
        'Packages',
        'Claude_pzs8sxrjxfjjc',
        'LocalCache',
        'Roaming',
        'Claude-3p',
        'configLibrary',
      ),
    ])
  })

  it('returns nothing when Packages is absent', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'stackferry-nomsix-'))
    expect(listWindowsMsixClaudeLibraries(root)).toEqual([])
  })
})

describe('desktopAppConfigPath', () => {
  it('sits next to configLibrary, not inside it', () => {
    const library = path.join('app', 'Claude-3p', 'configLibrary')
    expect(desktopAppConfigPath(library)).toBe(
      path.join('app', 'Claude-3p', 'claude_desktop_config.json'),
    )
  })
})
