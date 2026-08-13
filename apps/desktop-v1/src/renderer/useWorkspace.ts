import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkspaceSnapshot } from "../shared/contracts";

const workspaceKey = ["workspace"] as const;

export function useWorkspace() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: workspaceKey,
    queryFn: () => window.stackferry.getWorkspace(),
  });
  const refresh = useMutation({
    mutationFn: () => window.stackferry.refreshWorkspace(),
    onSuccess: (workspace: WorkspaceSnapshot) => {
      queryClient.setQueryData(workspaceKey, workspace);
    },
  });

  return {
    ...query,
    refresh: refresh.mutate,
    isRefreshing: refresh.isPending,
    refreshError: refresh.error,
  };
}
