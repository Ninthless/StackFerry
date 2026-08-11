import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, MoreHorizontal, Search, Server, X } from "lucide-react";
import { toast } from "sonner";
import type { AppId } from "@/lib/api/types";
import type { McpServer } from "@/types";
import { MCP_APP_IDS } from "@/config/appConfig";
import {
  useAllMcpServers,
  useBulkToggleMcpApp,
  useDeleteMcpServer,
  useImportMcpFromApps,
  useInstallPiMcpAdapter,
  usePiMcpAdapterStatus,
  useToggleMcpApp,
} from "@/hooks/useMcp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ManagementSummary,
  ManagementSummaryItem,
  ManagementWorkbench,
  ResourceToolbar,
} from "@/components/common/ManagementWorkbench";
import { WorkbenchEmptyState } from "@/components/common/WorkbenchEmptyState";
import { ConfirmDialog } from "../ConfirmDialog";
import McpFormModal from "./McpFormModal";
import { McpManagementMatrix, PiProjectionHealth } from "./McpManagementView";

export interface UnifiedMcpPanelHandle {
  openAdd: () => void;
  openImport: () => void;
}

interface UnifiedMcpPanelProps {
  activeApp: AppId;
}

type ProjectionFilter = "all" | "projected" | "unprojected";
type ClientFilter = "all" | AppId;

const UnifiedMcpPanel = React.forwardRef<
  UnifiedMcpPanelHandle,
  UnifiedMcpPanelProps
