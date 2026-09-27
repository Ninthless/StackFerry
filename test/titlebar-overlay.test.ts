import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const titlebar = readFileSync(new URL('../src/features/shell/app-titlebar.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const preload = readFileSync(new URL('../electron/preload/index.ts', import.meta.url), 'utf8')

describe('in-page window controls', () => {
  it('renders caption buttons in the document instead of a native overlay', () => {
    expect(titlebar).toContain('<WindowControls />')
    expect(titlebar).not.toContain('titlebar-overlay-safe')
    expect(titlebar).not.toContain('usesWindowControlsOverlay')
    expect(css).not.toContain('titlebar-overlay-safe')
    expect(preload).toContain("showWindowControls: process.platform !== 'darwin'")
    expect(preload).not.toContain('usesWindowControlsOverlay')
  })
})
