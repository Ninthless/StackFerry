export type EffortToneId = "codex" | "claude" | "grok"

type EffortSwatch = {
  main: string
  base: string
}

export const EFFORT_TONES: Record<EffortToneId, { light: EffortSwatch; dark: EffortSwatch }> = {
  codex: {
    light: { main: "#0e7a68", base: "#eef2f1" },
    dark: { main: "#4ad4b8", base: "#0d1614" },
  },
  claude: {
    light: { main: "#c45a36", base: "#f4efec" },
    dark: { main: "#f0946c", base: "#191210" },
  },
  grok: {
    light: { main: "#7c43c7", base: "#f0eff2" },
    dark: { main: "#a857f7", base: "#111015" },
  },
}

export function effortTone(id: EffortToneId, dark: boolean): string {
  return dark ? EFFORT_TONES[id].dark.main : EFFORT_TONES[id].light.main
}

export function effortTrack(id: EffortToneId, dark: boolean): string {
  return dark ? EFFORT_TONES[id].dark.base : EFFORT_TONES[id].light.base
}

export function energyIntensity(ratio: number): number {
  const bounded = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0))
  const stops = [0, 0.24, 0.58, 1]
  const scaled = bounded * (stops.length - 1)
  const left = Math.min(stops.length - 2, Math.floor(scaled))
  const progress = scaled - left
  return (stops[left] ?? 0) + ((stops[left + 1] ?? 0) - (stops[left] ?? 0)) * progress
}
