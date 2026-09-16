import { describe, expect, it } from 'vitest'
import {
  MICA_TITLEBAR_OVERLAY_COLOR,
  TITLEBAR_OVERLAY_HEIGHT,
  WINDOW_BACKGROUND_DARK,
  WINDOW_BACKGROUND_LIGHT,
  titleBarDoubleClickAction,
  titleBarOverlayAppearance,
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

  it('ignores overlay appearance on macOS', () => {
    expect(windowChromeOptions('darwin', titleBarOverlayAppearance(true, false))).toEqual(
      windowChromeOptions('darwin'),
    )
  })

  it('uses a hidden title bar with native overlay controls on Linux', () => {
    expect(windowChromeOptions('linux')).toEqual({
      titleBarStyle: 'hidden',
      titleBarOverlay: { height: TITLEBAR_OVERLAY_HEIGHT },
      autoHideMenuBar: true,
    })
  })

  it('keeps Linux overlay colors on the system default', () => {
    expect(windowChromeOptions('linux', titleBarOverlayAppearance(true, false))).toEqual({
      titleBarStyle: 'hidden',
      titleBarOverlay: { height: TITLEBAR_OVERLAY_HEIGHT },
      autoHideMenuBar: true,
    })
  })

  it('uses a hidden title bar with native overlay controls on Windows', () => {
    expect(windowChromeOptions('win32')).toEqual({
      titleBarStyle: 'hidden',
      titleBarOverlay: { height: TITLEBAR_OVERLAY_HEIGHT },
      autoHideMenuBar: true,
    })
  })

  it('applies overlay colors on Windows when provided', () => {
    const overlay = titleBarOverlayAppearance(true, false)
    expect(windowChromeOptions('win32', overlay)).toEqual({
      titleBarStyle: 'hidden',
      titleBarOverlay: overlay,
      autoHideMenuBar: true,
    })
  })
})

describe('titleBarOverlayAppearance', () => {
  it('matches the solid window background in dark and light', () => {
    expect(titleBarOverlayAppearance(true, false)).toEqual({
      height: TITLEBAR_OVERLAY_HEIGHT,
      color: WINDOW_BACKGROUND_DARK,
      symbolColor: WINDOW_BACKGROUND_LIGHT,
    })
    expect(titleBarOverlayAppearance(false, false)).toEqual({
      height: TITLEBAR_OVERLAY_HEIGHT,
      color: WINDOW_BACKGROUND_LIGHT,
      symbolColor: WINDOW_BACKGROUND_DARK,
    })
  })

  it('uses near-transparent overlay color when mica is on', () => {
    expect(titleBarOverlayAppearance(true, true)).toEqual({
      height: TITLEBAR_OVERLAY_HEIGHT,
      color: MICA_TITLEBAR_OVERLAY_COLOR,
      symbolColor: WINDOW_BACKGROUND_LIGHT,
    })
    expect(titleBarOverlayAppearance(false, true)).toEqual({
      height: TITLEBAR_OVERLAY_HEIGHT,
      color: MICA_TITLEBAR_OVERLAY_COLOR,
      symbolColor: WINDOW_BACKGROUND_DARK,
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
