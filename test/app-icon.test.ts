import { inflateSync } from 'node:zlib'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveAppIconPath, resolveDockIconPath, resolveIconDir, resolveTrayIconPath } from '../electron/main/app-icon'

describe('resolveIconDir', () => {
  it('reads extraResources when packaged', () => {
    expect(
      resolveIconDir({
        appRoot: '/app',
        packaged: true,
        resourcesPath: '/app/resources',
      }),
    ).toBe(path.join('/app/resources', 'icons'))
  })

  it('reads public in development', () => {
    expect(
      resolveIconDir({
        appRoot: '/repo',
        packaged: false,
        resourcesPath: '/unused',
      }),
    ).toBe(path.join('/repo', 'public'))
  })
})

describe('platform icon files', () => {
  const dir = path.join('public')

  it('picks the window icon by platform', () => {
    expect(resolveAppIconPath(dir, 'win32')).toBe(path.join(dir, 'icon.ico'))
    expect(resolveAppIconPath(dir, 'darwin')).toBe(path.join(dir, 'icon.png'))
    expect(resolveAppIconPath(dir, 'linux')).toBe(path.join(dir, 'icon.png'))
    expect(resolveDockIconPath(dir)).toBe(path.join(dir, 'icon-mac.png'))
  })

  it('picks the tray icon by platform', () => {
    expect(resolveTrayIconPath(dir, 'win32')).toBe(path.join(dir, 'icon.ico'))
    expect(resolveTrayIconPath(dir, 'darwin')).toBe(path.join(dir, 'tray-icon-Template.png'))
    expect(resolveTrayIconPath(dir, 'linux')).toBe(path.join(dir, 'tray-icon.png'))
  })
})

describe('mac dock artwork', () => {
  it('fills the canvas so the system mask is the only rounding', () => {
    const pixels = pngRgba(readFileSync(path.join(process.cwd(), 'public/icon-mac.png')))
    expect(pixels[3]).toBe(255)
    expect(pixels[pixels.length - 1]).toBe(255)
  })
})

function pngRgba(png: Buffer): Buffer {
  expect(png.readUInt32BE(16)).toBe(1024)
  expect(png.readUInt32BE(20)).toBe(1024)
  const idat: Buffer[] = []
  let offset = 8
  while (offset < png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.toString('ascii', offset + 4, offset + 8)
    if (type === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + length))
    if (type === 'IEND') break
    offset += 12 + length
  }
  const raw = inflateSync(Buffer.concat(idat))
  const width = 1024
  const stride = width * 4
  const pixels = Buffer.alloc(width * width * 4)
  let source = 0
  const previous = Buffer.alloc(stride)
  const current = Buffer.alloc(stride)
  for (let y = 0; y < width; y += 1) {
    const filter = raw[source]
    source += 1
    raw.copy(current, 0, source, source + stride)
    source += stride
    for (let index = 0; index < stride; index += 1) {
      const left = index >= 4 ? current[index - 4] : 0
      const up = previous[index]
      const upLeft = index >= 4 ? previous[index - 4] : 0
      let value = current[index]
      if (filter === 1) value += left
      else if (filter === 2) value += up
      else if (filter === 3) value += (left + up) >> 1
      else if (filter === 4) value += paeth(left, up, upLeft)
      current[index] = value & 255
    }
    current.copy(pixels, y * stride)
    current.copy(previous)
  }
  return pixels
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft
  const leftDistance = Math.abs(estimate - left)
  const upDistance = Math.abs(estimate - up)
  const upLeftDistance = Math.abs(estimate - upLeft)
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left
  if (upDistance <= upLeftDistance) return up
  return upLeft
}
