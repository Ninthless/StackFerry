import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usageKeys } from "@/features/usage";
import { runtimeApi } from "@/platform/tauri/api";

/**
 * 监听后端 `usage-log-recorded` 事件，合并短时间内的多次写入后刷新
 * UsageDashboard，避免日志导入期间重复启动统计查询。
 *
 * 后端在 `proxy_request_logs` 写入新行时会 emit 该事件（200ms 防抖合并），
 * 来源覆盖代理日志、Claude/Codex/Gemini 会话同步、启动归档。
 *
 * 该 hook 只挂在 UsageDashboard 上，避免在主界面其他位置无意义触发。
 */
export function useUsageEventBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshPending = false;
    let refreshInFlight = false;

    const flushRefresh = async () => {
      refreshTimer = undefined;
      if (disposed || !refreshPending || refreshInFlight) return;

      refreshPending = false;
      refreshInFlight = true;
      try {
        await queryClient.invalidateQueries(
          { queryKey: usageKeys.all },
          { cancelRefetch: false },
        );
      } finally {
        refreshInFlight = false;
        if (!disposed && refreshPending) {
          refreshTimer = setTimeout(() => void flushRefresh(), 300);
        }
      }
    };

    const scheduleRefresh = () => {
      refreshPending = true;
      if (refreshTimer || refreshInFlight) return;
      refreshTimer = setTimeout(() => void flushRefresh(), 300);
    };

    (async () => {
      const off = await runtimeApi.listen(
        "usage-log-recorded",
        scheduleRefresh,
      );

      if (disposed) {
        off();
      } else {
        unlisten = off;
      }
    })();

    return () => {
      disposed = true;
      refreshPending = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      unlisten?.();
    };
  }, [queryClient]);
}
