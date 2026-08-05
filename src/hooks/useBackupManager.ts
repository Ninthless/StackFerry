import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { backupsApi } from "@/lib/api";
import { invalidateDatabaseState } from "@/lib/query/invalidateDatabaseState";

export function useBackupManager() {
  const queryClient = useQueryClient();

  const {
    data: backups = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["db-backups"],
    queryFn: () => backupsApi.listDbBackups(),
  });

  const createMutation = useMutation({
    mutationFn: () => backupsApi.createDbBackup(),
    onSuccess: () => refetch(),
  });

  const restoreMutation = useMutation({
    mutationFn: (filename: string) => backupsApi.restoreDbBackup(filename),
    onSuccess: async () => {
      await invalidateDatabaseState(queryClient);
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({
      oldFilename,
      newName,
    }: {
      oldFilename: string;
      newName: string;
    }) => backupsApi.renameDbBackup(oldFilename, newName),
    onSuccess: () => refetch(),
  });

  const deleteMutation = useMutation({
    mutationFn: (filename: string) => backupsApi.deleteDbBackup(filename),
    onSuccess: () => refetch(),
  });

  return {
    backups,
    isLoading,
    create: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    restore: restoreMutation.mutateAsync,
    isRestoring: restoreMutation.isPending,
    rename: renameMutation.mutateAsync,
    isRenaming: renameMutation.isPending,
    remove: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}
