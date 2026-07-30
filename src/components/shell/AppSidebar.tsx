import {
  Bot,
  BookOpen,
  Brain,
  Cable,
  ChartNoAxesCombined,
  CircleGauge,
  FolderTree,
  KeyRound,
  LayoutGrid,
  Route,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  SquareTerminal,
  Wrench,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CSSProperties } from "react";
import type { AppId } from "@/lib/api";
import type { VisibleApps } from "@/types";
import { cn } from "@/lib/utils";
import { AppSwitcher } from "@/components/AppSwitcher";
import { UpdateBadge } from "@/components/UpdateBadge";
import type { AppView } from "@/components/shell/types";
import appIcon from "@/assets/icons/app-icon.png";

interface AppSidebarProps {
  activeApp: AppId;
  visibleApps: VisibleApps;
  currentView: AppView;
  isRouteActive: boolean;
  hasSkillsSupport: boolean;
  hasSessionSupport: boolean;
  onAppSwitch: (app: AppId) => void;
  onViewChange: (view: AppView) => void;
  onOpenHermesWebUI: () => void;
  onOpenSettings: () => void;
  onOpenUsage: () => void;
  onOpenUpdate: () => void;
}

interface NavItem {
  key: string;
  label: string;
  icon: typeof Route;
  view?: AppView;
  onClick?: () => void;
}

