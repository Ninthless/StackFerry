import electronUpdater, { type AppUpdater } from 'electron-updater'
import { AppError } from '../../../shared/app-error'
import { normalizeAppReleaseNotes } from '../../../shared/app-releases'

// electron-updater 6 是 CommonJS：ESM 具名导入 autoUpdater 会在运行时失败。autoUpdater 是 getter，模块顶层读取会立刻构造更新器。
const { NsisUpdater } = electronUpdater

export type AppUpdateFeed = {
  check: () => Promise<{ version: string; releaseNotes: string | null } | null>
  download: (onProgress: (transferred: number, total: number) => void) => Promise<void>
  install: () => void
}

export function configureAppUpdater(updater: AppUpdater = electronUpdater.autoUpdater): AppUpdater {
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = false
  updater.allowPrerelease = false
  if (updater instanceof NsisUpdater) {
    // 当前 NSIS 构建未签名；默认验签会拒绝更新。签名发布后删除此覆盖。
    updater.verifyUpdateCodeSignature = async () => null
  }
  return updater
}

export function createElectronUpdateFeed(updater: AppUpdater = electronUpdater.autoUpdater): AppUpdateFeed {
  const configured = configureAppUpdater(updater)
  return {
    async check() {
      try {
        const result = await configured.checkForUpdates()
        if (!result?.isUpdateAvailable) return null
        return {
          version: result.updateInfo.version,
          releaseNotes: normalizeAppReleaseNotes(result.updateInfo.releaseNotes),
        }
      } catch (error) {
        throw wrapUpdateError('app_update_check_failed', error)
      }
    },
    async download(onProgress) {
      const handleProgress = (info: { transferred: number; total: number }) => {
        onProgress(info.transferred, info.total)
      }
      configured.on('download-progress', handleProgress)
      try {
        await configured.downloadUpdate()
      } catch (error) {
        throw wrapUpdateError('app_update_download_failed', error)
      } finally {
        configured.off('download-progress', handleProgress)
      }
    },
    install() {
      configured.quitAndInstall(false, true)
    },
  }
}

function wrapUpdateError(
  code: 'app_update_check_failed' | 'app_update_download_failed',
  error: unknown,
): AppError {
  if (error instanceof AppError) return error
  const detail = error instanceof Error ? error.message : String(error)
  return new AppError(code, { detail: detail.trim().slice(0, 400) || code })
}
