import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveAppIconPath, resolveIconDir, resolveTrayIconPath } from '../electron/main/app-icon'

describe('resolveIconDir', () => {
  it('reads extraResources when packaged', () => {
    expect(
      resolveIconDir({
        appRoot: '/app',
        packaged: true,
        resourcesPath: '/app/resources',
      }),
    ).toBe(path.join('/app/resources', 'icons'))
  })

  it('reads public in development', () => {
    expect(
      resolveIconDir({
        appRoot: '/repo',
        packaged: false,
        resourcesPath: '/unused',
      }),
    ).toBe(path.join('/repo', 'public'))
  })
})

describe('platform icon files', () => {
  const dir = path.join('public')

  it('picks the window icon by platform', () => {
    expect(resolveAppIconPath(dir, 'win32')).toBe(path.join(dir, 'icon.ico'))
    expect(resolveAppIconPath(dir, 'darwin')).toBe(path.join(dir, 'icon.png'))
    expect(resolveAppIconPath(dir, 'linux')).toBe(path.join(dir, 'icon.png'))
  })

  it('picks the tray icon by platform', () => {
    expect(resolveTrayIconPath(dir, 'win32')).toBe(path.join(dir, 'icon.ico'))
    expect(resolveTrayIconPath(dir, 'darwin')).toBe(path.join(dir, 'tray-icon-Template.png'))
    expect(resolveTrayIconPath(dir, 'linux')).toBe(path.join(dir, 'tray-icon.png'))
  })
})
