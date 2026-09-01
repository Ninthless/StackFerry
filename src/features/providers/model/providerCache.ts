import type { QueryClient } from "@tanstack/react-query";
import {
  hermesProviderKeys,
  piProviderKeys,
} from "@/shared/contracts/queryKeys";

export {
  hermesProviderKeys,
  openclawProviderKeys,
  piProviderKeys,
} from "@/shared/contracts/queryKeys";

export function invalidateHermesProviderCaches(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: hermesProviderKeys.liveProviderIds,
    }),
    queryClient.invalidateQueries({
      queryKey: hermesProviderKeys.modelConfig,
    }),
  ]);
}

export async function invalidatePiProviderCaches(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: piProviderKeys.liveProviderIds }),
    queryClient.invalidateQueries({ queryKey: piProviderKeys.defaultProvider }),
  ]);
}
