import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { trafficLightLibraryPath } from '../electron/main/traffic-lights'
import {
  MAC_TRAFFIC_LIGHT_GAP,
  titleBarDoubleClickAction,
  windowChromeOptions,
} from '../electron/main/window-chrome'

describe('windowChromeOptions', () => {
  it('uses inset traffic lights on macOS', () => {
    expect(windowChromeOptions('darwin')).toEqual({
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 6, y: 10 },
      autoHideMenuBar: false,
    })
  })

  it('keeps Windows and Linux caption buttons in the page', () => {
    expect(windowChromeOptions('win32')).toEqual({
      titleBarStyle: 'hidden',
      autoHideMenuBar: true,
    })
    expect(windowChromeOptions('linux')).toEqual({
      titleBarStyle: 'hidden',
      autoHideMenuBar: true,
    })
    expect(windowChromeOptions('win32')).not.toHaveProperty('titleBarOverlay')
    expect(windowChromeOptions('linux')).not.toHaveProperty('titleBarOverlay')
  })
})

describe('traffic light gap', () => {
  it('uses a tighter gap than the system pitch and resolves the helper library', () => {
    expect(MAC_TRAFFIC_LIGHT_GAP).toBe(4)
    expect(
      trafficLightLibraryPath({
        packaged: false,
        appRoot: '/app',
        resourcesPath: '/resources',
      }),
    ).toBe(path.join('/app', 'native/macos/traffic-lights.dylib'))
    expect(
      trafficLightLibraryPath({
        packaged: true,
        appRoot: '/app',
        resourcesPath: '/resources',
      }),
    ).toBe(path.join('/resources', 'traffic-lights.dylib'))
  })
})

describe('titleBarDoubleClickAction', () => {
  it('follows the macOS title-bar preference', () => {
    expect(titleBarDoubleClickAction('darwin', 'None')).toBe('none')
    expect(titleBarDoubleClickAction('darwin', 'Minimize')).toBe('minimize')
    expect(titleBarDoubleClickAction('darwin', 'Maximize')).toBe('toggleMaximize')
  })

  it('toggles maximize on Windows and Linux', () => {
    expect(titleBarDoubleClickAction('win32')).toBe('toggleMaximize')
    expect(titleBarDoubleClickAction('linux')).toBe('toggleMaximize')
  })
})
