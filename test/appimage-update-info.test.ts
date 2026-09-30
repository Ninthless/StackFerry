import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  applyLinuxUpdateFile,
  assertEmbeddedBlockMapTrailer,
  embedUpdateInformation,
  githubReleaseAssetUrl,
  githubReleasesUpdateInformation,
  locateUpdInfo,
  readLinuxUpdateFile,
  updInfoText,
} from '../scripts/appimage-update-info.mjs'
import { loadBuildBlockMap } from '../scripts/embed-appimage-update-info.mjs'

const manifest = `version: 1.1.3
files:
  - url: StackFerry-1.1.3-x86_64.AppImage
    sha512: old-appimage-sha
    size: 100
    blockMapSize: 20
  - url: StackFerry-1.1.3-amd64.deb
    sha512: old-deb-sha
    size: 80
path: StackFerry-1.1.3-x86_64.AppImage
sha512: old-appimage-sha
releaseDate: '2026-09-30T04:04:00.284Z'
`

function elfWithUpdInfo(sectionSize: number, fill = 0) {
  const names = Buffer.from('\0.upd_info\0.shstrtab\0', 'utf8')
  const updOffset = 64
  const strOffset = updOffset + sectionSize
  const shoff = strOffset + names.length
  const shentsize = 64
  const file = Buffer.alloc(shoff + 3 * shentsize)
  file[0] = 0x7f
  file.write('ELF', 1, 'latin1')
  file[4] = 2
  file[5] = 1
  file[6] = 1
  file.writeBigUInt64LE(BigInt(shoff), 40)
  file.writeUInt16LE(64, 52)
  file.writeUInt16LE(shentsize, 58)
  file.writeUInt16LE(3, 60)
  file.writeUInt16LE(2, 62)
  file.fill(fill, updOffset, updOffset + sectionSize)
  names.copy(file, strOffset)
  const updHeader = shoff + shentsize
  file.writeUInt32LE(1, updHeader)
  file.writeBigUInt64LE(BigInt(updOffset), updHeader + 24)
  file.writeBigUInt64LE(BigInt(sectionSize), updHeader + 32)
  const strHeader = shoff + 2 * shentsize
  file.writeUInt32LE(11, strHeader)
  file.writeBigUInt64LE(BigInt(strOffset), strHeader + 24)
  file.writeBigUInt64LE(BigInt(names.length), strHeader + 32)
  return file
}

describe('githubReleasesUpdateInformation', () => {
  it('points AppImageUpdate at the latest GitHub release zsync for that arch', () => {
    expect(
      githubReleasesUpdateInformation({
        owner: 'Ninthless',
        repo: 'StackFerry',
        version: '1.1.3',
        fileName: 'StackFerry-1.1.3-x86_64.AppImage',
      }),
    ).toBe('gh-releases-zsync|Ninthless|StackFerry|latest|StackFerry-*-x86_64.AppImage.zsync')
    expect(
      githubReleasesUpdateInformation({
        owner: 'Ninthless',
        repo: 'StackFerry',
        version: '1.1.3',
        fileName: 'StackFerry-1.1.3-arm64.AppImage',
      }),
    ).toBe('gh-releases-zsync|Ninthless|StackFerry|latest|StackFerry-*-arm64.AppImage.zsync')
    expect(
      githubReleaseAssetUrl({
        owner: 'Ninthless',
        repo: 'StackFerry',
        version: '1.1.3',
        fileName: 'StackFerry-1.1.3-x86_64.AppImage',
      }),
    ).toBe('https://github.com/Ninthless/StackFerry/releases/download/v1.1.3/StackFerry-1.1.3-x86_64.AppImage')
  })

  it('rejects a file name that would embed a pattern matching nothing', () => {
    expect(() =>
      githubReleasesUpdateInformation({
        owner: 'Ninthless',
        repo: 'StackFerry',
        version: '1.1.3',
        fileName: 'StackFerry-1.1.30-x86_64.AppImage',
      }),
    ).toThrow(/1\.1\.3/)
  })
})

