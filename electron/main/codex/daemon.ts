import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { CodexDaemonState } from '../../../shared/types'
import { codexConfigPath } from './home'
import { parseToml } from './merge'

export async function readCodexDaemonState(codexHome: string): Promise<CodexDaemonState> {
  try {
    for (const name of ['app-server.pid', 'daemon.pid']) {
      const pidPath = path.join(codexHome, 'app-server-daemon', name)
      let record: string
      try {
        record = await readFile(pidPath, 'utf8')
      } catch (error) {
        if (isMissing(error)) continue
        throw error
      }
      const parsed: unknown = JSON.parse(record)
      const pid = typeof parsed === 'number' ? parsed : (parsed as { pid?: unknown } | null)?.pid
      if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid <= 0) return 'unknown'
      try {
        process.kill(pid, 0)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ESRCH') continue
        throw error
      }
      const started = (await stat(pidPath)).mtimeMs
      const configPath = codexConfigPath(codexHome)
      const config = parseToml(await readFile(configPath, 'utf8'))
      const files = [configPath]
      if (typeof config.model_catalog_json === 'string' && config.model_catalog_json.trim()) {
        files.push(path.resolve(codexHome, config.model_catalog_json))
      }
      for (const file of files) {
        if ((await stat(file)).mtimeMs > started) return 'stale'
      }
      return 'current'
    }
    return 'stopped'
  } catch {
    return 'unknown'
  }
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
}
