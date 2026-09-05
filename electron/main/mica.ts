import { nativeTheme, type BrowserWindow } from 'electron'
import os from 'node:os'
import { isMicaSupported, resolveMicaState, type MicaState } from '../../shared/mica'

export const WINDOW_BACKGROUND_DARK = '#0a0a0a'
export const WINDOW_BACKGROUND_LIGHT = '#ffffff'
export const MICA_WINDOW_BACKGROUND = '#00000000'

export function currentMicaSupport(): boolean {
  return isMicaSupported(os.release(), process.platform)
}

export function currentMicaState(preference: boolean): MicaState {
  return resolveMicaState(currentMicaSupport(), preference)
}

export function solidWindowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? WINDOW_BACKGROUND_DARK : WINDOW_BACKGROUND_LIGHT
}

export function applyWindowMica(win: BrowserWindow, enabled: boolean): void {
  if (win.isDestroyed()) return
  const useMica = currentMicaSupport() && enabled
  win.setBackgroundColor(useMica ? MICA_WINDOW_BACKGROUND : solidWindowBackground())
  if (typeof win.setBackgroundMaterial !== 'function') return
  win.setBackgroundMaterial(useMica ? 'mica' : 'none')
}
