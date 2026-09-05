export const MICA_MIN_BUILD = 22621

export type MicaState = {
  supported: boolean
  enabled: boolean
}

export function windowsBuildNumber(
  release: string,
  platform: string = 'win32',
): number | null {
  if (platform !== 'win32') return null
  const build = Number(release.split('.')[2])
  return Number.isInteger(build) ? build : null
}

export function isMicaSupported(
  release: string,
  platform: string,
): boolean {
  const build = windowsBuildNumber(release, platform)
  return build != null && build >= MICA_MIN_BUILD
}

export function resolveMicaState(supported: boolean, preference: boolean): MicaState {
  return {
    supported,
    enabled: supported && preference,
  }
}

export function windowUsesMicaSurface(state: MicaState): boolean {
  return state.enabled
}
