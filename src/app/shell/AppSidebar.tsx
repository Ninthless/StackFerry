import {
  Bot,
  Bell,
  BookOpen,
  Brain,
  Cable,
  ChartNoAxesCombined,
  CircleGauge,
  FolderTree,
  KeyRound,
  LayoutGrid,
  Puzzle,
  Route,
  Settings,
  ShieldCheck,
  SquareTerminal,
  Wrench,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AppId } from "@/platform/tauri/api";
import { cn } from "@/lib/utils";
import { UpdateBadge } from "@/features/settings/UpdateBadge";
import { AppSwitcher } from "@/shared/common/AppSwitcher";
import type { AppView } from "@/app/shell/types";
import { supportsCapability } from "@/shared/platform/appRegistry";
import type { VisibleApps } from "@/shared/contracts";
import { useAnnouncements } from "@/contexts/AnnouncementContext";

interface AppSidebarProps {
  activeApp: AppId;
  visibleApps: VisibleApps;
  currentView: AppView;
  isRouteActive: boolean;
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
  onAppSwitch,
  onViewChange,
  onOpenHermesWebUI,
  onOpenSettings,
  onOpenUsage,
  onOpenUpdate,
}: AppSidebarProps) {
  const { t } = useTranslation();
  const { feed } = useAnnouncements();
  const hasUnreadAnnouncements = (feed?.unreadCount ?? 0) > 0;

  const coreItems: NavItem[] = [
    {
      key: "providers",
      label: t("provider.title"),
      icon: Route,
      view: "providers",
    },
  ];

  const globalFeatureItems: NavItem[] = [
    {
      key: "skills",
      label: t("skills.title", { defaultValue: "Skills" }),
      icon: Wrench,
      view: "skills",
    },
    {
      key: "prompts",
      label: t("prompts.manage", { defaultValue: "Prompts" }),
      icon: BookOpen,
      view: "prompts",
    },
    {
      key: "sessions",
      label: t("sessionManager.title", { defaultValue: "Sessions" }),
      icon: SquareTerminal,
      view: "sessions",
    },
    {
      key: "mcp",
      label: t("mcp.title", { defaultValue: "MCP servers" }),
      icon: Cable,
      view: "mcp",
    },
    {
      key: "announcements",
      label: t("announcements.title"),
      icon: Bell,
      view: "announcements",
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
  ];

  const hermesItems: NavItem[] = [
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
  ];

  const piItems: NavItem[] = [
    {
      key: "piExtensions",
      label: t("piExtensions.title"),
      icon: Puzzle,
      view: "piExtensions",
    },
  ];

  const routeSpecificItems =
    activeApp === "openclaw"
      ? openClawItems
      : activeApp === "hermes"
        ? hermesItems
        : activeApp === "pi"
          ? piItems
          : [];
  const featureItems = [
    ...globalFeatureItems.filter((item) => {
      if (item.key === "mcp") return supportsCapability(activeApp, "mcp");
      if (item.key === "skills") return supportsCapability(activeApp, "skills");
      if (item.key === "prompts") {
        return supportsCapability(activeApp, "prompts");
      }
      return true;
    }),
    ...routeSpecificItems,
  ];

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
        title={item.label}
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
        {item.key === "announcements" && hasUnreadAnnouncements && (
          <span
            className="ml-auto h-2 w-2 shrink-0 rounded-full bg-red-500 ring-2 ring-sidebar"
            aria-label={t("announcements.unread")}
          />
        )}
      </button>
    );
  };

  return (
    <aside className="flex h-full w-[232px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="shrink-0 border-b border-sidebar-border px-3 py-2.5">
        <AppSwitcher
          activeApp={activeApp}
          onSwitch={onAppSwitch}
          visibleApps={visibleApps}
          variant="sidebar"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
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
      </div>
    </aside>
  );
}
