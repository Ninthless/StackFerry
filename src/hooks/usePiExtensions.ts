import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  piExtensionsApi,
  type PiExtensionTarget,
  type PiExtensionInventory,
  type PiScopeTarget,
} from "@/lib/api/piExtensions";

export const piExtensionKeys = {
  all: ["piExtensions"] as const,
  inventory: (projectDir?: string) =>
    ["piExtensions", "inventory", projectDir ?? null] as const,
  search: (query: string, limit: number) =>
    ["piExtensions", "search", query, limit] as const,
};

const useInventoryMutation = <TVariables>(
  mutationFn: (variables: TVariables) => Promise<PiExtensionInventory>,
  projectDir?: string,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (inventory) => {
      queryClient.setQueryData(
        piExtensionKeys.inventory(projectDir),
        inventory,
      );
      queryClient.invalidateQueries({
        queryKey: ["piExtensions", "search"],
      });
    },
  });
};

export function usePiExtensionInventory(projectDir?: string) {
  return useQuery({
    queryKey: piExtensionKeys.inventory(projectDir),
    queryFn: () => piExtensionsApi.getInventory(projectDir),
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

export function useRegisterPiLocalExtension(projectDir?: string) {
  return useInventoryMutation(
    ({ path, target }: { path: string; target: PiScopeTarget }) =>
      piExtensionsApi.registerLocalExtension(path, target),
    projectDir,
  );
}

export function useUnregisterPiLocalExtension(projectDir?: string) {
  return useInventoryMutation(
    (target: PiExtensionTarget) =>
      piExtensionsApi.unregisterLocalExtension(target),
    projectDir,
  );
}

export function useInstallPiPackage(projectDir?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      source,
      target,
    }: {
      source: string;
      target: PiScopeTarget;
    }) => piExtensionsApi.installPackage(source, target),
    onSuccess: (result) => {
      queryClient.setQueryData(
        piExtensionKeys.inventory(projectDir),
        result.inventory,
      );
      queryClient.invalidateQueries({
        queryKey: ["piExtensions", "search"],
      });
    },
  });
}

export function useRemovePiPackage(projectDir?: string) {
  return useInventoryMutation(
    (target: PiExtensionTarget) => piExtensionsApi.removePackage(target),
    projectDir,
  );
}

export function useSetPiExtensionEnabled(projectDir?: string) {
  return useInventoryMutation(
    ({ target, enabled }: { target: PiExtensionTarget; enabled: boolean }) =>
      piExtensionsApi.setExtensionEnabled(target, enabled),
    projectDir,
  );
}

export function useTrustPiProject(projectDir?: string) {
  return useInventoryMutation(
    (targetProjectDir: string) =>
      piExtensionsApi.trustProject(targetProjectDir),
    projectDir,
  );
}
