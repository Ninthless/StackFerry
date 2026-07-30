import { isTauri, type InvokeArgs } from "@tauri-apps/api/core";
import type { Settings } from "@/types";

const visibleApps = {
  claude: true,
  "claude-desktop": true,
  codex: true,
  gemini: true,
  grokbuild: true,
  opencode: true,
  openclaw: true,
  hermes: true,
};

export const browserPreviewSettings: Settings = {
  showInTray: true,
  minimizeToTrayOnClose: true,
  useAppWindowControls: false,
  enableClaudePluginIntegration: false,
  skipClaudeOnboarding: false,
  launchOnStartup: false,
  silentStartup: false,
  enableLocalProxy: false,
  enableFailoverToggle: false,
  showProfileSwitcher: true,
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
      case "plugin:window|is_maximized":
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
        return "0.1.0";
      case "get_providers":
      case "get_universal_providers":
      case "get_prompts":
      case "get_mcp_servers":
        return {};
      case "get_current_provider":
      case "get_current_omo_provider_id":
      case "get_current_omo_slim_provider_id":
        return "";
      case "get_installed_skills":
      case "get_skill_backups":
      case "get_skill_repos":
      case "get_skills":
      case "get_skills_for_app":
      case "discover_available_skills":
      case "scan_unmanaged_skills":
      case "list_sessions":
      case "get_session_messages":
      case "list_profiles":
      case "list_db_backups":
      case "check_env_conflicts":
      case "scan_local_proxies":
      case "get_model_pricing":
      case "get_usage_summary_by_app":
      case "get_usage_trends":
      case "get_provider_stats":
      case "get_model_stats":
      case "get_usage_data_sources":
      case "get_available_providers_for_failover":
      case "get_failover_queue":
      case "get_opencode_live_provider_ids":
      case "get_openclaw_live_provider_ids":
      case "get_hermes_live_provider_ids":
      case "auth_list_accounts":
      case "copilot_list_accounts":
        return [];
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
      case "plugin:window|set_decorations":
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
