import { nativeTheme, type BrowserWindow } from 'electron'
import os from 'node:os'
import { isMicaSupported, resolveMicaState, type MicaState } from '../../shared/mica'
import {
  titleBarOverlayAppearance,
  WINDOW_BACKGROUND_DARK,
  WINDOW_BACKGROUND_LIGHT,
} from './window-chrome'

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

function applyWindowMica(win: BrowserWindow, enabled: boolean): void {
  if (win.isDestroyed()) return
  const useMica = currentMicaSupport() && enabled
  win.setBackgroundColor(useMica ? MICA_WINDOW_BACKGROUND : solidWindowBackground())
  if (typeof win.setBackgroundMaterial !== 'function') return
  win.setBackgroundMaterial(useMica ? 'mica' : 'none')
}

function applyTitleBarOverlay(win: BrowserWindow, enabled: boolean): void {
  if (process.platform !== 'win32' || win.isDestroyed()) return
  if (typeof win.setTitleBarOverlay !== 'function') return
  win.setTitleBarOverlay(
    titleBarOverlayAppearance(nativeTheme.shouldUseDarkColors, currentMicaSupport() && enabled),
  )
}

export function applyWindowAppearance(win: BrowserWindow, micaEnabled: boolean): void {
  applyWindowMica(win, micaEnabled)
  applyTitleBarOverlay(win, micaEnabled)
}