export function AppSidebar({
  activeApp,
  visibleApps,
  currentView,
  isRouteActive,
  hasSkillsSupport,
  hasSessionSupport,
  onAppSwitch,
  onViewChange,
  onOpenHermesWebUI,
  onOpenSettings,
  onOpenUsage,
  onOpenUpdate,
}: AppSidebarProps) {
  const { t } = useTranslation();

  const coreItems: NavItem[] = [
    {
      key: "providers",
      label: t("provider.title"),
      icon: Route,
      view: "providers",
    },
  ];

  const defaultItems: NavItem[] = [
    ...(hasSkillsSupport
      ? [
          {
            key: "skills",
            label: t("skills.title", { defaultValue: "Skills" }),
            icon: Wrench,
            view: "skills" as AppView,
          },
        ]
      : []),
    {
      key: "prompts",
      label: t("prompts.manage", { defaultValue: "Prompts" }),
      icon: BookOpen,
      view: "prompts",
    },
    ...(hasSessionSupport
      ? [
          {
            key: "sessions",
            label: t("sessionManager.title", { defaultValue: "Sessions" }),
            icon: SquareTerminal,
            view: "sessions" as AppView,
          },
        ]
      : []),
    {
      key: "mcp",
      label: t("mcp.title", { defaultValue: "MCP servers" }),
      icon: Cable,
      view: "mcp",
    },
  ];

  const openClawItems: NavItem[] = [
    {
      key: "workspace",
      label: t("workspace.title", { defaultValue: "Workspace" }),
      icon: FolderTree,
      view: "workspace",
    },
    {
      key: "openclawEnv",
      label: t("openclaw.env.title", { defaultValue: "Environment" }),
      icon: KeyRound,
      view: "openclawEnv",
    },
    {
      key: "openclawTools",
      label: t("openclaw.tools.title", { defaultValue: "Tool access" }),
      icon: ShieldCheck,
      view: "openclawTools",
    },
    {
      key: "openclawAgents",
      label: t("openclaw.agents.title", { defaultValue: "Agent defaults" }),
      icon: Bot,
      view: "openclawAgents",
    },
    {
      key: "sessions",
      label: t("sessionManager.title", { defaultValue: "Sessions" }),
      icon: SquareTerminal,
      view: "sessions",
    },
  ];

  const hermesItems: NavItem[] = [
    {
      key: "skills",
      label: t("skills.title", { defaultValue: "Skills" }),
      icon: Wrench,
      view: "skills",
    },
    {
      key: "hermesMemory",
      label: t("hermes.memory.title", { defaultValue: "Memory" }),
      icon: Brain,
      view: "hermesMemory",
    },
    {
      key: "hermesWebUI",
      label: t("hermes.webui.open", { defaultValue: "Open dashboard" }),
      icon: LayoutGrid,
      onClick: onOpenHermesWebUI,
    },
    {
      key: "mcp",
      label: t("mcp.title", { defaultValue: "MCP servers" }),
      icon: Cable,
      view: "mcp",
    },
    {
      key: "sessions",
      label: t("sessionManager.title", { defaultValue: "Sessions" }),
      icon: SquareTerminal,
      view: "sessions",
    },
  ];

  const featureItems =
    activeApp === "openclaw"
      ? openClawItems
      : activeApp === "hermes"
        ? hermesItems
        : defaultItems;

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const isActive =
      item.view === currentView ||
      (item.view === "skills" && currentView === "skillsDiscovery");
    return (
      <button
        key={item.key}
        type="button"
        onClick={() => (item.view ? onViewChange(item.view) : item.onClick?.())}
        className={cn(
          "group flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors",
          isActive
            ? "bg-sidebar-active text-sidebar-active-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-hover hover:text-sidebar-foreground",
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            isActive
              ? "text-sidebar-active-foreground"
              : "text-sidebar-foreground/50",
          )}
        />
        <span className="min-w-0 truncate">{item.label}</span>
        {item.key === "providers" && isRouteActive && (
          <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-sidebar-active-foreground" />
        )}
      </button>
    );
  };

  return (
    <aside className="flex h-full w-[232px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div
        className="flex h-[72px] shrink-0 items-center gap-3 border-b border-sidebar-border px-4"
        data-tauri-drag-region
        style={{ WebkitAppRegion: "drag" } as CSSProperties}
      >
        <img src={appIcon} alt="" className="h-9 w-9 rounded-md" />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold leading-5">
            StackFerry
          </div>
          <div className="truncate text-[10px] uppercase text-sidebar-foreground/45">
            {t("shell.routeWorkbench")}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold uppercase text-sidebar-foreground/40">
              {t("shell.applications")}
            </span>
          </div>
          <AppSwitcher
            activeApp={activeApp}
            onSwitch={onAppSwitch}
            visibleApps={visibleApps}
          />
        </div>

        <nav aria-label={t("shell.navigation")}>
          <div className="mb-2 px-1 text-[10px] font-semibold uppercase text-sidebar-foreground/40">
            {t("shell.workspace")}
          </div>
          <div className="space-y-1">{coreItems.map(renderNavItem)}</div>
          <div className="my-3 border-t border-sidebar-border" />
          <div className="space-y-1">{featureItems.map(renderNavItem)}</div>
        </nav>
      </div>

      <div className="shrink-0 border-t border-sidebar-border p-3">
        {isRouteActive && (
          <button
            type="button"
            onClick={onOpenUsage}
            className="mb-2 flex h-9 w-full items-center gap-2.5 rounded-md bg-sidebar-active px-2.5 text-left text-xs text-sidebar-foreground hover:bg-sidebar-hover"
          >
            <ChartNoAxesCombined className="h-4 w-4" />
            <span className="truncate">
              {t("usage.title", { defaultValue: "Routing activity" })}
            </span>
            <CircleGauge className="ml-auto h-3.5 w-3.5" />
          </button>
        )}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenSettings}
            className={cn(
              "flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors",
              currentView === "settings"
                ? "bg-sidebar-active text-sidebar-active-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-hover hover:text-sidebar-foreground",
            )}
          >
            <Settings className="h-4 w-4 shrink-0" />
            <span className="truncate">{t("common.settings")}</span>
          </button>
          <UpdateBadge className="rounded-md" onClick={onOpenUpdate} />
        </div>
        <div className="mt-2 flex items-center gap-2 px-2.5 text-[10px] text-sidebar-foreground/35">
          <SlidersHorizontal className="h-3 w-3" />
          <span>v0.1.0</span>
        </div>
      </div>
    </aside>
  );
}
