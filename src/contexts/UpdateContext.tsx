import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import type { UpdateHandle, UpdateInfo } from "../lib/updater";
import { checkForUpdate, relaunchApp } from "../lib/updater";

interface UpdateContextValue {
  // 更新状态
  hasUpdate: boolean;
  updateInfo: UpdateInfo | null;
  isChecking: boolean;
  isInstalling: boolean;
  error: string | null;

  // 提示状态
  isDismissed: boolean;
  dismissUpdate: () => void;

  // 操作方法
  checkUpdate: () => Promise<boolean>;
  installUpdate: () => Promise<void>;
  resetDismiss: () => void;
}

const UpdateContext = createContext<UpdateContextValue | undefined>(undefined);
const DISMISSED_VERSION_KEY = "stackferry:update:dismissedVersion";
const LEGACY_DISMISSED_KEY = "dismissedUpdateVersion";

const readDismissedVersion = () => {
  const dismissedVersion = localStorage.getItem(DISMISSED_VERSION_KEY);
  if (dismissedVersion) return dismissedVersion;

  const legacyVersion = localStorage.getItem(LEGACY_DISMISSED_KEY);
  if (!legacyVersion) return null;

  localStorage.setItem(DISMISSED_VERSION_KEY, legacyVersion);
  localStorage.removeItem(LEGACY_DISMISSED_KEY);
  return legacyVersion;
};

export function UpdateProvider({ children }: { children: React.ReactNode }) {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<UpdateHandle | null>(null);

  // 从 localStorage 读取已关闭的版本
  useEffect(() => {
    const current = updateInfo?.availableVersion;
    if (!current) return;

    setIsDismissed(readDismissedVersion() === current);
  }, [updateInfo?.availableVersion]);

  const isCheckingRef = useRef(false);
  const isInstallingRef = useRef(false);

  const checkUpdate = useCallback(async () => {
    if (isCheckingRef.current) return false;
    isCheckingRef.current = true;
    setIsChecking(true);
    setError(null);

    try {
      const result = await checkForUpdate({ timeout: 30000 });

      if (result.status === "available") {
        setHasUpdate(true);
        setUpdateInfo(result.info);
        setPendingUpdate(result.update);

        setIsDismissed(readDismissedVersion() === result.info.availableVersion);
        return true; // 有更新
      } else {
        setHasUpdate(false);
        setUpdateInfo(null);
        setPendingUpdate(null);
        setIsDismissed(false);
        return false; // 已是最新
      }
    } catch (err) {
      console.error("检查更新失败:", err);
      setError(err instanceof Error ? err.message : "检查更新失败");
      setHasUpdate(false);
      setUpdateInfo(null);
      setPendingUpdate(null);
      setIsDismissed(false);
      throw err; // 抛出错误让调用方处理
    } finally {
      setIsChecking(false);
      isCheckingRef.current = false;
    }
  }, []);

  const installUpdate = useCallback(async () => {
    if (isInstallingRef.current) return;
    if (!pendingUpdate) {
      throw new Error("No update is ready to install");
    }

    isInstallingRef.current = true;
    setIsInstalling(true);
    setError(null);

    try {
      await pendingUpdate.downloadAndInstall();
      await relaunchApp();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Update installation failed",
      );
      throw err;
    } finally {
      setIsInstalling(false);
      isInstallingRef.current = false;
    }
  }, [pendingUpdate]);

  const dismissUpdate = useCallback(() => {
    setIsDismissed(true);
    if (updateInfo?.availableVersion) {
      localStorage.setItem(DISMISSED_VERSION_KEY, updateInfo.availableVersion);
      // 清理旧键
      localStorage.removeItem(LEGACY_DISMISSED_KEY);
    }
  }, [updateInfo?.availableVersion]);

  const resetDismiss = useCallback(() => {
    setIsDismissed(false);
    localStorage.removeItem(DISMISSED_VERSION_KEY);
    localStorage.removeItem(LEGACY_DISMISSED_KEY);
  }, []);

  // 应用启动时自动检查更新
  useEffect(() => {
    // 延迟1秒后检查，避免影响启动体验
    const timer = setTimeout(() => {
      checkUpdate().catch(console.error);
    }, 1000);

    return () => clearTimeout(timer);
  }, [checkUpdate]);

  const value: UpdateContextValue = {
    hasUpdate,
    updateInfo,
    isChecking,
    isInstalling,
    error,
    isDismissed,
    dismissUpdate,
    checkUpdate,
    installUpdate,
    resetDismiss,
  };

  return (
    <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>
  );
}

export function useUpdate() {
  const context = useContext(UpdateContext);
  if (!context) {
    throw new Error("useUpdate must be used within UpdateProvider");
  }
  return context;
}
