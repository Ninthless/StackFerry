import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { grokManagedConfigPaths, resolveGrokHome } from '../electron/main/grok/home'

describe('resolveGrokHome', () => {
  it('uses GROK_HOME when set', () => {
    expect(resolveGrokHome({ GROK_HOME: '/opt/grok' }, () => '/home/demo')).toBe('/opt/grok')
  })

  it('falls back to ~/.grok', () => {
    expect(resolveGrokHome({}, () => '/home/demo')).toBe(path.join('/home/demo', '.grok'))
  })
})

describe('grokManagedConfigPaths', () => {
  it('uses ProgramData on Windows instead of /etc', () => {
    expect(
      grokManagedConfigPaths('C:\\Users\\demo\\.grok', 'win32', { ProgramData: 'C:\\ProgramData' }),
    ).toEqual([
      path.join('C:\\Users\\demo\\.grok', 'managed_config.toml'),
      path.join('C:\\Users\\demo\\.grok', 'requirements.toml'),
      path.join('C:\\ProgramData', 'grok', 'managed_config.toml'),
      path.join('C:\\ProgramData', 'grok', 'requirements.toml'),
    ])
  })

  it('keeps /etc on POSIX', () => {
    expect(grokManagedConfigPaths('/home/demo/.grok', 'linux')).toEqual([
      path.join('/home/demo/.grok', 'managed_config.toml'),
      path.join('/home/demo/.grok', 'requirements.toml'),
      path.join('/etc', 'grok', 'managed_config.toml'),
      path.join('/etc', 'grok', 'requirements.toml'),
    ])
  })
})
