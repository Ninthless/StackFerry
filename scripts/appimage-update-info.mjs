const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46])
const IDENT = /^[A-Za-z0-9._-]+$/

export function githubReleasesUpdateInformation({ owner, repo, version, fileName }) {
  if (!IDENT.test(owner) || !IDENT.test(repo)) {
    throw new Error('GitHub owner and repo must be a single path segment')
  }
  if (!IDENT.test(version)) throw new Error('version is not safe to embed')
  const token = `-${version}-`
  const parts = fileName.split(token)
  if (!fileName.endsWith('.AppImage') || parts.length !== 2 || parts[0] === '' || parts[1] === '') {
    throw new Error(`${fileName} does not contain ${token}`)
  }
  const pattern = `${parts[0]}-*-${parts[1]}.zsync`
  if (pattern.includes('|')) throw new Error('zsync pattern contains a separator')
  return `gh-releases-zsync|${owner}|${repo}|latest|${pattern}`
}

export function githubReleaseAssetUrl({ owner, repo, version, fileName }) {
  if (!IDENT.test(owner) || !IDENT.test(repo) || !IDENT.test(version)) {
    throw new Error('GitHub release asset URL is not safe')
  }
  if (!IDENT.test(fileName.replaceAll('.', ''))) throw new Error('AppImage file name is not safe')
  return `https://github.com/${owner}/${repo}/releases/download/v${version}/${fileName}`
}

export function locateUpdInfo(file) {
  if (!Buffer.isBuffer(file) || file.length < 64) throw new Error('AppImage runtime header is too small')
  if (!file.subarray(0, 4).equals(ELF_MAGIC) || file[4] !== 2 || file[5] !== 1) {
    throw new Error('AppImage runtime is not 64-bit little-endian ELF')
  }
  const shoff = readU64(file, 40)
  const shentsize = file.readUInt16LE(58)
  const shnum = file.readUInt16LE(60)
  const shstrndx = file.readUInt16LE(62)
  if (shentsize < 64 || shnum === 0 || shstrndx >= shnum) {
    throw new Error('ELF section names are missing')
  }
  const tableEnd = shoff + shnum * shentsize
  if (tableEnd > file.length) throw new Error('ELF section table is outside the AppImage')
  const strHeader = shoff + shstrndx * shentsize
  const strOffset = readU64(file, strHeader + 24)
  const strSize = readU64(file, strHeader + 32)
  if (strOffset + strSize > file.length) throw new Error('ELF section names are outside the AppImage')
  const names = file.subarray(strOffset, strOffset + strSize)
  for (let index = 0; index < shnum; index += 1) {
    const entry = shoff + index * shentsize
    const name = readCString(names, file.readUInt32LE(entry))
    if (name !== '.upd_info') continue
    const offset = readU64(file, entry + 24)
    const size = readU64(file, entry + 32)
    if (size <= 0 || offset + size > file.length) throw new Error('.upd_info section is outside the AppImage')
    return { offset, size }
  }
  throw new Error('AppImage runtime has no .upd_info section')
}

export function updInfoText(file) {
  const { offset, size } = locateUpdInfo(file)
  const section = file.subarray(offset, offset + size)
  const end = section.indexOf(0)
  return section.toString('utf8', 0, end === -1 ? section.length : end)
}

export function embedUpdateInformation(file, text) {
  if (typeof text !== 'string' || text.length === 0 || text.includes('\0')) {
    throw new Error('update information is empty or contains NUL')
  }
  const { offset, size } = locateUpdInfo(file)
  const encoded = Buffer.from(text, 'utf8')
  if (encoded.length >= size) {
    throw new Error(`update information is ${encoded.length} bytes and .upd_info is ${size} bytes`)
  }
  const section = file.subarray(offset, offset + size)
  const current = updInfoText(file)
  const blank = section.every((byte) => byte === 0)
  if (!blank && current !== text) throw new Error(`.upd_info already holds ${JSON.stringify(current)}`)
  const next = Buffer.from(file)
  next.fill(0, offset, offset + size)
  encoded.copy(next, offset)
  return next
}

