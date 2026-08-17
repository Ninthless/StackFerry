import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { providersApi, type RuntimeEnvironment } from "@/lib/api/providers";
import type { AppId } from "@/lib/api";

export interface RuntimeEnvironmentTarget {
  appId: AppId;
  providerId: string;
}

export const environmentKeys = {
  all: ["runtimeEnvironments"] as const,
  list: ({ appId, providerId }: RuntimeEnvironmentTarget) =>
    [...environmentKeys.all, appId, providerId] as const,
};

export function useRuntimeEnvironments(
  target: RuntimeEnvironmentTarget | null,
  enabled = true,
) {
  return useQuery({
    queryKey: target
      ? environmentKeys.list(target)
      : [...environmentKeys.all, "disabled"],
    queryFn: () =>
      providersApi.getAgentInstances(target!.providerId, target!.appId),
    enabled: enabled && target !== null,
  });
}

function useEnvironmentMutation<TVariables>(
  target: RuntimeEnvironmentTarget | null,
  mutationFn: (variables: TVariables) => Promise<RuntimeEnvironment | boolean>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      if (target) {
        await queryClient.invalidateQueries({
          queryKey: environmentKeys.list(target),
        });
      }
    },
  });
}

export function useCreateRuntimeEnvironment(
  target: RuntimeEnvironmentTarget | null,
) {
  return useEnvironmentMutation(
    target,
    (input: { name: string; apiKey: string }) =>
      providersApi.createAgentInstance({
        providerId: target!.providerId,
        appType: target!.appId,
        name: input.name,
        apiKey: input.apiKey,
      }),
  );
}

export function useRenameRuntimeEnvironment(
  target: RuntimeEnvironmentTarget | null,
) {
  return useEnvironmentMutation(target, (input: { id: string; name: string }) =>
    providersApi.renameAgentInstance(input.id, input.name),
  );
}

export function useRotateRuntimeEnvironmentKey(
  target: RuntimeEnvironmentTarget | null,
) {
  return useEnvironmentMutation(
    target,
    (input: { id: string; apiKey: string }) =>
      providersApi.rotateAgentInstanceKey(input.id, input.apiKey),
  );
}

export function useSetRuntimeEnvironmentRecentProject(
  target: RuntimeEnvironmentTarget | null,
) {
  return useEnvironmentMutation(
    target,
    (input: { id: string; recentProjectDir: string | null }) =>
      providersApi.setAgentInstanceRecentProject(
        input.id,
        input.recentProjectDir,
      ),
  );
}

export function useDeleteRuntimeEnvironment(
  target: RuntimeEnvironmentTarget | null,
) {
  return useEnvironmentMutation(
    target,
    (input: { id: string; deleteSessions: boolean }) =>
      providersApi.deleteAgentInstance(input.id, input.deleteSessions),
  );
}
