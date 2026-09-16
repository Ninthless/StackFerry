import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

type BuilderTarget = { target: string; arch: string[] }

type BuilderConfig = {
  protocols: { name: string; schemes: string[] }
  win: { target: BuilderTarget[]; artifactName: string }
  mac: { artifactName: string }
  linux: {
    icon: string
    target: BuilderTarget[]
    artifactName: string
    desktop: { entry: { MimeType: string } }
  }
  deb: { depends: string[]; afterInstall?: string; afterRemove?: string }
}

describe('windows packages', () => {
  it('ships NSIS for x64 and arm64 with arch in the artifact name', () => {
    const config = JSON.parse(
      readFileSync(path.join(process.cwd(), 'electron-builder.json'), 'utf8'),
    ) as BuilderConfig
    expect(config.win.target).toEqual([{ target: 'nsis', arch: ['x64', 'arm64'] }])
    expect(config.win.artifactName).toBe('${productName}-${version}-${arch}-Setup.${ext}')
  })
})

describe('linux packages', () => {
  it('ships AppImage and deb for x64 and arm64', () => {
    const config = JSON.parse(
      readFileSync(path.join(process.cwd(), 'electron-builder.json'), 'utf8'),
    ) as BuilderConfig
    const byName = Object.fromEntries(config.linux.target.map((item) => [item.target, item.arch]))
    expect(byName.AppImage).toEqual(['x64', 'arm64'])
    expect(byName.deb).toEqual(['x64', 'arm64'])
    expect(config.linux.artifactName).toBe('${productName}-${version}-${arch}.${ext}')
    expect(config.mac.artifactName).toBe('${productName}-${version}-${arch}.${ext}')
    expect(config.deb.depends.some((item) => item.includes('libgtk-3-0t64'))).toBe(true)
  })

  it('ships hicolor PNG sizes that GTK indexes, without replacing the default deb postinst', () => {
    const config = JSON.parse(
      readFileSync(path.join(process.cwd(), 'electron-builder.json'), 'utf8'),
    ) as BuilderConfig
    expect(config.linux.icon).toBe('build/icons')
    expect(config.deb.afterInstall).toBeUndefined()
    expect(config.deb.afterRemove).toBeUndefined()
    for (const size of [16, 32, 48, 64, 128, 256, 512]) {
      const file = path.join(process.cwd(), 'build/icons', `${size}x${size}.png`)
      const png = readFileSync(file)
      expect(png.readUInt32BE(16)).toBe(size)
      expect(png.readUInt32BE(20)).toBe(size)
    }
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
    expect(workflow).toContain('release/*/*-Setup.exe')
    expect(workflow).toContain('test -f release/*/latest.yml')
    expect(workflow).toContain('test -f release/*/latest-linux-arm64.yml')
    expect(workflow).toContain('release/*/*.blockmap')
    expect(workflow).not.toContain('test -f release/*/latest-arm64.yml')
    expect(workflow).not.toContain('release/**/*.yml')
    expect(workflow).not.toContain('release/**/*.exe')
    expect(workflow).not.toContain('release/*/*.exe')
  })

  it('runs tests on a Node that exposes node:sqlite without a flag', () => {
    const workflow = readFileSync(path.join(process.cwd(), '.github/workflows/release.yml'), 'utf8')
    const match = workflow.match(/runtime: node@(\d+)\.(\d+)\.(\d+)/)
    expect(match).not.toBeNull()
    const major = Number(match?.[1])
    const minor = Number(match?.[2])
    expect(major > 22 || (major === 22 && minor >= 13)).toBe(true)
  })
})
