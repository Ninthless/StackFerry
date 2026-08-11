import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  piExtensionsApi,
  type PiExtensionInventory,
} from "@/lib/api/piExtensions";

export const piExtensionKeys = {
  all: ["piExtensions"] as const,
  inventory: ["piExtensions", "inventory"] as const,
  search: (query: string, limit: number) =>
    ["piExtensions", "search", query, limit] as const,
};

const useInventoryMutation = <TVariables>(
  mutationFn: (variables: TVariables) => Promise<PiExtensionInventory>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (inventory) => {
      queryClient.setQueryData(piExtensionKeys.inventory, inventory);
      queryClient.invalidateQueries({
        queryKey: ["piExtensions", "search"],
      });
    },
  });
};

export function usePiExtensionInventory() {
  return useQuery({
    queryKey: piExtensionKeys.inventory,
    queryFn: () => piExtensionsApi.getInventory(),
  });
}

export function useSearchPiPackages(query: string, limit: number) {
  return useInfiniteQuery({
    queryKey: piExtensionKeys.search(query, limit),
    queryFn: ({ pageParam }) =>
      piExtensionsApi.searchPackages({ query, offset: pageParam, limit }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.limit;
      return nextOffset < lastPage.total ? nextOffset : undefined;
    },
    enabled: query.trim().length >= 2,
  });
}

export function useRegisterPiLocalExtension() {
  return useInventoryMutation((path: string) =>
    piExtensionsApi.registerLocalExtension(path),
  );
}

export function useUnregisterPiLocalExtension() {
  return useInventoryMutation((path: string) =>
    piExtensionsApi.unregisterLocalExtension(path),
  );
}

export function useInstallPiPackage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (source: string) => piExtensionsApi.installPackage(source),
    onSuccess: (result) => {
      queryClient.setQueryData(piExtensionKeys.inventory, result.inventory);
      queryClient.invalidateQueries({
        queryKey: ["piExtensions", "search"],
      });
    },
  });
}

export function useRemovePiPackage() {
  return useInventoryMutation((source: string) =>
    piExtensionsApi.removePackage(source),
  );
}

export function useSetPiExtensionEnabled() {
  return useInventoryMutation(
    ({ id, enabled }: { id: string; enabled: boolean }) =>
      piExtensionsApi.setExtensionEnabled(id, enabled),
  );
}
