import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readCodexDaemonState } from '../electron/main/codex/daemon'

const roots: string[] = []

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function fixture(name = 'app-server.pid') {
  const home = await mkdtemp(path.join(os.tmpdir(), 'stackferry-daemon-'))
  roots.push(home)
  const pidPath = path.join(home, 'app-server-daemon', name)
  const configPath = path.join(home, 'config.toml')
  const catalogPath = path.join(home, 'catalog.json')
  await mkdir(path.dirname(pidPath), { recursive: true })
  await writeFile(pidPath, JSON.stringify({ pid: process.pid }))
  await writeFile(configPath, 'model_catalog_json = "catalog.json"\n')
  await writeFile(catalogPath, '{"models":[]}')
  await setTime(configPath, 1_000)
  await setTime(catalogPath, 1_000)
  await setTime(pidPath, 2_000)
  return { home, pidPath, configPath, catalogPath }
}

async function setTime(file: string, ms: number) {
  await utimes(file, new Date(ms), new Date(ms))
}

describe('Codex shared daemon configuration', () => {
  it('detects a model catalog updated after the daemon, even when config.toml is unchanged', async () => {
    const { home, pidPath, catalogPath } = await fixture()
    expect(await readCodexDaemonState(home)).toBe('current')
    await setTime(catalogPath, 3_000)
    expect(await readCodexDaemonState(home)).toBe('stale')
    await setTime(pidPath, 4_000)
    expect(await readCodexDaemonState(home)).toBe('current')
  })

  it('detects changes to config.toml and supports legacy numeric daemon.pid files', async () => {
    const { home, pidPath, configPath } = await fixture('daemon.pid')
    await writeFile(pidPath, String(process.pid))
    await setTime(pidPath, 2_000)
    await setTime(configPath, 3_000)
    expect(await readCodexDaemonState(home)).toBe('stale')
  })

  it('does not call a missing or exited daemon stale', async () => {
    const { home, pidPath } = await fixture()
    await writeFile(pidPath, JSON.stringify({ pid: 2_147_483_647 }))
    expect(await readCodexDaemonState(home)).toBe('stopped')
    await rm(pidPath)
    expect(await readCodexDaemonState(home)).toBe('stopped')
  })

  it('keeps invalid records and missing catalogs distinct from a current daemon', async () => {
    const { home, pidPath, catalogPath } = await fixture()
    await rm(catalogPath)
    expect(await readCodexDaemonState(home)).toBe('unknown')
    await writeFile(pidPath, '{"pid":-1}')
    expect(await readCodexDaemonState(home)).toBe('unknown')
  })
})
