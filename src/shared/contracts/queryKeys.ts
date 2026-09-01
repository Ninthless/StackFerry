import type {
  LogFilters,
  UsageRangeSelection,
  UsageScopeFilters,
} from "@/shared/contracts/usage";
import type {
  AppId,
  SessionProviderId,
  SessionScope,
} from "@/platform/tauri/api";

type RequestLogsKey = {
  preset: UsageRangeSelection["preset"];
  customStartDate?: number;
  customEndDate?: number;
  liveEndTime?: boolean;
  appType?: string;
  providerName?: string;
  model?: string;
  statusCode?: number;
  failureKind?: string;
};

export const usageKeys = {
  all: ["usage"] as const,
  summary: (
    preset: UsageRangeSelection["preset"],
    customStartDate: number | undefined,
    customEndDate: number | undefined,
    filters?: UsageScopeFilters,
    liveEndTime?: boolean,
  ) =>
    [
      ...usageKeys.all,
      "summary",
      preset,
      customStartDate ?? 0,
      customEndDate ?? 0,
      liveEndTime ?? false,
      filters?.appType ?? null,
      filters?.providerName ?? null,
      filters?.model ?? null,
    ] as const,
  summaryByApp: (
    preset: UsageRangeSelection["preset"],
    customStartDate: number | undefined,
    customEndDate: number | undefined,
    filters?: Pick<UsageScopeFilters, "providerName" | "model">,
    liveEndTime?: boolean,
  ) =>
    [
      ...usageKeys.all,
      "summary-by-app",
      preset,
      customStartDate ?? 0,
      customEndDate ?? 0,
      liveEndTime ?? false,
      filters?.providerName ?? null,
      filters?.model ?? null,
    ] as const,
  trends: (
    preset: UsageRangeSelection["preset"],
    customStartDate: number | undefined,
    customEndDate: number | undefined,
    filters?: UsageScopeFilters,
    liveEndTime?: boolean,
  ) =>
    [
      ...usageKeys.all,
      "trends",
      preset,
      customStartDate ?? 0,
      customEndDate ?? 0,
      liveEndTime ?? false,
      filters?.appType ?? null,
      filters?.providerName ?? null,
      filters?.model ?? null,
    ] as const,
  providerStats: (
    preset: UsageRangeSelection["preset"],
    customStartDate: number | undefined,
    customEndDate: number | undefined,
    filters?: UsageScopeFilters,
    liveEndTime?: boolean,
  ) =>
    [
      ...usageKeys.all,
      "provider-stats",
      preset,
      customStartDate ?? 0,
      customEndDate ?? 0,
      liveEndTime ?? false,
      filters?.appType ?? null,
      filters?.providerName ?? null,
      filters?.model ?? null,
    ] as const,
  modelStats: (
    preset: UsageRangeSelection["preset"],
    customStartDate: number | undefined,
    customEndDate: number | undefined,
    filters?: UsageScopeFilters,
    liveEndTime?: boolean,
  ) =>
    [
      ...usageKeys.all,
      "model-stats",
      preset,
      customStartDate ?? 0,
      customEndDate ?? 0,
      liveEndTime ?? false,
      filters?.appType ?? null,
      filters?.providerName ?? null,
      filters?.model ?? null,
    ] as const,
  logs: (key: RequestLogsKey, page: number, pageSize: number) =>
    [
      ...usageKeys.all,
      "logs",
      key.preset,
      key.customStartDate ?? 0,
      key.customEndDate ?? 0,
      key.liveEndTime ?? false,
      key.appType ?? "",
      key.providerName ?? "",
      key.model ?? "",
      key.statusCode ?? -1,
      key.failureKind ?? "",
      page,
      pageSize,
    ] as const,
  logFacets: (
    range: UsageRangeSelection,
    filters: Pick<LogFilters, "appType" | "providerName" | "model">,
  ) =>
    [
      ...usageKeys.all,
      "log-facets",
      range.preset,
      range.customStartDate ?? 0,
      range.customEndDate ?? 0,
      range.liveEndTime ?? false,
      filters.appType ?? "",
      filters.providerName ?? "",
      filters.model ?? "",
    ] as const,
  detail: (requestId: string) =>
    [...usageKeys.all, "detail", requestId] as const,
  pricing: () => [...usageKeys.all, "pricing"] as const,
  limits: (providerId: string, appType: string) =>
    [...usageKeys.all, "limits", providerId, appType] as const,
  script: (providerId: string, appType: string) =>
    [...usageKeys.all, providerId, appType] as const,
};

export const providerKeys = {
  all: ["providers"] as const,
  byApp: (appId: AppId) => [...providerKeys.all, appId] as const,
};

export const settingsKeys = {
  all: ["settings"] as const,
};

export const sessionKeys = {
  lists: (providerId: SessionProviderId) => ["sessions", providerId] as const,
  list: (providerId: SessionProviderId, scope: SessionScope) =>
    ["sessions", providerId, scope] as const,
  messages: (providerId?: string, instanceId?: string, sourcePath?: string) =>
    ["sessionMessages", providerId, instanceId, sourcePath] as const,
};

export const subscriptionKeys = {
  all: ["subscription"] as const,
  quota: (appId: AppId) => [...subscriptionKeys.all, "quota", appId] as const,
};

export const openclawProviderKeys = {
  liveProviderIds: ["openclaw", "liveProviderIds"] as const,
  defaultModel: ["openclaw", "defaultModel"] as const,
  health: ["openclaw", "health"] as const,
};

export const hermesProviderKeys = {
  liveProviderIds: ["hermes", "liveProviderIds"] as const,
  modelConfig: ["hermes", "modelConfig"] as const,
};

export const piProviderKeys = {
  liveProviderIds: ["pi", "liveProviderIds"] as const,
  defaultProvider: ["pi", "defaultProvider"] as const,
};