describe('embedUpdateInformation', () => {
  it('writes a NUL-terminated string into an empty .upd_info section', () => {
    const file = elfWithUpdInfo(1024)
    const next = embedUpdateInformation(file, 'gh-releases-zsync|Ninthless|StackFerry|latest|StackFerry-*-x86_64.AppImage.zsync')
    expect(updInfoText(next)).toBe(
      'gh-releases-zsync|Ninthless|StackFerry|latest|StackFerry-*-x86_64.AppImage.zsync',
    )
    expect(file.subarray(locateUpdInfo(file).offset, locateUpdInfo(file).offset + 4).every((byte) => byte === 0)).toBe(
      true,
    )
    const again = embedUpdateInformation(next, updInfoText(next))
    expect(again.equals(next)).toBe(true)
  })

  it('refuses a section that already holds different update information', () => {
    const file = elfWithUpdInfo(64)
    const once = embedUpdateInformation(file, 'zsync|https://example.test/app.zsync')
    expect(() => embedUpdateInformation(once, 'zsync|https://example.test/other.zsync')).toThrow(/already holds/)
  })

  it('refuses update information that does not fit before the terminating NUL', () => {
    const file = elfWithUpdInfo(8)
    expect(() => embedUpdateInformation(file, 'too-long')).toThrow(/8 bytes/)
  })
})

describe('linux updater manifest', () => {
  it('replaces the AppImage checksum and leaves the deb entry in place', () => {
    const next = applyLinuxUpdateFile(manifest, 'StackFerry-1.1.3-x86_64.AppImage', {
      sha512: 'new-appimage-sha',
      size: 120,
      blockMapSize: 24,
    })
    expect(readLinuxUpdateFile(next, 'StackFerry-1.1.3-x86_64.AppImage')).toEqual({
      sha512: 'new-appimage-sha',
      size: 120,
      blockMapSize: 24,
    })
    expect(next).toContain('sha512: old-deb-sha')
    expect(next).toContain('size: 80')
    expect(next).toContain('sha512: new-appimage-sha\nreleaseDate:')
    expect(next).toContain("releaseDate: '2026-09-30T04:04:00.284Z'")
  })
})

describe('embedded blockmap', () => {
  it('checks the trailer length electron-updater reads back', () => {
    const body = Buffer.from('appimage-body')
    const compressed = Buffer.from('map')
    const trailer = Buffer.alloc(4)
    trailer.writeUInt32BE(compressed.length, 0)
    const file = Buffer.concat([body, compressed, trailer])
    expect(assertEmbeddedBlockMapTrailer(file, compressed.length)).toBe(body.length)
    expect(() => assertEmbeddedBlockMapTrailer(file, compressed.length + 1)).toThrow(/does not match/)
  })

  it('rebuilds the blockmap electron-builder appends after the body changes', async () => {
    const buildBlockMap = loadBuildBlockMap()
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stackferry-blockmap-'))
    try {
      const file = path.join(dir, 'payload.bin')
      await writeFile(file, Buffer.alloc(100_000, 7))
      const first = await buildBlockMap(file, 'deflate')
      const packed = await readFile(file)
      const bodyLength = assertEmbeddedBlockMapTrailer(packed, first.blockMapSize)
      const body = Buffer.from(packed.subarray(0, bodyLength))
      body[10] = 9
      const again = path.join(dir, 'payload-again.bin')
      await writeFile(again, body)
      const second = await buildBlockMap(again, 'deflate')
      expect(second.sha512).not.toBe(first.sha512)
      expect(second.size).toBeGreaterThan(body.length)
      const rebuilt = await readFile(again)
      expect(rebuilt.readUInt32BE(rebuilt.length - 4)).toBe(second.blockMapSize)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
