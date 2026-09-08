import { describe, expect, it } from 'vitest'
import { EFFORT_EMBER_PAD, paddedEnergyRatio } from '../src/features/clis/effort-energy'

describe('paddedEnergyRatio', () => {
  it('keeps the fire front on the track when the canvas bleeds right', () => {
    const canvasWidth = 100 + EFFORT_EMBER_PAD.right
    expect(paddedEnergyRatio(1, canvasWidth)).toBeCloseTo(100 / canvasWidth)
    expect(paddedEnergyRatio(0.5, canvasWidth)).toBeCloseTo(50 / canvasWidth)
    expect(paddedEnergyRatio(0, canvasWidth)).toBe(0)
  })

  it('returns the raw progress when the canvas has no usable track', () => {
    expect(paddedEnergyRatio(0.4, 0)).toBe(0.4)
    expect(paddedEnergyRatio(0.4, EFFORT_EMBER_PAD.right)).toBe(0.4)
  })
})
