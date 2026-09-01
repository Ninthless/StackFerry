import { useQuery } from "@tanstack/react-query";
import { providersApi } from "@/platform/tauri/api/providers";
import {
  invalidatePiProviderCaches,
  piProviderKeys,
} from "@/features/providers";

export const piKeys = {
  all: ["pi"] as const,
  liveProviderIds: piProviderKeys.liveProviderIds,
  defaultProvider: piProviderKeys.defaultProvider,
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

export { invalidatePiProviderCaches };