>(({ activeApp }, ref) => {
  const { t } = useTranslation();
  const showPiAdapter = activeApp === "pi";
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectionFilter>("all");
  const [clientFilter, setClientFilter] = useState<ClientFilter>("all");
  const [isInstallAdapterOpen, setIsInstallAdapterOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const { data: serversMap, isLoading } = useAllMcpServers();
  const {
    data: piAdapterStatus,
    isLoading: isPiAdapterStatusLoading,
    error: piAdapterStatusError,
    refetch: refetchPiAdapterStatus,
  } = usePiMcpAdapterStatus(undefined, showPiAdapter);
  const toggleAppMutation = useToggleMcpApp();
  const bulkToggleAppMutation = useBulkToggleMcpApp();
  const deleteServerMutation = useDeleteMcpServer();
  const importMutation = useImportMcpFromApps();
  const installPiAdapterMutation = useInstallPiMcpAdapter();

  const serverEntries = useMemo((): Array<[string, McpServer]> => {
    if (!serversMap) return [];
    return Object.entries(serversMap);
  }, [serversMap]);

  const enabledProjectionCount = useMemo(
    () =>
      serverEntries.reduce(
        (total, [_, server]) =>
          total + MCP_APP_IDS.filter((app) => Boolean(server.apps[app])).length,
        0,
      ),
    [serverEntries],
  );

  const attentionCount = useMemo(() => {
    if (!showPiAdapter) return 0;
    if (piAdapterStatusError) return 1;
    if (!piAdapterStatus) return 0;
    const countsMatch =
      piAdapterStatus.desiredServerCount ===
      piAdapterStatus.projectedServerCount;
    const needsAdapter =
      piAdapterStatus.desiredServerCount > 0 ||
      piAdapterStatus.state !== "uninstalled";
    return !needsAdapter ||
      (piAdapterStatus.state === "installed" && countsMatch)
      ? 0
      : 1;
  }, [piAdapterStatus, piAdapterStatusError, showPiAdapter]);

  const filteredServerEntries = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();

    return serverEntries.filter(([id, server]) => {
      const projectedCount = MCP_APP_IDS.filter(
        (app) => server.apps[app],
      ).length;
      if (statusFilter === "projected" && projectedCount === 0) return false;
      if (statusFilter === "unprojected" && projectedCount > 0) return false;
      if (clientFilter !== "all" && !server.apps[clientFilter]) return false;
      if (!query) return true;

      const spec = server.server ?? {};
      const values = [
        id,
        server.id,
        server.name,
        server.description,
        ...(Array.isArray(server.tags) ? server.tags : []),
        spec.type,
        spec.command,
        ...(Array.isArray(spec.args) ? spec.args : []),
        spec.cwd,
        spec.url,
        server.homepage,
        server.docs,
        server.source,
      ];
      return values.some(
        (value) =>
          typeof value === "string" &&
          value.toLocaleLowerCase().includes(query),
      );
    });
  }, [clientFilter, searchQuery, serverEntries, statusFilter]);

  const isMutationPending =
    bulkToggleAppMutation.isPending ||
    toggleAppMutation.isPending ||
    deleteServerMutation.isPending;

  const handleToggleApp = async (
    serverId: string,
    app: AppId,
    enabled: boolean,
  ) => {
    try {
      await toggleAppMutation.mutateAsync({ serverId, app, enabled });
    } catch (error) {
      toast.error(t("common.error"), { description: String(error) });
    }
  };

  const handleToggleFiltered = async (app: AppId, enabled: boolean) => {
    const serverIds = filteredServerEntries
      .filter(([_, server]) => Boolean(server.apps[app]) !== enabled)
      .map(([id]) => id);
    if (serverIds.length === 0) return;

    try {
      const result = await bulkToggleAppMutation.mutateAsync({
        serverIds,
        app,
        enabled,
      });
      if (result.failed.length > 0) {
        toast.error(
          t("common.bulkToggleFailed", { count: result.failed.length }),
          {
            description: String(result.failed[0].error),
          },
        );
      }
    } catch (error) {
      toast.error(t("common.error"), { description: String(error) });
    }
  };

  const handleEdit = (id: string) => {
    setEditingId(id);
    setIsFormOpen(true);
  };

  const handleAdd = () => {
    setEditingId(null);
    setIsFormOpen(true);
  };

  const handleImport = async () => {
    try {
      const count = await importMutation.mutateAsync();
      if (count === 0) {
        toast.success(t("mcp.unifiedPanel.noImportFound"), {
          closeButton: true,
        });
      } else {
        toast.success(t("mcp.unifiedPanel.importSuccess", { count }), {
          closeButton: true,
        });
      }
    } catch (error) {
      toast.error(t("common.error"), { description: String(error) });
    }
  };

  const handleInstallPiAdapter = async () => {
    try {
      const result = await installPiAdapterMutation.mutateAsync();
      setIsInstallAdapterOpen(false);
      if (result.installed && result.projected) {
        toast.success(t("mcp.piAdapter.installSuccess"), {
          closeButton: true,
        });
      } else if (result.installed) {
        toast.warning(t("mcp.piAdapter.projectionFailed"), {
          description: result.error || undefined,
          closeButton: true,
        });
      } else {
        toast.error(t("mcp.piAdapter.installFailed"), {
          description: result.error || undefined,
          closeButton: true,
        });
      }
    } catch (error) {
      toast.error(t("mcp.piAdapter.installFailed"), {
        description: String(error),
        closeButton: true,
      });
    }
  };

  React.useImperativeHandle(ref, () => ({
    openAdd: handleAdd,
    openImport: handleImport,
  }));

  const handleDelete = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: t("mcp.unifiedPanel.deleteServer"),
      message: t("mcp.unifiedPanel.deleteConfirm", { id }),
      onConfirm: async () => {
        try {
          await deleteServerMutation.mutateAsync(id);
          setConfirmDialog(null);
          toast.success(t("common.success"), { closeButton: true });
        } catch (error) {
          toast.error(t("common.error"), { description: String(error) });
        }
      },
    });
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <ManagementWorkbench
        className="mcp-management-workbench px-6"
        summary={
          <>
            <ManagementSummary className="mcp-management-summary">
              <ManagementSummaryItem
                label={t("mcp.summary.servers")}
                value={serverEntries.length}
              />
              <ManagementSummaryItem
                label={t("mcp.summary.projections")}
                value={enabledProjectionCount}
                status={enabledProjectionCount > 0 ? "success" : "muted"}
              />
              <ManagementSummaryItem
                label={t("mcp.summary.attention")}
                value={attentionCount}
                status={attentionCount > 0 ? "warning" : "success"}
              />
            </ManagementSummary>
            {showPiAdapter && (
              <PiProjectionHealth
                status={piAdapterStatus}
                isLoading={isPiAdapterStatusLoading}
                queryError={piAdapterStatusError}
                isInstalling={installPiAdapterMutation.isPending}
                onInstall={() => setIsInstallAdapterOpen(true)}
                onRecheck={() => void refetchPiAdapterStatus()}
              />
            )}
          </>
        }
        toolbar={
          <ResourceToolbar
            className="mcp-resource-toolbar"
            aria-label={t("mcp.toolbar")}
            search={
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={t("mcp.unifiedPanel.searchPlaceholder")}
                  aria-label={t("mcp.unifiedPanel.searchAriaLabel")}
                  className="h-8 pl-8 pr-9"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    aria-label={t("common.clearSearch")}
                    title={t("common.clearSearch")}
                    className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            }
            primaryFilters={
              <>
                <Select
                  value={statusFilter}
                  onValueChange={(value) =>
                    setStatusFilter(value as ProjectionFilter)
                  }
                >
                  <SelectTrigger
                    className="mcp-status-filter h-8 w-36"
                    aria-label={t("mcp.filters.status")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("mcp.filters.all")}</SelectItem>
                    <SelectItem value="projected">
                      {t("mcp.filters.projected")}
                    </SelectItem>
                    <SelectItem value="unprojected">
                      {t("mcp.filters.unprojected")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={clientFilter}
                  onValueChange={(value) =>
                    setClientFilter(value as ClientFilter)
                  }
                >
                  <SelectTrigger
                    className="mcp-client-filter h-8 w-36"
                    aria-label={t("mcp.filters.client")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("mcp.filters.allClients")}
                    </SelectItem>
                    {MCP_APP_IDS.map((app) => (
                      <SelectItem key={app} value={app}>
                        {t(`mcp.unifiedPanel.apps.${app}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            }
            actions={
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={t("common.moreActions")}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>{t("common.moreActions")}</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    disabled={
                      importMutation.isPending ||
                      isMutationPending ||
                      installPiAdapterMutation.isPending
                    }
                    onSelect={() => void handleImport()}
                  >
                    <Download className="h-4 w-4" />
                    {t("mcp.importExisting")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />
        }
        contentClassName="overflow-hidden"
      >
        <div className="mcp-management-content h-full overflow-y-auto overflow-x-hidden pb-16 pt-3">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">
              {t("mcp.loading")}
            </div>
          ) : serverEntries.length === 0 ? (
            <WorkbenchEmptyState
              icon={<Server className="h-5 w-5" />}
              title={t("mcp.unifiedPanel.noServers")}
              description={t("mcp.emptyDescription")}
              actions={
                <Button type="button" size="sm" onClick={handleAdd}>
                  {t("mcp.addMcp")}
                </Button>
              }
            />
          ) : filteredServerEntries.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {t("mcp.unifiedPanel.noSearchResults")}
            </div>
          ) : (
            <McpManagementMatrix
              entries={filteredServerEntries}
              isMutationPending={isMutationPending}
              onToggleApp={handleToggleApp}
              onToggleFiltered={handleToggleFiltered}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )}
        </div>

        {isFormOpen && (
          <McpFormModal
            editingId={editingId || undefined}
            initialData={
              editingId && serversMap ? serversMap[editingId] : undefined
            }
            existingIds={serversMap ? Object.keys(serversMap) : []}
            defaultFormat="json"
            onSave={async () => {
              setIsFormOpen(false);
              setEditingId(null);
            }}
            onClose={handleCloseForm}
          />
        )}

        {confirmDialog && (
          <ConfirmDialog
            isOpen={confirmDialog.isOpen}
            title={confirmDialog.title}
            message={confirmDialog.message}
            onConfirm={confirmDialog.onConfirm}
            onCancel={() => setConfirmDialog(null)}
          />
        )}

        {showPiAdapter && (
          <ConfirmDialog
            isOpen={isInstallAdapterOpen}
            title={t("mcp.piAdapter.installTitle")}
            message={t("mcp.piAdapter.installMessage")}
            confirmText={t("mcp.piAdapter.installConfirm")}
            variant="info"
            pending={installPiAdapterMutation.isPending}
            onConfirm={() => void handleInstallPiAdapter()}
            onCancel={() => setIsInstallAdapterOpen(false)}
          />
        )}
      </ManagementWorkbench>
    </TooltipProvider>
  );
});

UnifiedMcpPanel.displayName = "UnifiedMcpPanel";

export default UnifiedMcpPanel;
