import { describe, expect, it } from 'vitest'
import {
  titleBarDoubleClickAction,
  windowChromeOptions,
} from '../electron/main/window-chrome'

describe('windowChromeOptions', () => {
  it('uses inset traffic lights on macOS', () => {
    expect(windowChromeOptions('darwin')).toEqual({
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 12 },
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
