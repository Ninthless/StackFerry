import {
  keepPreviousData,
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
  search: (query: string, offset: number, limit: number) =>
    ["piExtensions", "search", query, offset, limit] as const,
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

export function useSearchPiPackages(
  query: string,
  offset: number,
  limit: number,
) {
  return useQuery({
    queryKey: piExtensionKeys.search(query, offset, limit),
    queryFn: () => piExtensionsApi.searchPackages({ query, offset, limit }),
    enabled: query.trim().length > 0,
    placeholderData: keepPreviousData,
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
  return useInventoryMutation((source: string) =>
    piExtensionsApi.installPackage(source),
  );
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
