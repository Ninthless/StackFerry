import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { copyFile, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyLinuxUpdateFile,
  assertEmbeddedBlockMapTrailer,
  embedUpdateInformation,
  githubReleaseAssetUrl,
  githubReleasesUpdateInformation,
  readLinuxUpdateFile,
  updInfoText,
} from './appimage-update-info.mjs'

export function loadBuildBlockMap() {
  const require = createRequire(import.meta.url)
  const fromBuilder = createRequire(require.resolve('electron-builder/package.json'))
  const entry = fromBuilder.resolve('app-builder-lib')
  const mod = require(path.join(path.dirname(entry), 'targets/blockmap/blockmap.js'))
  if (typeof mod.buildBlockMap !== 'function') throw new Error('app-builder-lib blockmap builder is unavailable')
  return mod.buildBlockMap
}

export async function embedAppImageUpdateInfo(root) {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  const builder = JSON.parse(await readFile(path.join(root, 'electron-builder.json'), 'utf8'))
  const version = pkg.version
  const publish = builder.publish
  if (!publish || publish.provider !== 'github' || !publish.owner || !publish.repo) {
    throw new Error('electron-builder.json publish must be a GitHub owner and repo')
  }
  const dir = path.join(root, 'release', version)
  const appImages = (await readdir(dir)).filter((name) => name.endsWith('.AppImage')).sort()
  if (appImages.length === 0) throw new Error(`no AppImage in ${dir}`)
  const manifests = await readLinuxManifests(dir)
  for (const fileName of appImages) {
    const manifest = manifests.filter((item) => item.text.split(/\r?\n/).includes(`  - url: ${fileName}`))
    if (manifest.length !== 1) throw new Error(`${fileName} must appear in exactly one latest-linux manifest`)
    await embedOne({
      filePath: path.join(dir, fileName),
      fileName,
      manifestPath: manifest[0].filePath,
      manifestText: manifest[0].text,
      owner: publish.owner,
      repo: publish.repo,
      version,
    })
    const refreshed = await readFile(manifest[0].filePath, 'utf8')
    manifest[0].text = refreshed
  }
}

async function embedOne(input) {
  const updateInformation = githubReleasesUpdateInformation(input)
  const assetUrl = githubReleaseAssetUrl(input)
  const bytes = await readFile(input.filePath)
  const current = updInfoText(bytes)
  if (current === updateInformation) {
    await publishExisting(input, bytes, updateInformation, assetUrl)
    return
  }
  if (current !== '') throw new Error(`.upd_info already holds ${JSON.stringify(current)}`)
  const meta = readLinuxUpdateFile(input.manifestText, input.fileName)
  if (bytes.length !== meta.size) throw new Error(`${input.fileName} size does not match ${meta.size}`)
  const bodyLength = assertEmbeddedBlockMapTrailer(bytes, meta.blockMapSize)
  const patched = embedUpdateInformation(bytes.subarray(0, bodyLength), updateInformation)
  const tempPath = `${input.filePath}.updating`
  const tempZsync = `${tempPath}.zsync`
  await rm(tempPath, { force: true })
  await rm(tempZsync, { force: true })
  try {
    await writeFile(tempPath, patched)
    const buildBlockMap = loadBuildBlockMap()
    const updateInfo = await buildBlockMap(tempPath, 'deflate')
    runZsyncmake(tempPath, tempZsync, assetUrl)
    await replaceFile(tempPath, input.filePath)
    await replaceFile(tempZsync, `${input.filePath}.zsync`)
    const next = applyLinuxUpdateFile(input.manifestText, input.fileName, updateInfo)
    await writeFile(input.manifestPath, next)
  } catch (error) {
    await rm(tempPath, { force: true })
    await rm(tempZsync, { force: true })
    throw error
  }
  console.log(`Embedded ${updateInformation}`)
}

async function publishExisting(input, bytes, updateInformation, assetUrl) {
  const trailer = bytes.readUInt32BE(bytes.length - 4)
  const sha512 = createHash('sha512').update(bytes).digest('base64')
  const meta = readLinuxUpdateFile(input.manifestText, input.fileName)
  const zsyncReady = await stat(`${input.filePath}.zsync`)
    .then(() => true)
    .catch(() => false)
  if (sha512 === meta.sha512 && bytes.length === meta.size && trailer === meta.blockMapSize && zsyncReady) {
    console.log(`Already embedded ${updateInformation}`)
    return
  }
  runZsyncmake(input.filePath, `${input.filePath}.zsync`, assetUrl)
  const next = applyLinuxUpdateFile(input.manifestText, input.fileName, {
    sha512,
    size: bytes.length,
    blockMapSize: trailer,
  })
  await writeFile(input.manifestPath, next)
  console.log(`Refreshed ${updateInformation}`)
}

async function readLinuxManifests(dir) {
  const names = (await readdir(dir)).filter((name) => name.startsWith('latest-linux') && name.endsWith('.yml')).sort()
  const manifests = []
  for (const name of names) {
    const filePath = path.join(dir, name)
    manifests.push({ filePath, text: await readFile(filePath, 'utf8') })
  }
  return manifests
}

function runZsyncmake(filePath, output, url) {
  const result = spawnSync('zsyncmake', ['-u', url, '-o', output, filePath], { stdio: 'inherit' })
  if (result.error) throw new Error('zsyncmake is not installed')
  if (result.status !== 0) throw new Error(`zsyncmake exited ${result.status}`)
}

async function replaceFile(source, destination) {
  try {
    await rename(source, destination)
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error
    await copyFile(source, destination)
    await rm(source, { force: true })
  }
}

function invokedDirectly() {
  const self = fileURLToPath(import.meta.url)
  const argvPath = process.argv[1]
  if (!argvPath) return false
  return path.resolve(argvPath) === self
}

if (invokedDirectly()) {
  embedAppImageUpdateInfo(process.cwd()).catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error)
    process.exitCode = 1
  })
}
