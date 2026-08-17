import { useEffect, useMemo, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  ArrowLeft,
  History,
  Download,
  FolderArchive,
  Search,
  FolderOpen,
} from "lucide-react";
import type { Provider, VisibleApps } from "@/types";
import type { EnvConflict } from "@/types/env";
import { useProvidersQuery, useSettingsQuery } from "@/lib/query";
import {
  providersApi,
  settingsApi,
  type AppId,
  type ProviderSwitchEvent,
} from "@/lib/api";
import { checkAllEnvConflicts, checkEnvConflicts } from "@/lib/api/env";
import { useProviderActions } from "@/hooks/useProviderActions";
import { openclawKeys, useOpenClawHealth } from "@/hooks/useOpenClaw";
import { hermesKeys, useOpenHermesWebUI } from "@/hooks/useHermes";
import { piKeys } from "@/hooks/usePi";
import { hermesApi } from "@/lib/api/hermes";
import { useProxyStatus } from "@/hooks/useProxyStatus";
import { useUsageCacheBridge } from "@/hooks/useUsageCacheBridge";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import { useLastValidValue } from "@/hooks/useLastValidValue";
import { usePersistedAppPreference } from "@/hooks/usePersistedAppPreference";
import { useScanUnmanagedSkills } from "@/hooks/useSkills";
import { extractErrorMessage } from "@/utils/errorUtils";
import { isTextEditableTarget } from "@/utils/domUtils";
import { deepClone } from "@/utils/deepClone";
import { ProfileSwitcher } from "@/components/profiles/ProfileSwitcher";
import { ProviderList } from "@/components/providers/ProviderList";
import { AgentInstancesDialog } from "@/components/providers/AgentInstancesDialog";
import { CcSwitchImportButton } from "@/components/providers/CcSwitchImportButton";
import { AddProviderDialog } from "@/components/providers/AddProviderDialog";
import { EditProviderDialog } from "@/components/providers/EditProviderDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { EnvWarningBanner } from "@/components/env/EnvWarningBanner";
import { ProxyToggle } from "@/components/proxy/ProxyToggle";
import { ClaudeDesktopRouteToggle } from "@/components/proxy/ClaudeDesktopRouteToggle";
import { FailoverToggle } from "@/components/proxy/FailoverToggle";
import UsageScriptModal from "@/components/UsageScriptModal";
import UnifiedMcpPanel from "@/components/mcp/UnifiedMcpPanel";
import PromptPanel, {
  type PromptPageState,
} from "@/components/prompts/PromptPanel";
import {
  getSkillsPageHeaderActions,
  type SkillsPageSource,
} from "@/components/skills/SkillsPage";
import SkillsWorkbench from "@/components/skills/SkillsWorkbench";
import type { InstalledSkillsPageState } from "@/components/skills/UnifiedSkillsPanel";
import { DeepLinkImportDialog } from "@/components/DeepLinkImportDialog";
import { FirstRunNoticeDialog } from "@/components/FirstRunNoticeDialog";
import { Button } from "@/components/ui/button";
import { SessionManagerPage } from "@/components/sessions/SessionManagerPage";
import {
  useDisableCurrentOmo,
  useDisableCurrentOmoSlim,
} from "@/lib/query/omo";
import WorkspaceFilesPanel from "@/components/workspace/WorkspaceFilesPanel";
import EnvPanel from "@/components/openclaw/EnvPanel";
import ToolsPanel from "@/components/openclaw/ToolsPanel";
import AgentsDefaultsPanel from "@/components/openclaw/AgentsDefaultsPanel";
import OpenClawHealthBanner from "@/components/openclaw/OpenClawHealthBanner";
import HermesMemoryPanel from "@/components/hermes/HermesMemoryPanel";
import PiExtensionsPanel, {
  type PiExtensionsPageState,
} from "@/components/pi/PiExtensionsPanel";
import { AppSelect } from "@/components/common/AppSelect";
import { AppSidebar } from "@/components/shell/AppSidebar";
import {
  PageHeader,
  type PageHeaderOverflowAction,
} from "@/components/shell/PageHeader";
import type { AppView } from "@/components/shell/types";
import { PROMPT_APP_IDS, SKILLS_APP_IDS } from "@/config/appConfig";
import { invalidateDatabaseState } from "@/lib/query/invalidateDatabaseState";
import { AnnouncementCenter } from "@/components/announcements/AnnouncementCenter";
import { AnnouncementBanner } from "@/components/announcements/AnnouncementBanner";
import { CriticalAnnouncementDialog } from "@/components/announcements/CriticalAnnouncementDialog";

interface SyncStatusUpdatedPayload {
  source?: string;
  status?: string;
  error?: string;
}

