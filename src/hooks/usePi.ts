import { useQuery, type QueryClient } from "@tanstack/react-query";
import { providersApi } from "@/lib/api/providers";

export const piKeys = {
  all: ["pi"] as const,
  liveProviderIds: ["pi", "liveProviderIds"] as const,
  defaultProvider: ["pi", "defaultProvider"] as const,
};

export function usePiLiveProviderIds(enabled: boolean) {
  return useQuery({
    queryKey: piKeys.liveProviderIds,
    queryFn: () => providersApi.getPiLiveProviderIds(),
    enabled,
  });
}

export function usePiDefaultProvider(enabled: boolean) {
  return useQuery({
    queryKey: piKeys.defaultProvider,
    queryFn: () => providersApi.getPiDefaultProvider(),
    enabled,
  });
}

export async function invalidatePiProviderCaches(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: piKeys.liveProviderIds }),
    queryClient.invalidateQueries({ queryKey: piKeys.defaultProvider }),
  ]);
}
