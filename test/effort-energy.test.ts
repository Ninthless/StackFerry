import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EFFORT_TONES, effortTone, effortTrack, energyIntensity } from '../src/features/clis/effort-tone'

const shaders = readFileSync(new URL('../src/features/clis/effort-energy-shaders.ts', import.meta.url), 'utf8')
const energy = readFileSync(new URL('../src/features/clis/effort-energy.tsx', import.meta.url), 'utf8')
const scale = readFileSync(new URL('../src/features/clis/effort-scale.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

describe('dsh-reasoning-slider Energy port', () => {
  it('keeps the original cellular simulation geometry', () => {
    expect(shaders).toMatch(/vec2\(72\.0,\s*6\.0\)/)
    expect(shaders).toMatch(/progressAge=max\(u_elapsed-randomValue\*1\.2,0\.0\)/)
    expect(shaders).toMatch(/feedbackRetention=mix\(0\.18,0\.90,smoothstep\(0\.90,1\.0,u_ratio\)\)/)
    expect(shaders).toMatch(/travelPixels=progressAge\*210\.0\*cellVelocity/)
  })

  it('composites dark mode as an opaque mapped field', () => {
    expect(shaders).toMatch(/lightAlpha=smoothstep\(0\.010,0\.36,lightPeak\)\*0\.82/)
    expect(shaders).toMatch(/outputColor=u_light>0\.5\?vec4\(lightMapped,lightAlpha\):vec4\(mapped,1\.0\)/)
    expect(shaders).not.toMatch(/darkAlpha/)
  })

  it('feeds the shader the raw 0-1 ratio across the track', () => {
    expect(energy).toMatch(/gl\.uniform1f\(sim\.ratio, state\.ratio\)/)
    expect(energy).not.toMatch(/paddedEnergyRatio/)
  })

  it('only energizes while dragging, settling, or at the maximum stop', () => {
    expect(scale).toMatch(/progress > 0 && \(dragging \|\| settling \|\| progress >= 0\.9995\)/)
    expect(scale).toMatch(/active=\{energized\}/)
    expect(scale).toMatch(/SETTLE_MS = 620/)
    expect(scale).toMatch(/SETTLE_PEAK_MS = 1840/)
  })

  it('uses the original 28px track and 27px thumb geometry', () => {
    expect(scale).toMatch(/h-\[28px\]/)
    expect(scale).toMatch(/rounded-\[9px\]/)
    expect(scale).toMatch(/THUMB_INSET = 14/)
    expect(css).toMatch(/width:\s*27px/)
    expect(css).toMatch(/height:\s*27px/)
    expect(css).toMatch(/border-radius:\s*9px/)
  })

  it('maps intensity through the original piecewise stops', () => {
    expect(energyIntensity(0)).toBe(0)
    expect(energyIntensity(1 / 3)).toBeCloseTo(0.24)
    expect(energyIntensity(2 / 3)).toBeCloseTo(0.58)
    expect(energyIntensity(1)).toBe(1)
  })

  it('gives each CLI a distinct light/dark fire and track pair', () => {
    const hex = /^#[0-9a-f]{6}$/
    const mains = new Set<string>()
    for (const id of ['codex', 'claude', 'grok'] as const) {
      const light = EFFORT_TONES[id].light
      const dark = EFFORT_TONES[id].dark
      expect(light.main).toMatch(hex)
      expect(light.base).toMatch(hex)
      expect(dark.main).toMatch(hex)
      expect(dark.base).toMatch(hex)
      expect(effortTone(id, false)).toBe(light.main)
      expect(effortTone(id, true)).toBe(dark.main)
      expect(effortTrack(id, false)).toBe(light.base)
      expect(effortTrack(id, true)).toBe(dark.base)
      mains.add(light.main)
      mains.add(dark.main)
    }
    expect(mains.size).toBe(6)
  })
})