const STORAGE_KEY = "stackferry-last-app";
const PROMPT_APP_STORAGE_KEY = "stackferry.prompts.app";
const LEGACY_SKILLS_TARGET_APP_STORAGE_KEY = "stackferry.skills.targetApp";
const VALID_APPS: AppId[] = [
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

const getInitialApp = (): AppId => {
  const saved = localStorage.getItem(STORAGE_KEY) as AppId | null;
  if (saved && VALID_APPS.includes(saved)) {
    return saved;
  }
  return "claude";
};

const VIEW_STORAGE_KEY = "stackferry-last-view";
const VALID_VIEWS: AppView[] = [
  "providers",
  "announcements",
  "settings",
  "prompts",
  "skills",
  "skillsDiscovery",
  "mcp",
  "sessions",
  "workspace",
  "openclawEnv",
  "openclawTools",
  "openclawAgents",
  "hermesMemory",
  "piExtensions",
];

const isViewCompatibleWithApp = (view: AppView, appId: AppId): boolean => {
  if (
    view === "workspace" ||
    view === "openclawEnv" ||
    view === "openclawTools" ||
    view === "openclawAgents"
  ) {
    return appId === "openclaw";
  }

  if (view === "hermesMemory") {
    return appId === "hermes";
  }

  if (view === "piExtensions") {
    return appId === "pi";
  }

  return true;
};

const getInitialView = (appId: AppId): AppView => {
  const saved = localStorage.getItem(VIEW_STORAGE_KEY) as AppView | null;
  if (
    saved &&
    VALID_VIEWS.includes(saved) &&
    isViewCompatibleWithApp(saved, appId)
  ) {
    return saved;
  }
  return "providers";
};

function App() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [activeApp, setActiveApp] = useState<AppId>(getInitialApp);
  const [currentView, setCurrentView] = useState<AppView>(() =>
    getInitialView(activeApp),
  );
  const [skillsDiscoverySource, setSkillsDiscoverySource] =
    useState<SkillsPageSource>("repos");
  const [settingsDefaultTab, setSettingsDefaultTab] = useState("general");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [promptPageState, setPromptPageState] = useState<PromptPageState>({
    mode: "list",
  });
  const [piExtensionsPageState, setPiExtensionsPageState] =
    useState<PiExtensionsPageState>({ mode: "list" });
  const [installedSkillsPageState, setInstalledSkillsPageState] =
    useState<InstalledSkillsPageState>({ mode: "list" });
  const [requestedAnnouncementId, setRequestedAnnouncementId] = useState<
    string | null
  >(null);

  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, currentView);
  }, [currentView]);

  useEffect(() => {
    if (!isViewCompatibleWithApp(currentView, activeApp)) {
      setCurrentView("providers");
    }
  }, [activeApp, currentView]);

  useEffect(() => {
    if (
      currentView !== "piExtensions" &&
      piExtensionsPageState.mode !== "list"
    ) {
      setPiExtensionsPageState({ mode: "list" });
    }
  }, [currentView, piExtensionsPageState.mode]);

  useEffect(() => {
    if (currentView !== "skills" && installedSkillsPageState.mode !== "list") {
      setInstalledSkillsPageState({ mode: "list" });
    }
  }, [currentView, installedSkillsPageState.mode]);

  const { data: settingsData } = useSettingsQuery();
  const visibleApps: VisibleApps = settingsData?.visibleApps ?? {
    claude: true,
    "claude-desktop": true,
    codex: true,
    pi: true,
    gemini: true,
    grokbuild: true,
    opencode: true,
    openclaw: true,
    hermes: true,
  };
  const availablePromptApps = useMemo(() => {
    const apps = PROMPT_APP_IDS.filter((app) => visibleApps[app]);
    return apps.length > 0 ? apps : (["claude"] as AppId[]);
  }, [visibleApps]);
  const [promptApp, setPromptApp] = usePersistedAppPreference(
    PROMPT_APP_STORAGE_KEY,
    availablePromptApps,
  );

  const handlePromptAppChange = (app: AppId) => {
    promptPanelRef.current?.closeEditor();
    setPromptPageState({ mode: "list" });
    setPromptApp(app);
  };
  const availableSkillsApps = useMemo(() => {
    const apps = SKILLS_APP_IDS.filter((app) => visibleApps[app]);
    return apps.length > 0 ? apps : (["claude"] as AppId[]);
  }, [visibleApps]);

  useEffect(() => {
    localStorage.removeItem(LEGACY_SKILLS_TARGET_APP_STORAGE_KEY);
  }, []);

  const getFirstVisibleApp = (): AppId => {
    if (visibleApps.claude) return "claude";
    if (visibleApps["claude-desktop"]) return "claude-desktop";
    if (visibleApps.codex) return "codex";
    if (visibleApps.pi) return "pi";
    if (visibleApps.gemini) return "gemini";
    if (visibleApps.grokbuild) return "grokbuild";
    if (visibleApps.opencode) return "opencode";
    if (visibleApps.openclaw) return "openclaw";
    if (visibleApps.hermes) return "hermes";
    return "claude"; // fallback
  };

  useEffect(() => {
    if (!visibleApps[activeApp]) {
      setActiveApp(getFirstVisibleApp());
    }
  }, [visibleApps, activeApp]);

  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [usageProvider, setUsageProvider] = useState<Provider | null>(null);
  const [instanceProvider, setInstanceProvider] = useState<Provider | null>(
    null,
  );
  const [confirmAction, setConfirmAction] = useState<{
    provider: Provider;
    action: "remove" | "delete";
  } | null>(null);
  const [envConflicts, setEnvConflicts] = useState<EnvConflict[]>([]);
  const [showEnvBanner, setShowEnvBanner] = useState(false);

  const effectiveEditingProvider = useLastValidValue(editingProvider);
  const effectiveUsageProvider = useLastValidValue(usageProvider);

  useUsageCacheBridge();

  const promptPanelRef = useRef<any>(null);
  const mcpPanelRef = useRef<any>(null);
  const skillsPageRef = useRef<any>(null);
  const unifiedSkillsPanelRef = useRef<any>(null);
  // 订阅未管理 Skill 的共享缓存（实际扫描由 UnifiedSkillsPanel 进入页面时触发）。
  // 这里 enabled 默认 false，仅用于「导入」按钮的绿点提示，不主动发起扫描。
  const { data: unmanagedSkills } = useScanUnmanagedSkills();
  const hasUnmanagedSkills = (unmanagedSkills?.length ?? 0) > 0;

  const {
    isRunning: isProxyRunning,
    takeoverStatus,
    status: proxyStatus,
  } = useProxyStatus();
  const isCurrentAppTakeoverActive = takeoverStatus?.[activeApp] || false;
  const activeProviderId = useMemo(() => {
    const target = proxyStatus?.active_targets?.find(
      (t) => t.app_type === activeApp,
    );
    return target?.provider_id;
  }, [proxyStatus?.active_targets, activeApp]);

  const { data, isLoading } = useProvidersQuery(activeApp, {
    isProxyRunning,
    enabled: currentView === "providers",
  });
  const providers = useMemo(() => data?.providers ?? {}, [data]);
  const currentProviderId = data?.currentProviderId ?? "";
  const isOpenClawView =
    activeApp === "openclaw" &&
    (currentView === "providers" ||
      currentView === "workspace" ||
      currentView === "openclawEnv" ||
      currentView === "openclawTools" ||
      currentView === "openclawAgents");
  const { data: openclawHealthWarningsData } =
    useOpenClawHealth(isOpenClawView);
  const openclawHealthWarnings = openclawHealthWarningsData ?? [];
  const {
    addProvider,
    updateProvider,
    switchProvider,
    deleteProvider,
    saveUsageScript,
    setAsDefaultModel,
  } = useProviderActions(
    activeApp,
    isProxyRunning,
    isProxyRunning && isCurrentAppTakeoverActive,
  );

  const disableOmoMutation = useDisableCurrentOmo();
  const handleDisableOmo = () => {
    disableOmoMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success(t("omo.disabled", { defaultValue: "OMO 已停用" }));
      },
      onError: (error: Error) => {
        toast.error(
          t("omo.disableFailed", {
            defaultValue: "停用 OMO 失败: {{error}}",
            error: extractErrorMessage(error),
          }),
        );
      },
    });
  };

  const disableOmoSlimMutation = useDisableCurrentOmoSlim();
  const handleDisableOmoSlim = () => {
    disableOmoSlimMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success(t("omo.disabled", { defaultValue: "OMO 已停用" }));
      },
      onError: (error: Error) => {
        toast.error(
          t("omo.disableFailed", {
            defaultValue: "停用 OMO 失败: {{error}}",
            error: extractErrorMessage(error),
          }),
        );
      },
    });
  };

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let active = true;

    const setupListener = async () => {
      try {
        const off = await providersApi.onSwitched(
          async (event: ProviderSwitchEvent) => {
            await queryClient.invalidateQueries({
              queryKey: ["providers", event.appType],
            });
          },
        );
        if (!active) {
          off();
          return;
        }
        unsubscribe = off;
      } catch (error) {
        console.error("[App] Failed to subscribe provider switch event", error);
      }
    };

    void setupListener();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [queryClient]);

  useTauriEvent("universal-provider-synced", async () => {
    await queryClient.invalidateQueries({ queryKey: ["providers"] });
    try {
      await providersApi.updateTrayMenu();
    } catch (error) {
      console.error("[App] Failed to update tray menu", error);
    }
  });

  // 应用项目后刷新相关缓存（providers 由既有 provider-switched 监听承接；
  // proxy 状态由后端直接改 DB，不走 mutation，必须显式刷新）
  useTauriEvent("profile-applied", async () => {
    await queryClient.invalidateQueries({ queryKey: ["profiles"] });
    await queryClient.invalidateQueries({ queryKey: ["mcp", "all"] });
    await queryClient.invalidateQueries({ queryKey: ["skills"] });
    await queryClient.invalidateQueries({ queryKey: ["proxyTakeoverStatus"] });
    await queryClient.invalidateQueries({ queryKey: ["proxyStatus"] });
    await queryClient.invalidateQueries({
      queryKey: ["providers", "claude-desktop"],
    });
  });

  useTauriEvent<SyncStatusUpdatedPayload | null | undefined>(
    "webdav-sync-status-updated",
    async (payload) => {
      const statusPayload = payload ?? {};
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      if (statusPayload.source !== "auto" || statusPayload.status !== "error") {
        return;
      }
      toast.error(
        t("settings.webdavSync.autoSyncFailedToast", {
          error: statusPayload.error || t("common.unknown"),
        }),
      );
    },
  );

  useTauriEvent<SyncStatusUpdatedPayload | null | undefined>(
    "s3-sync-status-updated",
    async (payload) => {
      const statusPayload = payload ?? {};
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      if (statusPayload.source !== "auto" || statusPayload.status !== "error") {
        return;
      }
      toast.error(
        t("settings.s3Sync.autoSyncFailedToast", {
          error: statusPayload.error || t("common.unknown"),
        }),
      );
    },
  );

  useTauriEvent<{ appType: string; providerName: string }>(
    "proxy-official-warning",
    (payload) => {
      toast.warning(
        t("notifications.proxyOfficialWarning", {
          name: payload.providerName,
          defaultValue: `当前供应商 ${payload.providerName} 是官方供应商，建议切换到第三方供应商后再使用代理接管`,
        }),
        { duration: 8000 },
      );
    },
  );

  useEffect(() => {
    const checkEnvOnStartup = async () => {
      try {
        const allConflicts = await checkAllEnvConflicts();
        const flatConflicts = Object.values(allConflicts).flat();

        if (flatConflicts.length > 0) {
          setEnvConflicts(flatConflicts);
          const dismissed = sessionStorage.getItem("env_banner_dismissed");
          if (!dismissed) {
            setShowEnvBanner(true);
          }
        }
      } catch (error) {
        console.error(
          "[App] Failed to check environment conflicts on startup:",
          error,
        );
      }
    };

    checkEnvOnStartup();
  }, []);

  useEffect(() => {
    const checkMigration = async () => {
      try {
        const migrated = await invoke<boolean>("get_migration_result");
        if (migrated) {
          toast.success(
            t("migration.success", { defaultValue: "配置迁移成功" }),
            { closeButton: true },
          );
        }
      } catch (error) {
        console.error("[App] Failed to check migration result:", error);
      }
    };

    checkMigration();
  }, [t]);

  useEffect(() => {
    const checkSkillsMigration = async () => {
      try {
        const result = await invoke<{ count: number; error?: string } | null>(
          "get_skills_migration_result",
        );
        if (result?.error) {
          toast.error(t("migration.skillsFailed"), {
            description: t("migration.skillsFailedDescription"),
            closeButton: true,
          });
          console.error("[App] Skills SSOT migration failed:", result.error);
          return;
        }
        if (result && result.count > 0) {
          toast.success(t("migration.skillsSuccess", { count: result.count }), {
            closeButton: true,
          });
          await queryClient.invalidateQueries({ queryKey: ["skills"] });
        }
      } catch (error) {
        console.error("[App] Failed to check skills migration result:", error);
      }
    };

    checkSkillsMigration();
  }, [t, queryClient]);

  useEffect(() => {
    const checkEnvOnSwitch = async () => {
      try {
        const conflicts = await checkEnvConflicts(activeApp);

        if (conflicts.length > 0) {
          setEnvConflicts((prev) => {
            const existingKeys = new Set(
              prev.map((c) => `${c.varName}:${c.sourcePath}`),
            );
            const newConflicts = conflicts.filter(
              (c) => !existingKeys.has(`${c.varName}:${c.sourcePath}`),
            );
            return [...prev, ...newConflicts];
          });
          const dismissed = sessionStorage.getItem("env_banner_dismissed");
          if (!dismissed) {
            setShowEnvBanner(true);
          }
        }
      } catch (error) {
        console.error(
          "[App] Failed to check environment conflicts on app switch:",
          error,
        );
      }
    };

    checkEnvOnSwitch();
  }, [activeApp]);

  const currentViewRef = useRef(currentView);

  useEffect(() => {
    currentViewRef.current = currentView;
  }, [currentView]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "," && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCurrentView("settings");
        return;
      }

      if (event.key !== "Escape" || event.defaultPrevented) return;

      if (document.body.style.overflow === "hidden") return;

      const view = currentViewRef.current;
      if (view === "providers") return;

      if (isTextEditableTarget(event.target)) return;

      event.preventDefault();
      setCurrentView(view === "skillsDiscovery" ? "skills" : "providers");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const [launchDashboardOpen, setLaunchDashboardOpen] = useState(false);
  const openHermesWebUI = useOpenHermesWebUI(() =>
    setLaunchDashboardOpen(true),
  );

  const handleOpenWebsite = async (url: string) => {
    try {
      await settingsApi.openExternal(url);
    } catch (error) {
      const detail =
        extractErrorMessage(error) ||
        t("notifications.openLinkFailed", {
          defaultValue: "链接打开失败",
        });
      toast.error(detail);
    }
  };

  const handleEditProvider = async ({
    provider,
    originalId,
  }: {
    provider: Provider;
    originalId?: string;
  }) => {
    await updateProvider(provider, originalId);
    setEditingProvider(null);
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    const { provider, action } = confirmAction;

    if (action === "remove") {
      // Remove from live config only (for additive mode apps like OpenCode/OpenClaw)
      // Does NOT delete from database - provider remains in the list
      await providersApi.removeFromLiveConfig(provider.id, activeApp);
      // Invalidate queries to refresh the isInConfig state
      if (activeApp === "opencode") {
        await queryClient.invalidateQueries({
          queryKey: ["opencodeLiveProviderIds"],
        });
      } else if (activeApp === "openclaw") {
        await queryClient.invalidateQueries({
          queryKey: openclawKeys.liveProviderIds,
        });
        await queryClient.invalidateQueries({
          queryKey: openclawKeys.health,
        });
      } else if (activeApp === "hermes") {
        await queryClient.invalidateQueries({
          queryKey: hermesKeys.liveProviderIds,
        });
      } else if (activeApp === "pi") {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: piKeys.liveProviderIds }),
          queryClient.invalidateQueries({ queryKey: piKeys.defaultProvider }),
        ]);
      }
      toast.success(
        t("notifications.removeFromConfigSuccess", {
          defaultValue: "已从配置移除",
        }),
        { closeButton: true },
      );
    } else {
      await deleteProvider(provider.id);
    }
    setConfirmAction(null);
  };

  const generateUniqueProviderCopyKey = (
    originalKey: string,
    existingKeys: string[],
  ): string => {
    const baseKey = `${originalKey}-copy`;

    if (!existingKeys.includes(baseKey)) {
      return baseKey;
    }

    let counter = 2;
    while (existingKeys.includes(`${baseKey}-${counter}`)) {
      counter++;
    }
    return `${baseKey}-${counter}`;
  };

  const handleDuplicateProvider = async (provider: Provider) => {
    const newSortIndex =
      provider.sortIndex !== undefined ? provider.sortIndex + 1 : undefined;

    const duplicatedProvider: Omit<Provider, "id" | "createdAt"> & {
      providerKey?: string;
      addToLive?: boolean;
    } = {
      name: `${provider.name} copy`,
      settingsConfig: deepClone(provider.settingsConfig),
      websiteUrl: provider.websiteUrl,
      category: provider.category,
      sortIndex: newSortIndex, // 复制原 sortIndex + 1
      meta: provider.meta ? deepClone(provider.meta) : undefined,
      icon: provider.icon,
      iconColor: provider.iconColor,
    };

    if (
      activeApp === "opencode" ||
      activeApp === "openclaw" ||
      activeApp === "hermes" ||
      activeApp === "pi"
    ) {
      let liveProviderIds: string[] = [];
      try {
        liveProviderIds =
          activeApp === "opencode"
            ? await queryClient.ensureQueryData({
                queryKey: ["opencodeLiveProviderIds"],
                queryFn: () => providersApi.getOpenCodeLiveProviderIds(),
              })
            : activeApp === "openclaw"
              ? await queryClient.ensureQueryData({
                  queryKey: openclawKeys.liveProviderIds,
                  queryFn: () => providersApi.getOpenClawLiveProviderIds(),
                })
              : activeApp === "hermes"
                ? await queryClient.ensureQueryData({
                    queryKey: hermesKeys.liveProviderIds,
                    queryFn: () => providersApi.getHermesLiveProviderIds(),
                  })
                : await queryClient.ensureQueryData({
                    queryKey: piKeys.liveProviderIds,
                    queryFn: () => providersApi.getPiLiveProviderIds(),
                  });
      } catch (error) {
        console.error(
          "[App] Failed to load live provider IDs for duplication",
          error,
        );
        const errorMessage = extractErrorMessage(error);
        toast.error(
          t("provider.duplicateLiveIdsLoadFailed", {
            defaultValue: "读取配置中的供应商标识失败，请先修复配置后再试",
          }) + (errorMessage ? `: ${errorMessage}` : ""),
        );
        return;
      }
      const existingKeys = Array.from(
        new Set([...Object.keys(providers), ...liveProviderIds]),
      );
      duplicatedProvider.providerKey = generateUniqueProviderCopyKey(
        provider.id,
        existingKeys,
      );
      duplicatedProvider.addToLive = false;
    }

    if (provider.sortIndex !== undefined) {
      const updates = Object.values(providers)
        .filter(
          (p) =>
            p.sortIndex !== undefined &&
            p.sortIndex >= newSortIndex! &&
            p.id !== provider.id,
        )
        .map((p) => ({
          id: p.id,
          sortIndex: p.sortIndex! + 1,
        }));

      if (updates.length > 0) {
        try {
          await providersApi.updateSortOrder(updates, activeApp);
        } catch (error) {
          console.error("[App] Failed to update sort order", error);
          toast.error(
            t("provider.sortUpdateFailed", {
              defaultValue: "排序更新失败",
            }),
          );
          return; // 如果排序更新失败，不继续添加
        }
      }
    }

    await addProvider(duplicatedProvider);
  };

  const handleImportSuccess = async () => {
    try {
      await invalidateDatabaseState(queryClient);
    } catch (error) {
      console.error("[App] Failed to refresh imported data", error);
    }
    try {
      await providersApi.updateTrayMenu();
    } catch (error) {
      console.error("[App] Failed to refresh tray menu", error);
    }
  };

  const handleAppSwitch = (app: AppId) => {
    setActiveApp(app);
    setCurrentView("providers");
  };

  const getViewTitle = () => {
    switch (currentView) {
      case "providers":
        return t("provider.title");
      case "announcements":
        return t("announcements.title");
      case "settings":
        return t("settings.title");
      case "prompts":
        if (promptPageState.mode === "create") {
          return t("prompts.addTitle", { appName: t(`apps.${promptApp}`) });
        }
        if (promptPageState.mode === "edit") {
          return promptPageState.name;
        }
        return t("prompts.manage");
      case "skills":
        if (installedSkillsPageState.mode === "detail") {
          return installedSkillsPageState.name;
        }
        return t("skills.title");
      case "skillsDiscovery":
        return t("skills.title");
      case "mcp":
        return t("mcp.unifiedPanel.title");
      case "sessions":
        return t("sessionManager.title");
      case "workspace":
        return t("workspace.title");
      case "openclawEnv":
        return t("openclaw.env.title");
      case "openclawTools":
        return t("openclaw.tools.title");
      case "openclawAgents":
        return t("openclaw.agents.title");
      case "hermesMemory":
        return t("hermes.memory.title");
      case "piExtensions":
        if (piExtensionsPageState.mode === "detail") {
          return piExtensionsPageState.name;
        }
        return t("piExtensions.title");
    }
  };

  const getViewContext = () => {
    if (currentView === "providers") {
      return undefined;
    }
    if (currentView === "settings") {
      return t("settings.description");
    }
    return undefined;
  };

  const renderHeaderActions = () => {
    if (currentView === "providers") {
      return (
        <>
          {activeApp !== "opencode" &&
            activeApp !== "openclaw" &&
            activeApp !== "hermes" && (
              <div className="flex shrink-0 items-center gap-2">
                {activeApp === "claude-desktop" ? (
                  <ClaudeDesktopRouteToggle />
                ) : (
                  settingsData?.enableLocalProxy && (
                    <ProxyToggle activeApp={activeApp} />
                  )
                )}
                {activeApp !== "claude-desktop" &&
                  settingsData?.enableFailoverToggle && (
                    <FailoverToggle activeApp={activeApp} />
                  )}
              </div>
            )}
          <span className="page-header-secondary-action">
            <CcSwitchImportButton appId={activeApp} />
          </span>
          <span className="page-header-secondary-action">
            <ProfileSwitcher activeApp={activeApp} />
          </span>
          <Button type="button" size="sm" onClick={() => setIsAddOpen(true)}>
            <Plus className="h-4 w-4" />
            <span>{t("provider.addProvider")}</span>
          </Button>
        </>
      );
    }

    if (currentView === "prompts") {
      if (promptPageState.mode !== "list") {
        return (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setPromptPageState({ mode: "list" });
              promptPanelRef.current?.closeEditor();
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{t("common.back")}</span>
          </Button>
        );
      }
      return (
        <>
          <AppSelect
            value={promptApp}
            appIds={availablePromptApps}
            onValueChange={handlePromptAppChange}
            ariaLabel={t("prompts.selectApplication")}
          />
          <Button
            type="button"
            size="sm"
            onClick={() => setPromptPageState({ mode: "create" })}
          >
            <Plus className="h-4 w-4" />
            <span>{t("prompts.add")}</span>
          </Button>
        </>
      );
    }

    if (
      currentView === "piExtensions" &&
      piExtensionsPageState.mode === "detail"
    ) {
      return (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPiExtensionsPageState({ mode: "list" })}
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t("common.back")}</span>
        </Button>
      );
    }

    if (
      currentView === "skills" &&
      installedSkillsPageState.mode === "detail"
    ) {
      return (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setInstalledSkillsPageState({ mode: "list" })}
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t("common.back")}</span>
        </Button>
      );
    }

    if (currentView === "mcp") {
      return (
        <Button
          type="button"
          size="sm"
          onClick={() => mcpPanelRef.current?.openAdd()}
        >
          <Plus className="h-4 w-4" />
          <span>{t("mcp.addMcp")}</span>
        </Button>
      );
    }

    if (currentView === "skills") {
      return (
        <Button
          type="button"
          size="sm"
          onClick={() => unifiedSkillsPanelRef.current?.openDiscovery()}
        >
          <Search className="h-4 w-4" />
          <span>{t("skills.discover")}</span>
        </Button>
      );
    }

    if (currentView === "skillsDiscovery") {
      return (
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setCurrentView("skills")}
          title={t("common.back", { defaultValue: "Back" })}
          aria-label={t("common.back", { defaultValue: "Back" })}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      );
    }

    return null;
  };

  const getHeaderOverflowActions = (): PageHeaderOverflowAction[] => {
    if (currentView === "providers") {
      return [
        ...(activeApp === "codex"
          ? [
              {
                key: "import-cc-switch",
                label: t("provider.importFromCcSwitch"),
                icon: <Download className="h-4 w-4" />,
                onSelect: () => {
                  const button = document.querySelector<HTMLButtonElement>(
                    '[data-header-action="import-cc-switch"]',
                  );
                  button?.click();
                },
              },
            ]
          : []),
        ...(activeApp === "claude" ||
        activeApp === "claude-desktop" ||
        activeApp === "codex"
          ? [
              {
                key: "open-profile-switcher",
                label: t("profiles.manage"),
                icon: <FolderOpen className="h-4 w-4" />,
                onSelect: () => {
                  const button = document.querySelector<HTMLButtonElement>(
                    '[data-header-action="profile-switcher"]',
                  );
                  button?.click();
                },
              },
            ]
          : []),
      ];
    }

    if (currentView === "mcp") {
      return [
        {
          key: "import-mcp",
          label: t("mcp.importExisting"),
          icon: <Download className="h-4 w-4" />,
          onSelect: () => mcpPanelRef.current?.openImport(),
        },
      ];
    }

    if (currentView === "skills") {
      return [
        {
          key: "restore-skills",
          label: t("skills.restoreFromBackup.button"),
          icon: <History className="h-4 w-4" />,
          onSelect: () =>
            unifiedSkillsPanelRef.current?.openRestoreFromBackup(),
        },
        {
          key: "install-skills-zip",
          label: t("skills.installFromZip.button"),
          icon: <FolderArchive className="h-4 w-4" />,
          onSelect: () => unifiedSkillsPanelRef.current?.openInstallFromZip(),
        },
        {
          key: "import-skills",
          label: t("skills.import"),
          icon: <Download className="h-4 w-4" />,
          onSelect: () => unifiedSkillsPanelRef.current?.openImport(),
          indicator: hasUnmanagedSkills,
        },
      ];
    }

    if (currentView === "skillsDiscovery") {
      return getSkillsPageHeaderActions(skillsDiscoverySource).map(
        ({ key, labelKey, Icon, execute }) => ({
          key,
          label: t(labelKey),
          icon: <Icon className="h-4 w-4" />,
          onSelect: () => execute(skillsPageRef.current),
        }),
      );
    }

    return [];
  };

  const renderContent = () => {
    const content = (() => {
      switch (currentView) {
        case "announcements":
          return (
            <AnnouncementCenter
              requestedAnnouncementId={requestedAnnouncementId}
              onOpenUpdate={() => {
                setSettingsDefaultTab("about");
                setCurrentView("settings");
              }}
            />
          );
        case "settings":
          return (
            <SettingsPage
              open={true}
              onOpenChange={() => setCurrentView("providers")}
              onImportSuccess={handleImportSuccess}
              defaultTab={settingsDefaultTab}
            />
          );
        case "prompts":
          return (
            <PromptPanel
              key={promptApp}
              ref={promptPanelRef}
              appId={promptApp}
              requestedMode={promptPageState.mode}
              onPageStateChange={setPromptPageState}
            />
          );
        case "hermesMemory":
          return <HermesMemoryPanel />;
        case "piExtensions":
          return (
            <PiExtensionsPanel
              requestedMode={piExtensionsPageState.mode}
              onPageStateChange={setPiExtensionsPageState}
            />
          );
        case "skills":
          return (
            <SkillsWorkbench
              ref={unifiedSkillsPanelRef}
              initialTab="installed"
              availableApps={availableSkillsApps}
              onSourceChange={setSkillsDiscoverySource}
              requestedMode={installedSkillsPageState.mode}
              onPageStateChange={setInstalledSkillsPageState}
            />
          );
        case "skillsDiscovery":
          return (
            <SkillsWorkbench
              ref={skillsPageRef}
              initialTab="discover"
              availableApps={availableSkillsApps}
              onSourceChange={setSkillsDiscoverySource}
            />
          );
        case "mcp":
          return <UnifiedMcpPanel ref={mcpPanelRef} activeApp={activeApp} />;

        case "sessions":
          return <SessionManagerPage />;
        case "workspace":
          return <WorkspaceFilesPanel />;
        case "openclawEnv":
          return <EnvPanel />;
        case "openclawTools":
          return <ToolsPanel />;
        case "openclawAgents":
          return <AgentsDefaultsPanel />;
        default:
          return (
            <div className="px-6 flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto overflow-x-hidden pb-12 px-1">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeApp}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-4"
                  >
                    <ProviderList
                      providers={providers}
                      currentProviderId={currentProviderId}
                      appId={activeApp}
                      isLoading={isLoading}
                      isProxyRunning={isProxyRunning}
                      isProxyTakeover={
                        isProxyRunning && isCurrentAppTakeoverActive
                      }
                      activeProviderId={activeProviderId}
                      onSwitch={switchProvider}
                      onEdit={(provider) => {
                        setEditingProvider(provider);
                      }}
                      onDelete={(provider) =>
                        setConfirmAction({ provider, action: "delete" })
                      }
                      onRemoveFromConfig={
                        activeApp === "opencode" ||
                        activeApp === "openclaw" ||
                        activeApp === "hermes" ||
                        activeApp === "pi"
                          ? (provider) =>
                              setConfirmAction({ provider, action: "remove" })
                          : undefined
                      }
                      onDisableOmo={
                        activeApp === "opencode" ? handleDisableOmo : undefined
                      }
                      onDisableOmoSlim={
                        activeApp === "opencode"
                          ? handleDisableOmoSlim
                          : undefined
                      }
                      onDuplicate={handleDuplicateProvider}
                      onConfigureUsage={setUsageProvider}
                      onOpenWebsite={handleOpenWebsite}
                      onOpenTerminal={
                        activeApp === "claude" || activeApp === "codex"
                          ? setInstanceProvider
                          : undefined
                      }
                      onCreate={() => setIsAddOpen(true)}
                      onSetAsDefault={
                        activeApp === "openclaw"
                          ? setAsDefaultModel
                          : activeApp === "hermes"
                            ? switchProvider
                            : activeApp === "pi"
                              ? switchProvider
                              : undefined
                      }
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          );
      }
    })();

    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={currentView}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {content}
        </motion.div>
      </AnimatePresence>
    );
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-foreground selection:bg-primary/20">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <AppSidebar
          activeApp={activeApp}
          visibleApps={visibleApps}
          currentView={currentView}
          isRouteActive={isProxyRunning && isCurrentAppTakeoverActive}
          onAppSwitch={handleAppSwitch}
          onViewChange={setCurrentView}
          onOpenHermesWebUI={() => void openHermesWebUI()}
          onOpenSettings={() => {
            setSettingsDefaultTab("general");
            setCurrentView("settings");
          }}
          onOpenUsage={() => {
            setSettingsDefaultTab("usage");
            setCurrentView("settings");
          }}
          onOpenUpdate={() => {
            setSettingsDefaultTab("about");
            setCurrentView("settings");
          }}
        />

        <section
          className="workbench-container flex min-w-0 flex-1 flex-col overflow-hidden bg-workspace"
          data-workbench-container
          data-current-view={currentView}
          data-page-mode={
            currentView === "skills"
              ? installedSkillsPageState.mode
              : currentView === "prompts"
                ? promptPageState.mode
                : currentView === "piExtensions"
                  ? piExtensionsPageState.mode
                  : undefined
          }
        >
          {currentView !== "settings" && (
            <PageHeader
              title={getViewTitle()}
              context={getViewContext()}
              actions={renderHeaderActions()}
              overflowActions={getHeaderOverflowActions()}
              overflowLabel={t("shell.moreActions")}
              compactOverflowOnly={currentView === "providers"}
            />
          )}

          {showEnvBanner && envConflicts.length > 0 && (
            <EnvWarningBanner
              conflicts={envConflicts}
              onDismiss={() => {
                setShowEnvBanner(false);
                sessionStorage.setItem("env_banner_dismissed", "true");
              }}
              onDeleted={async () => {
                try {
                  const allConflicts = await checkAllEnvConflicts();
                  const flatConflicts = Object.values(allConflicts).flat();
                  setEnvConflicts(flatConflicts);
                  if (flatConflicts.length === 0) {
                    setShowEnvBanner(false);
                  }
                } catch (error) {
                  console.error(
                    "[App] Failed to re-check conflicts after deletion:",
                    error,
                  );
                }
              }}
            />
          )}

          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {currentView !== "announcements" && (
              <AnnouncementBanner
                onOpen={(id) => {
                  setRequestedAnnouncementId(id);
                  setCurrentView("announcements");
                }}
              />
            )}
            {isOpenClawView && openclawHealthWarnings.length > 0 && (
              <OpenClawHealthBanner warnings={openclawHealthWarnings} />
            )}
            {renderContent()}
          </main>
        </section>
      </div>

      <AddProviderDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        appId={activeApp}
        onSubmit={addProvider}
      />
      <CriticalAnnouncementDialog
        onOpenUpdate={() => {
          setSettingsDefaultTab("about");
          setCurrentView("settings");
        }}
      />

      <EditProviderDialog
        open={Boolean(editingProvider)}
        provider={effectiveEditingProvider}
        onOpenChange={(open) => {
          if (!open) {
            setEditingProvider(null);
          }
        }}
        onSubmit={handleEditProvider}
        appId={activeApp}
        isProxyTakeover={isCurrentAppTakeoverActive}
      />

      <AgentInstancesDialog
        open={Boolean(instanceProvider)}
        appId={activeApp}
        provider={instanceProvider}
        onOpenChange={(open) => {
          if (!open) setInstanceProvider(null);
        }}
      />

      {effectiveUsageProvider && (
        <UsageScriptModal
          key={effectiveUsageProvider.id}
          provider={effectiveUsageProvider}
          appId={activeApp}
          isOpen={Boolean(usageProvider)}
          onClose={() => setUsageProvider(null)}
          onSave={(script) => {
            if (usageProvider) {
              void saveUsageScript(usageProvider, script);
            }
          }}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(confirmAction)}
        title={
          confirmAction?.action === "remove"
            ? t("confirm.removeProvider")
            : t("confirm.deleteProvider")
        }
        message={
          confirmAction
            ? confirmAction.action === "remove"
              ? t("confirm.removeProviderMessage", {
                  name: confirmAction.provider.name,
                })
              : t("confirm.deleteProviderMessage", {
                  name: confirmAction.provider.name,
                })
            : ""
        }
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        isOpen={launchDashboardOpen}
        title={t("hermes.webui.launchConfirmTitle")}
        message={t("hermes.webui.launchConfirmMessage")}
        confirmText={t("hermes.webui.launchConfirmAction")}
        variant="info"
        onConfirm={() => {
          setLaunchDashboardOpen(false);
          void (async () => {
            try {
              await hermesApi.launchDashboard();
              toast.success(t("hermes.webui.launching"));
            } catch (error) {
              toast.error(t("hermes.webui.launchFailed"), {
                description: extractErrorMessage(error) || undefined,
              });
            }
          })();
        }}
        onCancel={() => setLaunchDashboardOpen(false)}
      />

      <DeepLinkImportDialog />
      <FirstRunNoticeDialog />
    </div>
  );
}

export default App;
