export const EFFORT_TONE = {
  light: { main: "#7c43c7", base: "#f0eff2" },
  dark: { main: "#a857f7", base: "#111015" },
} as const

export function effortTone(dark: boolean): string {
  return dark ? EFFORT_TONE.dark.main : EFFORT_TONE.light.main
}

export function effortTrack(dark: boolean): string {
  return dark ? EFFORT_TONE.dark.base : EFFORT_TONE.light.base
}

export function energyIntensity(ratio: number): number {
  const bounded = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0))
  const stops = [0, 0.24, 0.58, 1]
  const scaled = bounded * (stops.length - 1)
  const left = Math.min(stops.length - 2, Math.floor(scaled))
  const progress = scaled - left
  return (stops[left] ?? 0) + ((stops[left + 1] ?? 0) - (stops[left] ?? 0)) * progress
}
