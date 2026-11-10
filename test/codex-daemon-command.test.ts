import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CliToolService } from '../electron/main/cli-tools/service'

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('../electron/main/cli-tools/paths', async (original) => ({
  ...await original<typeof import('../electron/main/cli-tools/paths')>(),
  execFileCaptured: execute,
}))
vi.mock('node:fs', async (original) => ({
  ...await original<typeof import('node:fs')>(),
  statSync: () => ({ isFile: () => true }),
}))

afterEach(() => {
  vi.unstubAllEnvs()
  execute.mockReset()
})

describe('Codex daemon command', () => {
  it('uses the selected CODEX_HOME, keeps proxy variables, and closes stdin', async () => {
    vi.stubEnv('CODEX_HOME', '/other-codex-home')
    vi.stubEnv('HTTPS_PROXY', 'http://127.0.0.1:7890')
    execute.mockResolvedValue({ stdout: Buffer.from('restarted'), stderr: Buffer.alloc(0) })
    const home = path.join(os.tmpdir(), 'selected codex home')
    await new CliToolService().restartCodexDaemon(home)
    expect(execute).toHaveBeenCalledOnce()
    expect(execute).toHaveBeenCalledWith(
      expect.stringMatching(/codex(?:\.exe)?$/),
      ['app-server', 'daemon', 'restart'],
      expect.objectContaining({
        timeout: 30_000,
        closeStdin: true,
        env: expect.objectContaining({ CODEX_HOME: home, HTTPS_PROXY: 'http://127.0.0.1:7890' }),
      }),
    )
  })

  it('reports unsupported or failed restart commands', async () => {
    execute.mockRejectedValue(Object.assign(new Error('unsupported'), { stderr: Buffer.from('unrecognized subcommand restart') }))
    await expect(new CliToolService().restartCodexDaemon('/selected-home')).rejects.toThrow('cli_spawn_failed')
  })
})
