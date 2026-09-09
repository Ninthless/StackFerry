export type WindowChromeOptions = {
  frame?: false
  titleBarStyle?: 'hidden' | 'hiddenInset'
  trafficLightPosition?: { x: number; y: number }
  autoHideMenuBar: boolean
}

export type TitleBarDoubleClickAction = 'none' | 'minimize' | 'toggleMaximize'

export const MAC_TRAFFIC_LIGHT = { x: 16, y: 12 } as const

export function windowChromeOptions(platform: NodeJS.Platform): WindowChromeOptions {
  if (platform === 'darwin') {
    return {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { ...MAC_TRAFFIC_LIGHT },
      autoHideMenuBar: false,
    }
  }
  if (platform === 'linux') {
    return {
      frame: false,
      autoHideMenuBar: true,
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
