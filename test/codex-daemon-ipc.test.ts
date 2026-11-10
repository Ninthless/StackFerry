import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IpcChannel } from '../shared/ipc'
import { emptyWriteChains } from '../electron/main/app-ipc'
import { registerCodexIpc, type CodexIpcContext } from '../electron/main/codex/ipc'

const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => unknown>() }))
vi.mock('electron', () => ({ ipcMain: { handle: (key: string, handler: (...args: unknown[]) => unknown) => handlers.set(key, handler) } }))

const roots: string[] = []
afterEach(async () => {
  handlers.clear()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function fixture() {
  const home = await mkdtemp(path.join(os.tmpdir(), 'stackferry-daemon-ipc-'))
  roots.push(home)
  const pidPath = path.join(home, 'app-server-daemon', 'app-server.pid')
  await mkdir(path.dirname(pidPath), { recursive: true })
  await writeFile(pidPath, JSON.stringify({ pid: process.pid }))
  await utimes(pidPath, new Date(1_000), new Date(1_000))
  await writeFile(path.join(home, 'config.toml'), 'model = "gpt-6.1-sol"\n')
  const context = {
    getCodexHome: () => home,
    getNeedsRestart: () => true,
    onChanged: vi.fn(),
    store: { getLastWriteAt: async () => null, getActiveId: async () => 'provider' },
  } as unknown as CodexIpcContext
  return { home, pidPath, context }
}

describe('Codex daemon restart IPC', () => {
  it('waits for provider writes, restarts only the configured home, and verifies the new daemon', async () => {
    const { home, pidPath, context } = await fixture()
    const events: string[] = []
    const writes = emptyWriteChains()
    writes.codex = Promise.resolve().then(() => { events.push('config written') })
    const cli = { restartCodexDaemon: vi.fn(async () => {
      events.push('restart')
      await utimes(pidPath, new Date(Date.now() + 1_000), new Date(Date.now() + 1_000))
    }) }
    registerCodexIpc(context, writes, cli)
    const result = await handlers.get(IpcChannel.restartCodexDaemon)!()
    expect(events).toEqual(['config written', 'restart'])
    expect(cli.restartCodexDaemon).toHaveBeenCalledWith(home)
    expect(result).toMatchObject({ codexDaemon: 'current' })
    expect(context.onChanged).toHaveBeenCalledOnce()
  })

  it('reports restart failure instead of claiming stale capabilities were refreshed', async () => {
    const { context } = await fixture()
    registerCodexIpc(context, emptyWriteChains(), { restartCodexDaemon: vi.fn(async () => undefined) })
    await expect(handlers.get(IpcChannel.restartCodexDaemon)!()).rejects.toThrow('cli_spawn_failed')
    expect(context.onChanged).not.toHaveBeenCalled()
  })

  it('does not start a daemon when none is running', async () => {
    const { context, pidPath } = await fixture()
    await rm(pidPath)
    const cli = { restartCodexDaemon: vi.fn() }
    registerCodexIpc(context, emptyWriteChains(), cli)
    expect(await handlers.get(IpcChannel.restartCodexDaemon)!()).toMatchObject({ codexDaemon: 'stopped' })
    expect(cli.restartCodexDaemon).not.toHaveBeenCalled()
  })
})
