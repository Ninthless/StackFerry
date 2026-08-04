import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Copy, Minus, Square, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import appIcon from "@/assets/icons/app-icon.png";
import { useWindowControls } from "@/hooks/useWindowControls";
import { APP_VERSION } from "@/lib/appVersion";
import { DRAG_REGION_ATTR, isLinux, isMac, isWindows } from "@/lib/platform";
import { getCurrentVersion } from "@/lib/updater";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errorUtils";

type WindowAction = "close" | "maximize" | "minimize";
type WindowPlatform = "linux" | "macos" | "unknown" | "windows";

interface WindowFrameProps {
  children: ReactNode;
}

const platform = (): WindowPlatform => {
  if (isMac()) return "macos";
  if (isWindows()) return "windows";
  if (isLinux()) return "linux";
  return "unknown";
};

export function WindowFrame({ children }: WindowFrameProps) {
  const { t } = useTranslation();
  const currentPlatform = useMemo(platform, []);
  const {
    close,
    isDecorated,
    isFocused,
    isFullscreen,
    isMaximized,
    isReady,
    minimize,
    setDecorated,
    toggleMaximize,
  } = useWindowControls();
  const [appVersion, setAppVersion] = useState(APP_VERSION);
  const [pendingAction, setPendingAction] = useState<WindowAction | null>(null);

  const usesAppControls =
    (currentPlatform === "windows" || currentPlatform === "linux") &&
    (!isReady || !isDecorated);
  const showsTitlebar =
    !isFullscreen && (currentPlatform === "macos" || usesAppControls);
  const titlebarHeight = showsTitlebar
    ? currentPlatform === "macos"
      ? 28
      : 32
    : 0;

  useEffect(() => {
    let mounted = true;

    void getCurrentVersion().then((version) => {
      if (mounted) setAppVersion(version);
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--window-titlebar-height",
      `${titlebarHeight}px`,
    );
    return () => {
      document.documentElement.style.removeProperty("--window-titlebar-height");
    };
  }, [titlebarHeight]);

  useEffect(() => {
    if (currentPlatform !== "linux") return;

    void setDecorated(false).catch((error) => {
      console.error("[WindowFrame] Failed to update window decorations", error);
      toast.error(
        t("notifications.windowControlFailed", {
          defaultValue: "窗口控制失败：{{error}}",
          error: extractErrorMessage(error),
        }),
      );
    });
  }, [currentPlatform, setDecorated, t]);

  const runAction = async (
    action: WindowAction,
    execute: () => Promise<void>,
  ) => {
    if (pendingAction) return;
    setPendingAction(action);
    try {
      await execute();
    } catch (error) {
      console.error(`[WindowFrame] Failed to ${action} window`, error);
      toast.error(
        t("notifications.windowControlFailed", {
          defaultValue: "窗口控制失败：{{error}}",
          error: extractErrorMessage(error),
        }),
      );
    } finally {
      setPendingAction(null);
    }
  };

  const dragRegionProps =
    currentPlatform === "linux" && usesAppControls
      ? { "data-tauri-drag-region": true }
      : DRAG_REGION_ATTR;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {showsTitlebar && (
        <div
          data-testid="window-titlebar"
          data-platform={currentPlatform}
          className={cn(
            "relative z-[70] flex shrink-0 select-none items-center border-b border-sidebar-border bg-sidebar text-sidebar-foreground",
            !isFocused && "text-sidebar-foreground/60",
          )}
          style={{ height: titlebarHeight }}
        >
          <div
            className={cn(
              "absolute inset-y-0 left-0",
              usesAppControls ? "right-[138px]" : "right-0",
            )}
            {...dragRegionProps}
          />

          <div
            data-testid="window-brand"
            className={cn(
              "pointer-events-none relative z-10 flex min-w-0 items-center gap-2",
              currentPlatform === "macos" ? "pl-[78px]" : "pl-3",
            )}
          >
            <img src={appIcon} alt="" className="h-3.5 w-3.5 rounded-sm" />
            <span className="truncate text-[11px] font-medium">StackFerry</span>
            <span
              data-testid="window-version"
              className="shrink-0 text-[10px] font-normal opacity-45"
            >
              v{appVersion}
            </span>
          </div>

          {usesAppControls && (
            <div
              className="relative z-10 ml-auto flex h-full items-stretch"
              data-tauri-no-drag
            >
              <button
                type="button"
                disabled={pendingAction !== null}
                aria-label={t("header.windowMinimize")}
                title={t("header.windowMinimize")}
                className="flex h-8 w-[46px] items-center justify-center bg-transparent text-sidebar-foreground/65 outline-none transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:bg-sidebar-hover focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-45"
                onClick={() => void runAction("minimize", minimize)}
              >
                <Minus className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                disabled={pendingAction !== null}
                aria-label={
                  isMaximized
                    ? t("header.windowRestore")
                    : t("header.windowMaximize")
                }
                title={
                  isMaximized
                    ? t("header.windowRestore")
                    : t("header.windowMaximize")
                }
                className="flex h-8 w-[46px] items-center justify-center bg-transparent text-sidebar-foreground/65 outline-none transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:bg-sidebar-hover focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-45"
                onClick={() => void runAction("maximize", toggleMaximize)}
              >
                {isMaximized ? (
                  <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                ) : (
                  <Square className="h-3.5 w-3.5" strokeWidth={1.75} />
                )}
              </button>
              <button
                type="button"
                disabled={pendingAction !== null}
                aria-label={t("header.windowClose")}
                title={t("header.windowClose")}
                className="flex h-8 w-[46px] items-center justify-center bg-transparent text-sidebar-foreground/65 outline-none transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:bg-destructive focus-visible:text-destructive-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-45"
                onClick={() => void runAction("close", close)}
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            </div>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
