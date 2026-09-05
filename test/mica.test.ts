import { describe, expect, it } from 'vitest'
import {
  isMicaSupported,
  resolveMicaState,
  windowUsesMicaSurface,
  windowsBuildNumber,
} from '../shared/mica'

describe('mica support', () => {
  it('reads the Windows build number', () => {
    expect(windowsBuildNumber('10.0.26200', 'win32')).toBe(26200)
    expect(windowsBuildNumber('10.0.22621', 'win32')).toBe(22621)
    expect(windowsBuildNumber('10.0.22000', 'win32')).toBe(22000)
    expect(windowsBuildNumber('10.0.26200', 'darwin')).toBeNull()
    expect(windowsBuildNumber('bad', 'win32')).toBeNull()
  })

  it('requires Windows 11 22H2 or later', () => {
    expect(isMicaSupported('10.0.26200', 'win32')).toBe(true)
    expect(isMicaSupported('10.0.22621', 'win32')).toBe(true)
    expect(isMicaSupported('10.0.22000', 'win32')).toBe(false)
    expect(isMicaSupported('10.0.19045', 'win32')).toBe(false)
    expect(isMicaSupported('10.0.26200', 'linux')).toBe(false)
    expect(isMicaSupported('24.6.0', 'darwin')).toBe(false)
  })

  it('enables mica only when supported and preferred', () => {
    expect(resolveMicaState(true, true)).toEqual({ supported: true, enabled: true })
    expect(resolveMicaState(true, false)).toEqual({ supported: true, enabled: false })
    expect(resolveMicaState(false, true)).toEqual({ supported: false, enabled: false })
  })

  it('uses a zero-alpha surface only while mica is enabled', () => {
    expect(windowUsesMicaSurface(resolveMicaState(true, true))).toBe(true)
    expect(windowUsesMicaSurface(resolveMicaState(true, false))).toBe(false)
    expect(windowUsesMicaSurface(resolveMicaState(false, true))).toBe(false)
  })
})
