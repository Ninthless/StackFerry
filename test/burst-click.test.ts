import { describe, expect, it } from 'vitest'
import { registerBurstClick } from '../src/features/shell/burst-click'

const options = { target: 7, windowMs: 1000 }

describe('registerBurstClick', () => {
  it('opens after seven clicks inside the window', () => {
    let state = { count: 0, lastAt: 0 }
    for (let index = 1; index <= 6; index += 1) {
      const next = registerBurstClick(state, index * 100, options)
      expect(next.fired).toBe(false)
      state = { count: next.count, lastAt: next.lastAt }
    }
    const opened = registerBurstClick(state, 700, options)
    expect(opened.fired).toBe(true)
    expect(opened.count).toBe(0)
  })

  it('resets when a click arrives after the window', () => {
    let state = { count: 0, lastAt: 0 }
    state = registerBurstClick(state, 0, options)
    state = registerBurstClick(state, 200, options)
    const next = registerBurstClick(state, 1500, options)
    expect(next.fired).toBe(false)
    expect(next.count).toBe(1)
  })
})
