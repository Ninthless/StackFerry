import type { QueryClient } from "@tanstack/react-query";

const DATABASE_QUERY_ROOTS = new Set([
  "settings",
  "providers",
  "profiles",
  "mcp",
  "skills",
  "sessions",
  "sessionMessages",
  "usage",
  "subscription",
  "codex_oauth",
  "xai_oauth",
  "copilot",
  "db-backups",
  "proxyConfig",
  "globalProxyConfig",
  "appProxyConfig",
  "proxyStatus",
  "proxyTakeoverStatus",
  "proxyRunning",
  "liveTakeoverActive",
  "globalProxyUrl",
  "upstreamProxyStatus",
  "providerHealth",
  "circuitBreakerStats",
  "circuitBreakerConfig",
  "failoverQueue",
  "availableProvidersForFailover",
  "autoFailoverEnabled",
  "opencodeLiveProviderIds",
  "openclaw",
  "hermes",
  "pi",
  "omo",
  "omo-slim",
  "claudeDesktopStatus",
  "claudeDesktopDefaultRoutes",
  "models-dev-sync-config",
]);

export function invalidateDatabaseState(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: (query) => {
      const root = query.queryKey[0];
      return typeof root === "string" && DATABASE_QUERY_ROOTS.has(root);
    },
  });
}
