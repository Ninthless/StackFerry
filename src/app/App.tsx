import { useEffect, useMemo, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { Provider, VisibleApps } from "@/shared/contracts";
import type { EnvConflict } from "@/shared/contracts/env";
import { useProvidersQuery } from "@/features/providers/model/queries";
import { useSettingsQuery } from "@/features/providers/model/queries";
import {
  providersApi,
  settingsApi,
  migrationsApi,
  type AppId,
  type ProviderSwitchEvent,
} from "@/platform/tauri/api";
import {
  checkAllEnvConflicts,
  checkEnvConflicts,
} from "@/platform/tauri/api/env";
import { useProviderActions } from "@/features/providers/model/useProviderActions";
import {
  openclawKeys,
  useOpenClawHealth,
} from "@/features/openclaw/model/useOpenClaw";
import {
  hermesKeys,
  useOpenHermesWebUI,
} from "@/features/hermes/model/useHermes";
import { piKeys } from "@/features/pi/model/usePi";
import { useProxyStatus } from "@/features/proxy/model/useProxyStatus";
import { useUsageCacheBridge } from "@/features/usage/model/useUsageCacheBridge";
import { useTauriEvent } from "@/platform/tauri/react/useTauriEvent";
import { useLastValidValue } from "@/shared/hooks/useLastValidValue";
import { usePersistedAppPreference } from "@/app/hooks/usePersistedAppPreference";
import { useScanUnmanagedSkills } from "@/features/skills/model/useSkills";
import { extractErrorMessage } from "@/shared/lib/errorUtils";
import { deepClone } from "@/shared/lib/deepClone";
import { EnvWarningBanner } from "@/features/env/EnvWarningBanner";
import {
  type PromptPanelHandle,
  type PromptPageState,
} from "@/features/prompts/PromptPanel";
import { type SkillsPageSource } from "@/features/skills/SkillsPage";
import type { SkillsWorkbenchHandle } from "@/features/skills/SkillsWorkbench";
import type { UnifiedMcpPanelHandle } from "@/features/mcp/UnifiedMcpPanel";
import type { InstalledSkillsPageState } from "@/features/skills/UnifiedSkillsPanel";
import {
  useDisableCurrentOmo,
  useDisableCurrentOmoSlim,
} from "@/features/providers/model/omo";
import OpenClawHealthBanner from "@/features/openclaw/OpenClawHealthBanner";
import { type PiExtensionsPageState } from "@/features/pi/PiExtensionsPanel";
import { AppSidebar } from "@/app/shell/AppSidebar";
import { PageHeader } from "@/app/shell/PageHeader";
import type { AppView } from "@/app/shell/types";
import { PROMPT_APP_IDS, SKILLS_APP_IDS } from "@/shared/platform/appRegistry";
import { invalidateDatabaseState } from "@/platform/tauri/query/invalidateDatabaseState";
import { AnnouncementBanner } from "@/features/announcements/AnnouncementBanner";
import {
  AppHeaderActions,
  getAppHeaderOverflowActions,
  getAppViewContext,
  getAppViewTitle,
  type AppHeaderProps,
} from "@/app/shell/AppHeader";
import { AppViewRenderer } from "@/app/shell/AppViewRenderer";
import {
  AppOverlays,
  type ProviderConfirmAction,
  type RuntimeEnvironmentTarget,
} from "@/app/overlays/AppOverlays";
import {
  getInitialApp,
  getInitialView,
  isViewCompatibleWithApp,
  VIEW_STORAGE_KEY,
} from "./navigation";
import { useAppKeyboardNavigation } from "./hooks/useAppKeyboardNavigation";

interface SyncStatusUpdatedPayload {
  source?: string;
  status?: string;
  error?: string;
}

const PROMPT_APP_STORAGE_KEY = "stackferry.prompts.app";
const LEGACY_SKILLS_TARGET_APP_STORAGE_KEY = "stackferry.skills.targetApp";
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
  const [runtimeEnvironmentTarget, setRuntimeEnvironmentTarget] =
    useState<RuntimeEnvironmentTarget | null>(null);
  const [sessionInstanceId, setSessionInstanceId] = useState<string | null>(
    null,
  );
  const [confirmAction, setConfirmAction] =
    useState<ProviderConfirmAction | null>(null);
  const [envConflicts, setEnvConflicts] = useState<EnvConflict[]>([]);
  const [showEnvBanner, setShowEnvBanner] = useState(false);

  const effectiveEditingProvider = useLastValidValue(editingProvider);
  const effectiveUsageProvider = useLastValidValue(usageProvider);

  useUsageCacheBridge();

  const promptPanelRef = useRef<PromptPanelHandle>(null);
  const mcpPanelRef = useRef<UnifiedMcpPanelHandle>(null);
  const skillsPageRef = useRef<SkillsWorkbenchHandle>(null);
  const unifiedSkillsPanelRef = useRef<SkillsWorkbenchHandle>(null);
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

  useTauriEvent("proxy-runtime-provider-changed", async () => {
    await queryClient.invalidateQueries({ queryKey: ["proxyStatus"] });
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
        const migrated = await migrationsApi.getConfigMigrationResult();
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
        const result = await migrationsApi.getSkillsMigrationResult();
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

  useAppKeyboardNavigation(currentView, setCurrentView);

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

  const handleLaunchProvider = async (provider: Provider) => {
    try {
      const cwd = await settingsApi.pickDirectory();
      if (!cwd) return;
      await providersApi.openTerminal(provider.id, activeApp, { cwd });
      toast.success(t("provider.terminalOpened"));
    } catch (error) {
      toast.error(
        extractErrorMessage(error) || t("provider.terminalOpenFailed"),
      );
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

  const headerProps: AppHeaderProps = {
    t,
    currentView,
    activeApp,
    enableLocalProxy: Boolean(settingsData?.enableLocalProxy),
    enableFailoverToggle: Boolean(settingsData?.enableFailoverToggle),
    promptApp,
    availablePromptApps,
    promptPageState,
    piExtensionsPageState,
    installedSkillsPageState,
    skillsDiscoverySource,
    hasUnmanagedSkills,
    promptPanelRef,
    mcpPanelRef,
    skillsPageRef,
    skillsWorkbenchRef: unifiedSkillsPanelRef,
    onPromptAppChange: handlePromptAppChange,
    onPromptPageStateChange: setPromptPageState,
    onPiExtensionsPageStateChange: setPiExtensionsPageState,
    onInstalledSkillsPageStateChange: setInstalledSkillsPageState,
    onViewChange: setCurrentView,
    onAddProvider: () => setIsAddOpen(true),
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
              title={getAppViewTitle(headerProps)}
              context={getAppViewContext(t, currentView)}
              actions={<AppHeaderActions {...headerProps} />}
              overflowActions={getAppHeaderOverflowActions(headerProps)}
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
            <AppViewRenderer
              currentView={currentView}
              activeApp={activeApp}
              providers={providers}
              currentProviderId={currentProviderId}
              activeProviderId={activeProviderId}
              isLoading={isLoading}
              isProxyRunning={isProxyRunning}
              isCurrentAppTakeoverActive={isCurrentAppTakeoverActive}
              promptApp={promptApp}
              availableSkillsApps={availableSkillsApps}
              promptPageState={promptPageState}
              piExtensionsPageState={piExtensionsPageState}
              installedSkillsPageState={installedSkillsPageState}
              sessionInstanceId={sessionInstanceId}
              requestedAnnouncementId={requestedAnnouncementId}
              settingsDefaultTab={settingsDefaultTab}
              promptPanelRef={promptPanelRef}
              mcpPanelRef={mcpPanelRef}
              skillsPageRef={skillsPageRef}
              skillsWorkbenchRef={unifiedSkillsPanelRef}
              onViewChange={setCurrentView}
              onOpenUpdate={() => {
                setSettingsDefaultTab("about");
                setCurrentView("settings");
              }}
              onImportSuccess={handleImportSuccess}
              onPromptPageStateChange={setPromptPageState}
              onPiExtensionsPageStateChange={setPiExtensionsPageState}
              onInstalledSkillsPageStateChange={setInstalledSkillsPageState}
              onSkillsSourceChange={setSkillsDiscoverySource}
              onSessionInstanceApplied={() => setSessionInstanceId(null)}
              onSwitchProvider={switchProvider}
              onEditProvider={setEditingProvider}
              onDeleteProvider={(provider) =>
                setConfirmAction({ provider, action: "delete" })
              }
              onRemoveProvider={(provider) =>
                setConfirmAction({ provider, action: "remove" })
              }
              onDisableOmo={handleDisableOmo}
              onDisableOmoSlim={handleDisableOmoSlim}
              onDuplicateProvider={handleDuplicateProvider}
              onConfigureUsage={setUsageProvider}
              onOpenWebsite={handleOpenWebsite}
              onOpenTerminal={handleLaunchProvider}
              onManageRuntimeEnvironments={(provider) =>
                setRuntimeEnvironmentTarget({ appId: activeApp, provider })
              }
              onCreateProvider={() => setIsAddOpen(true)}
              onSetAsDefault={
                activeApp === "openclaw"
                  ? setAsDefaultModel
                  : activeApp === "hermes" || activeApp === "pi"
                    ? switchProvider
                    : undefined
              }
            />
          </main>
        </section>
      </div>

      <AppOverlays
        t={t}
        activeApp={activeApp}
        isAddOpen={isAddOpen}
        editingProvider={editingProvider}
        effectiveEditingProvider={effectiveEditingProvider}
        usageProvider={usageProvider}
        effectiveUsageProvider={effectiveUsageProvider}
        runtimeEnvironmentTarget={runtimeEnvironmentTarget}
        confirmAction={confirmAction}
        launchDashboardOpen={launchDashboardOpen}
        isCurrentAppTakeoverActive={isCurrentAppTakeoverActive}
        onAddOpenChange={setIsAddOpen}
        onEditingProviderChange={setEditingProvider}
        onUsageProviderChange={setUsageProvider}
        onRuntimeEnvironmentTargetChange={setRuntimeEnvironmentTarget}
        onConfirmActionChange={setConfirmAction}
        onLaunchDashboardOpenChange={setLaunchDashboardOpen}
        onSettingsDefaultTabChange={setSettingsDefaultTab}
        onViewChange={setCurrentView}
        onSessionInstanceIdChange={setSessionInstanceId}
        onAddProvider={addProvider}
        onEditProvider={handleEditProvider}
        onSaveUsageScript={saveUsageScript}
        onConfirmAction={handleConfirmAction}
      />
    </div>
  );
}

export default App;