export function assertEmbeddedBlockMapTrailer(file, blockMapSize) {
  if (!Number.isInteger(blockMapSize) || blockMapSize <= 0) throw new Error('blockMapSize is invalid')
  const trailer = blockMapSize + 4
  if (file.length <= trailer) throw new Error('AppImage is smaller than its blockmap trailer')
  const declared = file.readUInt32BE(file.length - 4)
  if (declared !== blockMapSize) {
    throw new Error(`blockmap trailer ${declared} does not match manifest ${blockMapSize}`)
  }
  return file.length - trailer
}

export function readLinuxUpdateFile(yaml, fileName) {
  const { lines } = splitLines(yaml)
  const entry = findFileEntry(lines, fileName)
  if (!entry) throw new Error(`updater manifest has no ${fileName}`)
  const slice = lines.slice(entry.start, entry.end)
  const sha512 = field(slice, 'sha512')
  const size = Number(field(slice, 'size'))
  const blockMapSize = Number(field(slice, 'blockMapSize'))
  if (!sha512 || !Number.isInteger(size) || size <= 0 || !Number.isInteger(blockMapSize) || blockMapSize <= 0) {
    throw new Error(`updater manifest entry ${fileName} is missing sha512, size, or blockMapSize`)
  }
  return { sha512, size, blockMapSize }
}

export function applyLinuxUpdateFile(yaml, fileName, info) {
  if (typeof info.sha512 !== 'string' || info.sha512.length === 0) throw new Error('update file sha512 is empty')
  if (!Number.isInteger(info.size) || info.size <= 0 || !Number.isInteger(info.blockMapSize) || info.blockMapSize <= 0) {
    throw new Error('update file size is invalid')
  }
  const { lines, trailing } = splitLines(yaml)
  const entry = findFileEntry(lines, fileName)
  if (!entry) throw new Error(`updater manifest has no ${fileName}`)
  let sawSha = false
  let sawSize = false
  let sawBlock = false
  const scalar = yamlScalar(info.sha512)
  for (let index = entry.start; index < entry.end; index += 1) {
    if (lines[index].startsWith('    sha512: ')) {
      lines[index] = `    sha512: ${scalar}`
      sawSha = true
    } else if (lines[index].startsWith('    size: ')) {
      lines[index] = `    size: ${info.size}`
      sawSize = true
    } else if (lines[index].startsWith('    blockMapSize: ')) {
      lines[index] = `    blockMapSize: ${info.blockMapSize}`
      sawBlock = true
    }
  }
  if (!sawSha || !sawSize || !sawBlock) {
    throw new Error(`updater manifest entry ${fileName} is missing sha512, size, or blockMapSize`)
  }
  const pathIndex = lines.findIndex((line) => line === `path: ${fileName}`)
  if (pathIndex >= 0) {
    const shaIndex = lines.findIndex((line, index) => index > pathIndex && line.startsWith('sha512: '))
    if (shaIndex < 0) throw new Error('updater manifest path has no sha512')
    lines[shaIndex] = `sha512: ${scalar}`
  }
  return `${lines.join('\n')}${trailing ? '\n' : ''}`
}

function readU64(buffer, offset) {
  const value = buffer.readBigUInt64LE(offset)
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('ELF offset is too large')
  return Number(value)
}

function readCString(buffer, offset) {
  if (offset < 0 || offset >= buffer.length) throw new Error('ELF section name is outside the string table')
  const end = buffer.indexOf(0, offset)
  if (end < 0) throw new Error('ELF section name is not terminated')
  return buffer.toString('utf8', offset, end)
}

function splitLines(yaml) {
  const normalized = yaml.replaceAll('\r\n', '\n')
  const trailing = normalized.endsWith('\n')
  const lines = normalized.split('\n')
  if (trailing) lines.pop()
  return { lines, trailing }
}

function findFileEntry(lines, fileName) {
  const start = lines.findIndex((line) => line === `  - url: ${fileName}`)
  if (start < 0) return null
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.startsWith('  - url: ') || (line.length > 0 && !line.startsWith(' '))) {
      end = index
      break
    }
  }
  return { start, end }
}

function field(lines, name) {
  const prefix = `    ${name}: `
  const line = lines.find((item) => item.startsWith(prefix))
  return line ? line.slice(prefix.length).trim() : ''
}

function yamlScalar(value) {
  if (/^(?:[&*!|>%@`'"]|\?)/.test(value) || /:\s/.test(value)) return JSON.stringify(value)
  return value
}
