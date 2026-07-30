import type { AppId } from "@/lib/api";
import type { VisibleApps } from "@/types";
import { ProviderIcon } from "@/components/ProviderIcon";
import { cn } from "@/lib/utils";
import { Monitor, Terminal } from "lucide-react";

const APP_BADGE_ICON: Partial<
  Record<AppId, { icon: typeof Terminal; offsetY?: number }>
> = {
  claude: { icon: Terminal },
  "claude-desktop": { icon: Monitor, offsetY: 0.5 },
};

interface AppSwitcherProps {
  activeApp: AppId;
  onSwitch: (app: AppId) => void;
  visibleApps?: VisibleApps;
}

const ALL_APPS: AppId[] = [
  "claude",
  "claude-desktop",
  "codex",
  "gemini",
  "grokbuild",
  "opencode",
  "openclaw",
  "hermes",
];
const STORAGE_KEY = "stackferry-last-app";

export function AppSwitcher({
  activeApp,
  onSwitch,
  visibleApps,
}: AppSwitcherProps) {
  const handleSwitch = (app: AppId) => {
    if (app === activeApp) return;
    localStorage.setItem(STORAGE_KEY, app);
    onSwitch(app);
  };
  const iconSize = 17;
  const appIconName: Record<AppId, string> = {
    claude: "claude",
    "claude-desktop": "claude",
    codex: "openai",
    gemini: "gemini",
    grokbuild: "grok",
    opencode: "opencode",
    openclaw: "openclaw",
    hermes: "hermes",
  };
  const appDisplayName: Record<AppId, string> = {
    claude: "Claude Code",
    "claude-desktop": "Claude Desktop",
    codex: "Codex",
    gemini: "Gemini",
    grokbuild: "Grok Build",
    opencode: "OpenCode",
    openclaw: "OpenClaw",
    hermes: "Hermes",
  };

  const appsToShow = ALL_APPS.filter((app) => {
    if (!visibleApps) return true;
    return visibleApps[app];
  });

  return (
    <div className="grid grid-cols-2 gap-1">
      {appsToShow.map((app) => {
        const badgeConfig = APP_BADGE_ICON[app];
        const BadgeIcon = badgeConfig?.icon;
        const isActive = activeApp === app;
        return (
          <button
            key={app}
            type="button"
            onClick={() => handleSwitch(app)}
            aria-label={appDisplayName[app]}
            aria-pressed={isActive}
            className={cn(
              "group flex h-10 min-w-0 items-center gap-2 rounded-md border px-2 text-left text-[11px] font-medium transition-colors",
              isActive
                ? "border-primary/35 bg-primary/10 text-sidebar-foreground"
                : "border-transparent text-sidebar-foreground/60 hover:border-sidebar-border hover:bg-sidebar-hover hover:text-sidebar-foreground",
            )}
          >
            <span className="relative inline-flex shrink-0">
              <ProviderIcon
                icon={appIconName[app]}
                name={appDisplayName[app]}
                size={iconSize}
              />
              {BadgeIcon && (
                <span
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 flex h-[10px] w-[10px] items-center justify-center rounded-[2px] border",
                    isActive
                      ? "border-primary/40 bg-sidebar text-primary"
                      : "border-sidebar-border bg-sidebar text-sidebar-foreground/45",
                  )}
                  aria-hidden="true"
                >
                  <BadgeIcon
                    className="h-[8px] w-[8px]"
                    strokeWidth={2.5}
                    style={
                      badgeConfig?.offsetY
                        ? { transform: `translateY(${badgeConfig.offsetY}px)` }
                        : undefined
                    }
                  />
                </span>
              )}
            </span>
            <span className="min-w-0 truncate leading-tight">
              {appDisplayName[app]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
