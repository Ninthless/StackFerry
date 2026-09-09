import { describe, expect, it } from 'vitest'
import { titleBarDoubleClickAction, windowChromeOptions } from '../electron/main/window-chrome'

describe('windowChromeOptions', () => {
  it('uses inset traffic lights on macOS', () => {
    expect(windowChromeOptions('darwin')).toEqual({
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 12 },
      autoHideMenuBar: false,
    })
  })

  it('uses a frameless window on Linux', () => {
    expect(windowChromeOptions('linux')).toEqual({
      frame: false,
      autoHideMenuBar: true,
    })
  })

  it('hides the native caption on Windows', () => {
    expect(windowChromeOptions('win32')).toEqual({
      titleBarStyle: 'hidden',
      autoHideMenuBar: true,
    })
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
