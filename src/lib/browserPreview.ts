import { isTauri, type InvokeArgs } from "@tauri-apps/api/core";
import type { Provider, Settings, UniversalProvider } from "@/types";
import type { AppId } from "@/lib/api/types";
import { APP_VERSION } from "@/lib/appVersion";

const visibleApps = {
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

export const browserPreviewSettings: Settings = {
  showInTray: true,
  minimizeToTrayOnClose: true,
  useAppWindowControls: true,
  enableClaudePluginIntegration: false,
  skipClaudeOnboarding: false,
  launchOnStartup: false,
  silentStartup: false,
  enableLocalProxy: false,
  enableFailoverToggle: false,
  preserveCodexOfficialAuthOnSwitch: false,
  unifyCodexSessionHistory: false,
  proxyConfirmed: true,
  usageConfirmed: true,
  failoverConfirmed: true,
  firstRunNoticeConfirmed: true,
  autoSyncConfirmed: true,
  commonConfigConfirmed: true,
  language: "zh",
  visibleApps,
  skillSyncMethod: "auto",
  skillStorageLocation: "stack_ferry",
  backupIntervalHours: 24,
  backupRetainCount: 10,
  usageDashboardRefreshIntervalMs: 0,
};

const emptyUsageSummary = {
  totalRequests: 0,
  totalCost: "0",
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCacheCreationTokens: 0,
  totalCacheReadTokens: 0,
  successRate: 0,
  realTotalTokens: 0,
  cacheHitRate: 0,
};

const stoppedProxyStatus = {
  running: false,
  address: "127.0.0.1",
  port: 15721,
  active_connections: 0,
  total_requests: 0,
  success_requests: 0,
  failed_requests: 0,
  success_rate: 0,
  uptime_seconds: 0,
  current_provider: null,
  current_provider_id: null,
  last_request_at: null,
  last_error: null,
  failover_count: 0,
  active_targets: [],
};

const proxyTakeoverStatus = {
  claude: false,
  "claude-desktop": false,
  codex: false,
  gemini: false,
  grokbuild: false,
  pi: false,
  opencode: false,
  openclaw: false,
  hermes: false,
};

const globalProxyConfig = {
  proxyEnabled: false,
  listenAddress: "127.0.0.1",
  listenPort: 15721,
  enableLogging: false,
};

const legacyProxyConfig = {
  listen_address: "127.0.0.1",
  listen_port: 15721,
  max_retries: 3,
  request_timeout: 60,
  enable_logging: false,
  live_takeover_active: false,
  streaming_first_byte_timeout: 30,
  streaming_idle_timeout: 60,
  non_streaming_timeout: 60,
};

const appProxyConfig = (appType: string) => ({
  appType,
  enabled: false,
  autoFailoverEnabled: false,
  maxRetries: 3,
  streamingFirstByteTimeout: 30,
  streamingIdleTimeout: 60,
  nonStreamingTimeout: 60,
  circuitFailureThreshold: 5,
  circuitSuccessThreshold: 2,
  circuitTimeoutSeconds: 60,
  circuitErrorRateThreshold: 0.5,
  circuitMinRequests: 10,
});

const modelsDevSyncState = {
  config: {
    autoSyncEnabled: false,
    includeCommonModels: true,
    selectedModelKeys: [],
    excludedCommonModelKeys: [],
    lastSyncAt: null,
    lastSyncError: null,
  },
  configPath: "C:\\Preview\\StackFerry\\models-dev.json",
};

const cloneSettings = (settings: Settings): Settings => ({
  ...settings,
  visibleApps: settings.visibleApps ? { ...settings.visibleApps } : undefined,
  webdavSync: settings.webdavSync ? { ...settings.webdavSync } : undefined,
  s3Sync: settings.s3Sync ? { ...settings.s3Sync } : undefined,
});

export const createBrowserPreviewCommandHandler = () => {
  let settings = cloneSettings(browserPreviewSettings);
  const providers = Object.fromEntries(
    Object.keys(visibleApps).map((appId) => [appId, {}]),
  ) as Record<AppId, Record<string, Provider>>;
  const currentProviders = Object.fromEntries(
    Object.keys(visibleApps).map((appId) => [appId, ""]),
  ) as Record<AppId, string>;
  const liveProviderIds = Object.fromEntries(
    Object.keys(visibleApps).map((appId) => [appId, [] as string[]]),
  ) as Record<AppId, string[]>;
  const universalProviders: Record<string, UniversalProvider> = {};

  return (command: string, payload: InvokeArgs = {}): unknown => {
    const args = Array.isArray(payload)
      ? {}
      : (payload as Record<string, unknown>);

    switch (command) {
      case "get_init_error":
      case "get_app_config_dir_override":
      case "get_current_prompt_file_content":
      case "get_global_proxy_url":
      case "get_skills_migration_result":
      case "get_request_detail":
      case "read_claude_mcp_config":
        return null;
      case "get_settings":
        return cloneSettings(settings);
      case "save_settings":
        settings = cloneSettings(args.settings as Settings);
        return true;
      case "has_codex_unify_history_backup":
      case "is_portable_mode":
      case "get_auto_launch_status":
      case "is_proxy_running":
      case "is_live_takeover_active":
      case "copilot_is_authenticated":
      case "get_migration_result":
      case "plugin:window|is_fullscreen":
      case "plugin:window|is_maximized":
        return false;
      case "plugin:window|is_decorated":
        return false;
      case "get_config_dir":
        return `C:\\Preview\\${String(args.app ?? "stackferry")}`;
      case "get_app_config_path":
        return "C:\\Preview\\StackFerry\\config.json";
      case "get_claude_code_config_path":
        return "C:\\Preview\\claude\\config.json";
      case "plugin:path|home_dir":
      case "plugin:path|resolve_directory":
        return "C:\\Preview";
      case "plugin:path|join":
        return (args.paths as string[] | undefined)?.join("\\") ?? "";
      case "plugin:app|version":
        return APP_VERSION;
      case "get_providers": {
        const appId = args.app as AppId;
        return { ...providers[appId] };
      }
      case "preview_ccswitch_provider_import":
        return {
          token: "browser-preview-cc-switch",
          sourcePath: "C:\\Users\\Preview\\AppData\\cc-switch\\cc-switch.db",
          sourceVersion: 16,
          items: [
            {
              key: "claude:relay-preview",
              appType: "claude",
              sourceId: "relay-preview",
              name: "Relay Preview",
              endpoint: "https://relay.example/v1",
              modelCount: 3,
              credentialState: "source",
              action: "add",
              selectable: true,
              reason: null,
            },
            {
              key: "codex:team-gateway",
              appType: "codex",
              sourceId: "team-gateway",
              name: "Team Gateway",
              endpoint: "https://codex.example/v1",
              modelCount: 1,
              credentialState: "source",
              action: "update",
              selectable: true,
              reason: null,
            },
            {
              key: "opencode:local-edited",
              appType: "opencode",
              sourceId: "local-edited",
              name: "Local Edited",
              endpoint: "https://opencode.example/v1",
              modelCount: 4,
              credentialState: "missing",
              action: "preserveLocal",
              selectable: false,
              reason: "StackFerry 中的配置已被本地修改",
            },
          ],
          summary: {
            total: 3,
            selectable: 2,
            added: 1,
            updated: 1,
            preserved: 1,
            attached: 0,
            invalid: 0,
          },
          warnings: [],
        };
      case "apply_ccswitch_provider_import": {
        const selection = args.selection as { keys?: string[] } | undefined;
        const keys = selection?.keys ?? [];
        const affectedApps = Array.from(
          new Set(keys.map((key) => key.split(":", 1)[0] as AppId)),
        );
        return {
          imported: keys.length,
          added: keys.filter((key) => key === "claude:relay-preview").length,
          updated: keys.filter((key) => key === "codex:team-gateway").length,
          preserved: 0,
          attached: 0,
          skipped: 0,
          affectedApps,
          warnings: [],
        };
      }
      case "add_provider": {
        const appId = args.app as AppId;
        const provider = args.provider as Provider;
        providers[appId][provider.id] = provider;
        if (args.addToLive === true) {
          liveProviderIds[appId] = Array.from(
            new Set([...liveProviderIds[appId], provider.id]),
          );
        }
        return true;
      }
      case "update_provider": {
        const appId = args.app as AppId;
        const provider = args.provider as Provider;
        const originalId = String(args.originalId ?? provider.id);
        if (originalId !== provider.id) {
          delete providers[appId][originalId];
        }
        providers[appId][provider.id] = provider;
        return true;
      }
      case "delete_provider": {
        const appId = args.app as AppId;
        const providerId = String(args.id);
        delete providers[appId][providerId];
        liveProviderIds[appId] = liveProviderIds[appId].filter(
          (id) => id !== providerId,
        );
        if (currentProviders[appId] === providerId) {
          currentProviders[appId] = "";
        }
        return true;
      }
      case "switch_provider": {
        const appId = args.app as AppId;
        const providerId = String(args.id);
        currentProviders[appId] = providerId;
        liveProviderIds[appId] = Array.from(
          new Set([...liveProviderIds[appId], providerId]),
        );
        return { warnings: [] };
      }
      case "update_providers_sort_order": {
        const appId = args.app as AppId;
        const updates = (args.updates ?? []) as Array<{
          id: string;
          sortIndex: number;
        }>;
        for (const update of updates) {
          const provider = providers[appId][update.id];
          if (provider) {
            providers[appId][update.id] = {
              ...provider,
              sortIndex: update.sortIndex,
            };
          }
        }
        return true;
      }
      case "get_universal_providers":
        return { ...universalProviders };
      case "get_universal_provider":
        return universalProviders[String(args.id)] ?? null;
      case "upsert_universal_provider": {
        const provider = args.provider as UniversalProvider;
        universalProviders[provider.id] = provider;
        return true;
      }
      case "delete_universal_provider":
        delete universalProviders[String(args.id)];
        return true;
      case "sync_universal_provider":
        return true;
      case "get_prompts":
      case "get_mcp_servers":
        return {};
      case "get_pi_mcp_adapter_status":
        return {
          state: "uninstalled",
          configuredVersion: null,
          installedVersion: null,
          configPath: "~/.pi/agent/mcp.json",
          projectOverridePath: null,
          error: null,
          canInstall: true,
          canRepair: false,
          desiredServerCount: 0,
          projectedServerCount: 0,
        };
      case "install_pi_mcp_adapter":
        return {
          installed: true,
          projected: true,
          status: {
            state: "installed",
            configuredVersion: "latest",
            installedVersion: "2.19.0",
            configPath: "~/.pi/agent/mcp.json",
            projectOverridePath: null,
            error: null,
            canInstall: false,
            canRepair: false,
            desiredServerCount: 0,
            projectedServerCount: 0,
          },
          error: null,
        };
      case "get_current_provider":
        return currentProviders[args.app as AppId];
      case "get_current_omo_provider_id":
      case "get_current_omo_slim_provider_id":
        return "";
      case "discover_available_skills":
        return { skills: [], failures: [] };
      case "add_skill_repo": {
        const repo = args.repo as { branch?: string };
        return {
          repo: { ...repo, branch: repo.branch || "main" },
          skillCount: 0,
        };
      }
      case "remove_skill_repo":
        return true;
      case "get_installed_skills":
      case "get_skill_backups":
      case "get_skill_repos":
      case "get_skills":
      case "get_skills_for_app":
      case "scan_unmanaged_skills":
      case "list_sessions":
      case "get_session_messages":
        return [];
      case "get_session_message_page":
        return { items: [], hasMore: false };
      case "get_session_message_content":
        return "";
      case "list_profiles":
      case "list_db_backups":
      case "check_env_conflicts":
      case "scan_openclaw_config_health":
      case "scan_local_proxies":
      case "get_model_pricing":
      case "get_usage_summary_by_app":
      case "get_usage_trends":
      case "get_provider_stats":
      case "get_model_stats":
      case "get_usage_data_sources":
      case "get_available_providers_for_failover":
      case "get_failover_queue":
      case "auth_list_accounts":
      case "copilot_list_accounts":
        return [];
      case "get_opencode_live_provider_ids":
        return [...liveProviderIds.opencode];
      case "get_openclaw_live_provider_ids":
        return [...liveProviderIds.openclaw];
      case "get_hermes_live_provider_ids":
        return [...liveProviderIds.hermes];
      case "get_pi_live_provider_ids":
        return [...liveProviderIds.pi];
      case "get_pi_default_provider":
        return currentProviders.pi || null;
      case "get_pi_extension_inventory":
        return {
          runtime: {
            piDir: "C:\\Preview\\.pi",
            settingsPath: "C:\\Preview\\.pi\\settings.json",
            cliAvailable: true,
            cliPath: "C:\\Preview\\pi.exe",
            cliVersion: "0.31.0",
            mutable: true,
          },
          extensions: [],
          packages: [],
        };
      case "install_pi_package":
        return {
          inventory: {
            runtime: {
              piDir: "C:\\Preview\\.pi",
              settingsPath: "C:\\Preview\\.pi\\settings.json",
              cliAvailable: true,
              cliPath: "C:\\Preview\\pi.exe",
              cliVersion: "0.31.0",
              mutable: true,
            },
            extensions: [],
            packages: [],
          },
          isolatedExtensions: [],
        };
      case "search_pi_packages":
        return {
          items: [],
          total: 0,
          query: String(args.query ?? ""),
          offset: Number(args.offset ?? 0),
          limit: Number(args.limit ?? 12),
        };
      case "get_tool_versions":
        return ((args.tools as string[] | undefined) ?? []).map((name) => ({
          name,
          version: null,
          latest_version: null,
          error: null,
          installed_but_broken: false,
          env_type: "windows",
          wsl_distro: null,
        }));
      case "get_models_dev_sync_config":
        return modelsDevSyncState;
      case "get_proxy_status":
        return stoppedProxyStatus;
      case "get_proxy_takeover_status":
        return proxyTakeoverStatus;
      case "get_global_proxy_config":
        return globalProxyConfig;
      case "get_proxy_config":
        return legacyProxyConfig;
      case "get_proxy_config_for_app":
        return appProxyConfig(String(args.appType ?? "claude"));
      case "get_upstream_proxy_status":
        return { enabled: false, proxyUrl: null };
      case "get_usage_summary":
        return emptyUsageSummary;
      case "get_request_logs":
        return {
          data: [],
          total: 0,
          page: Number(args.page ?? 0),
          pageSize: Number(args.pageSize ?? 20),
        };
      case "get_stream_check_config":
        return { timeoutSecs: 15, maxRetries: 1, degradedThresholdMs: 3000 };
      case "get_rectifier_config":
        return {
          enabled: false,
          requestThinkingSignature: true,
          requestThinkingBudget: true,
          requestMediaFallback: true,
          requestMediaHeuristic: true,
        };
      case "get_optimizer_config":
        return {
          enabled: false,
          thinkingOptimizer: true,
          cacheInjection: true,
        };
      case "get_log_config":
        return { enabled: false, level: "info" };
      case "auth_get_status":
        return {
          provider: args.authProvider,
          authenticated: false,
          default_account_id: null,
          migration_error: null,
          accounts: [],
        };
      case "copilot_get_auth_status":
        return { authenticated: false, username: null };
      case "get_claude_mcp_status":
        return { exists: false, path: null, serverCount: 0 };
      case "get_mcp_config":
        return { servers: {}, raw: null };
      case "get_claude_desktop_status":
        return { installed: false, configExists: false };
      case "get_claude_desktop_default_routes":
        return [];
      case "get_default_cost_multiplier":
        return "1";
      case "get_pricing_model_source":
        return "response";
      case "get_circuit_breaker_config":
        return {
          failureThreshold: 5,
          successThreshold: 2,
          timeoutSeconds: 60,
          errorRateThreshold: 0.5,
          minRequests: 10,
        };
      case "get_auto_failover_enabled":
        return false;
      case "probe_tool_installations":
        return [];
      case "webdav_sync_fetch_remote_info":
      case "s3_sync_fetch_remote_info":
        return { empty: true };
      case "queryProviderUsage":
        return { success: false, error: null };
      case "restore_codex_unified_history":
        return { restoredJsonlFiles: 0, restoredStateRows: 0 };
      case "sync_session_usage":
      case "rebuild_codex_usage":
        return {
          imported: 0,
          skipped: 0,
          filesScanned: 0,
          suspectedDuplicates: 0,
          deferredFiles: 0,
          errors: [],
        };
      case "set_window_theme":
      case "set_auto_launch":
      case "set_app_config_dir_override":
      case "update_global_proxy_config":
      case "update_proxy_config":
      case "update_proxy_config_for_app":
      case "save_stream_check_config":
      case "set_rectifier_config":
      case "set_optimizer_config":
      case "set_log_config":
      case "save_models_dev_sync_config":
      case "record_models_dev_sync_result":
      case "sync_current_providers_live":
      case "copy_text_to_clipboard":
      case "plugin:window|close":
      case "plugin:window|minimize":
      case "plugin:window|set_decorations":
      case "plugin:window|toggle_maximize":
        return true;
      default:
        console.warn(`[browser-preview] Missing IPC response: ${command}`);
        return null;
    }
  };
};

export async function installBrowserPreview(): Promise<void> {
  if (!import.meta.env.DEV || isTauri()) return;

  const { mockIPC, mockWindows } = await import("@tauri-apps/api/mocks");
  mockWindows("main");
  mockIPC(createBrowserPreviewCommandHandler(), { shouldMockEvents: true });
}
