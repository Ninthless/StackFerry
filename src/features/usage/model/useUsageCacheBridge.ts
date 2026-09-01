import { useQueryClient } from "@tanstack/react-query";
import type { AppId } from "@/platform/tauri/api/types";
import type { UsageResult } from "@/shared/contracts";
import type { SubscriptionQuota } from "@/shared/contracts/subscription";
import { usageKeys } from "@/features/usage";
import { subscriptionKeys } from "@/features/usage/model/subscription";
import { useTauriEvent } from "@/platform/tauri/react/useTauriEvent";

type UsageCacheUpdatedPayload =
  | {
      kind: "script";
      appType: AppId;
      providerId: string;
      data: UsageResult;
    }
  | {
      kind: "subscription";
      appType: AppId;
      data: SubscriptionQuota;
    };

/**
 * 后端 `UsageCache` 写入后会 emit `usage-cache-updated`，本 hook 把 payload 同步到
 * React Query 缓存，让托盘触发的刷新（不经前端）也能立刻反映到主界面，避免
 * React Query 与 Rust 侧两份缓存各自为战。
 */
export function useUsageCacheBridge() {
  const queryClient = useQueryClient();

  useTauriEvent<UsageCacheUpdatedPayload>("usage-cache-updated", (payload) => {
    if (payload.kind === "script") {
      queryClient.setQueryData<UsageResult>(
        usageKeys.script(payload.providerId, payload.appType),
        payload.data,
      );
    } else if (payload.kind === "subscription") {
      queryClient.setQueryData<SubscriptionQuota>(
        subscriptionKeys.quota(payload.appType),
        payload.data,
      );
    }
  });
}
