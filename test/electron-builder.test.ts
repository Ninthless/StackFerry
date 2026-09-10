import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

type LinuxTarget = { target: string; arch: string[] }

describe('linux packages', () => {
  it('ships AppImage and deb for x64 and arm64', () => {
    const config = JSON.parse(
      readFileSync(path.join(process.cwd(), 'electron-builder.json'), 'utf8'),
    ) as { linux: { target: LinuxTarget[] }; deb: { depends: string[] } }
    const byName = Object.fromEntries(config.linux.target.map((item) => [item.target, item.arch]))
    expect(byName.AppImage).toEqual(['x64', 'arm64'])
    expect(byName.deb).toEqual(['x64', 'arm64'])
    expect(config.deb.depends.some((item) => item.includes('libgtk-3-0t64'))).toBe(true)
  })
})
