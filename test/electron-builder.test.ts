import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

type LinuxTarget = { target: string; arch: string[] }

type BuilderConfig = {
  protocols: { name: string; schemes: string[] }
  linux: {
    target: LinuxTarget[]
    desktop: { entry: { MimeType: string } }
  }
  deb: { depends: string[] }
}

describe('linux packages', () => {
  it('ships AppImage and deb for x64 and arm64', () => {
    const config = JSON.parse(
      readFileSync(path.join(process.cwd(), 'electron-builder.json'), 'utf8'),
    ) as BuilderConfig
    const byName = Object.fromEntries(config.linux.target.map((item) => [item.target, item.arch]))
    expect(byName.AppImage).toEqual(['x64', 'arm64'])
    expect(byName.deb).toEqual(['x64', 'arm64'])
    expect(config.deb.depends.some((item) => item.includes('libgtk-3-0t64'))).toBe(true)
  })

  it('registers the stackferry import protocol', () => {
    const config = JSON.parse(
      readFileSync(path.join(process.cwd(), 'electron-builder.json'), 'utf8'),
    ) as BuilderConfig
    expect(config.protocols).toEqual({ name: 'StackFerry', schemes: ['stackferry'] })
    expect(config.linux.desktop.entry.MimeType).toContain('x-scheme-handler/stackferry')
  })
})

describe('release artifacts', () => {
  it('uploads only version-root installers and updater manifests', () => {
    const workflow = readFileSync(path.join(process.cwd(), '.github/workflows/release.yml'), 'utf8')
    expect(workflow).toContain('release/*/latest*.yml')
    expect(workflow).toContain('release/*/*.blockmap')
    expect(workflow).not.toContain('release/**/*.yml')
    expect(workflow).not.toContain('release/**/*.exe')
  })
})
