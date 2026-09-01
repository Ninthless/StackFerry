import type { AppId } from "@/platform/tauri/api";
import type { VisibleApps } from "@/shared/contracts";
import { ProviderIcon } from "@/shared/ui/ProviderIcon";
import { Check, ChevronsUpDown, Monitor, Terminal } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { cn } from "@/lib/utils";

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
  variant?: "header" | "sidebar";
}

const ALL_APPS: AppId[] = [
  "claude",
  "claude-desktop",
  "codex",
  "pi",
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
  variant = "sidebar",
}: AppSwitcherProps) {
  const { t } = useTranslation();
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
    pi: "pi",
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
    pi: "Pi",
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
  const activeAppName = appDisplayName[activeApp];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("shell.switchApplication")}
          data-variant={variant}
          className={cn(
            "flex min-w-0 items-center gap-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
            variant === "header"
              ? "h-7 w-[176px] rounded-sm bg-transparent px-1.5 font-semibold text-foreground hover:bg-muted"
              : "h-9 w-full rounded-md border border-sidebar-foreground/20 bg-sidebar-active px-2.5 text-sm font-medium text-sidebar-foreground hover:border-sidebar-foreground/35 hover:bg-sidebar-hover",
          )}
        >
          <ProviderIcon
            icon={appIconName[activeApp]}
            name={activeAppName}
            size={18}
          />
          <span className="min-w-0 flex-1 truncate">{activeAppName}</span>
          <ChevronsUpDown
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              variant === "header"
                ? "text-muted-foreground"
                : "text-sidebar-foreground/45",
            )}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="w-[208px]">
        {appsToShow.map((app) => {
          const badgeConfig = APP_BADGE_ICON[app];
          const BadgeIcon = badgeConfig?.icon;
          const isActive = activeApp === app;
          return (
            <DropdownMenuItem
              key={app}
              onSelect={() => handleSwitch(app)}
              aria-label={appDisplayName[app]}
              aria-current={isActive ? "true" : undefined}
              className="h-8"
            >
              <span className="relative inline-flex shrink-0">
                <ProviderIcon
                  icon={appIconName[app]}
                  name={appDisplayName[app]}
                  size={iconSize}
                />
                {BadgeIcon && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 flex h-[10px] w-[10px] items-center justify-center rounded-[2px] border border-border bg-popover text-muted-foreground"
                    aria-hidden="true"
                  >
                    <BadgeIcon
                      className="h-[8px] w-[8px]"
                      strokeWidth={2.5}
                      style={
                        badgeConfig?.offsetY
                          ? {
                              transform: `translateY(${badgeConfig.offsetY}px)`,
                            }
                          : undefined
                      }
                    />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {appDisplayName[app]}
              </span>
              {isActive && <Check className="h-4 w-4 shrink-0" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
