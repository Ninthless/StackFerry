import path from 'node:path'

export function resolveIconDir(options: {
  appRoot: string
  packaged: boolean
  resourcesPath: string
}): string {
  if (options.packaged) return path.join(options.resourcesPath, 'icons')
  return path.join(options.appRoot, 'public')
}

export function resolveAppIconPath(iconDir: string, platform: NodeJS.Platform): string {
  return path.join(iconDir, platform === 'win32' ? 'icon.ico' : 'icon.png')
}

export function resolveTrayIconPath(iconDir: string, platform: NodeJS.Platform): string {
  if (platform === 'darwin') return path.join(iconDir, 'tray-icon-Template.png')
  if (platform === 'win32') return path.join(iconDir, 'icon.ico')
  return path.join(iconDir, 'tray-icon.png')
}
