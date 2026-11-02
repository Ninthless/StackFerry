export type WindowChromeOptions = {
  frame?: false
  titleBarStyle?: 'hidden' | 'hiddenInset'
  trafficLightPosition?: { x: number; y: number }
  autoHideMenuBar: boolean
}

export type TitleBarDoubleClickAction = 'none' | 'minimize' | 'toggleMaximize'

export const MAC_TRAFFIC_LIGHT = { x: 6, y: 10 } as const
export const MAC_TRAFFIC_LIGHT_GAP = 4
export const WINDOW_BACKGROUND_DARK = '#0a0a0a'
export const WINDOW_BACKGROUND_LIGHT = '#ffffff'

export function windowChromeOptions(platform: NodeJS.Platform): WindowChromeOptions {
  if (platform === 'darwin') {
    return {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { ...MAC_TRAFFIC_LIGHT },
      autoHideMenuBar: false,
    }
  }
  return {
    titleBarStyle: 'hidden',
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
