export type WindowChromeOptions = {
  frame?: false
  titleBarStyle?: 'hidden' | 'hiddenInset'
  titleBarOverlay?: true | { height: number; color?: string; symbolColor?: string }
  trafficLightPosition?: { x: number; y: number }
  autoHideMenuBar: boolean
}

export type TitleBarDoubleClickAction = 'none' | 'minimize' | 'toggleMaximize'

export type TitleBarOverlayAppearance = {
  height: number
  color: string
  symbolColor: string
}

export const MAC_TRAFFIC_LIGHT = { x: 16, y: 12 } as const
export const TITLEBAR_OVERLAY_HEIGHT = 40
export const WINDOW_BACKGROUND_DARK = '#0a0a0a'
export const WINDOW_BACKGROUND_LIGHT = '#ffffff'
export const MICA_TITLEBAR_OVERLAY_COLOR = 'rgba(1,0,0,0)'

export function titleBarOverlayAppearance(
  dark: boolean,
  mica: boolean,
): TitleBarOverlayAppearance {
  return {
    height: TITLEBAR_OVERLAY_HEIGHT,
    color: mica ? MICA_TITLEBAR_OVERLAY_COLOR : dark ? WINDOW_BACKGROUND_DARK : WINDOW_BACKGROUND_LIGHT,
    symbolColor: dark ? WINDOW_BACKGROUND_LIGHT : WINDOW_BACKGROUND_DARK,
  }
}

export function windowChromeOptions(
  platform: NodeJS.Platform,
  overlay?: TitleBarOverlayAppearance,
): WindowChromeOptions {
  if (platform === 'darwin') {
    return {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { ...MAC_TRAFFIC_LIGHT },
      autoHideMenuBar: false,
    }
  }
  if (platform === 'linux') {
    return {
      titleBarStyle: 'hidden',
      titleBarOverlay: { height: TITLEBAR_OVERLAY_HEIGHT },
      autoHideMenuBar: true,
    }
  }
  return {
    titleBarStyle: 'hidden',
    titleBarOverlay: overlay ?? { height: TITLEBAR_OVERLAY_HEIGHT },
    autoHideMenuBar: true,
  }
}

export function titleBarDoubleClickAction(
  platform: NodeJS.Platform,
  appleAction = '',
): TitleBarDoubleClickAction {
  if (platform === 'darwin') {
    if (appleAction === 'None') return 'none'
    if (appleAction === 'Minimize') return 'minimize'
  }
  return 'toggleMaximize'
}
