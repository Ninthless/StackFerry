import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Edit3,
  ExternalLink,
  Package,
  Search,
  Server,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  useAllMcpServers,
  useBulkToggleMcpApp,
  useToggleMcpApp,
  useDeleteMcpServer,
  useImportMcpFromApps,
  usePiMcpAdapterStatus,
} from "@/hooks/useMcp";
import type { McpServer, PiMcpAdapterStatus } from "@/types";
import type { AppId } from "@/lib/api/types";
import McpFormModal from "./McpFormModal";
import { ConfirmDialog } from "../ConfirmDialog";
import { settingsApi } from "@/lib/api";
import { mcpPresets } from "@/config/mcpPresets";
import { toast } from "sonner";
import { MCP_APP_IDS } from "@/config/appConfig";
import { AppCountBar } from "@/components/common/AppCountBar";
import { AppToggleGroup } from "@/components/common/AppToggleGroup";
import { ListItemRow } from "@/components/common/ListItemRow";
import { WorkbenchEmptyState } from "@/components/common/WorkbenchEmptyState";

export interface UnifiedMcpPanelHandle {
  openAdd: () => void;
  openImport: () => void;
}

const UnifiedMcpPanel = React.forwardRef<
  UnifiedMcpPanelHandle,
  Record<never, never>
>((_, ref) => {
  const { t } = useTranslation();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
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
  } = usePiMcpAdapterStatus();
  const toggleAppMutation = useToggleMcpApp();
  const bulkToggleAppMutation = useBulkToggleMcpApp();
  const deleteServerMutation = useDeleteMcpServer();
  const importMutation = useImportMcpFromApps();

  const serverEntries = useMemo((): Array<[string, McpServer]> => {
    if (!serversMap) return [];
    return Object.entries(serversMap);
  }, [serversMap]);

  const enabledCounts = useMemo(() => {
    const counts = {
      claude: 0,
      "claude-desktop": 0,
      codex: 0,
      gemini: 0,
      grokbuild: 0,
      opencode: 0,
      openclaw: 0,
      hermes: 0,
      pi: 0,
    };
    serverEntries.forEach(([_, server]) => {
      for (const app of MCP_APP_IDS) {
        if (server.apps[app]) counts[app]++;
      }
    });
    return counts;
  }, [serverEntries]);

  const filteredServerEntries = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return serverEntries;

    return serverEntries.filter(([id, server]) => {
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
      ];
      return values.some(
        (value) =>
          typeof value === "string" &&
          value.toLocaleLowerCase().includes(query),
      );
    });
  }, [searchQuery, serverEntries]);

  const pendingApp = bulkToggleAppMutation.isPending
    ? bulkToggleAppMutation.variables?.app
    : toggleAppMutation.isPending
      ? toggleAppMutation.variables?.app
      : null;

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

  const handleToggleAll = async (app: AppId, enabled: boolean) => {
    const serverIds = serverEntries
      .filter(([_, server]) => Boolean(server.apps[app]) !== enabled)
      .map(([id]) => id);
    if (serverIds.length === 0) return;

    const result = await bulkToggleAppMutation.mutateAsync({
      serverIds,
      app,
      enabled,
    });
    if (result.failed.length > 0) {
      toast.error(
        t("common.bulkToggleFailed", { count: result.failed.length }),
        { description: String(result.failed[0].error) },
      );
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
    <div className="px-6 flex flex-col flex-1 min-h-0 overflow-hidden">
      <AppCountBar
        totalLabel={t("mcp.serverCount", { count: serverEntries.length })}
        counts={enabledCounts}
        appIds={MCP_APP_IDS}
        totalCount={serverEntries.length}
        onToggleAll={handleToggleAll}
        pendingApp={pendingApp}
      />

      <PiMcpAdapterStatusRow
        status={piAdapterStatus}
        isLoading={isPiAdapterStatusLoading}
        queryError={piAdapterStatusError}
      />

      <div className="relative mb-3 flex-shrink-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={t("mcp.unifiedPanel.searchPlaceholder")}
          aria-label={t("mcp.unifiedPanel.searchAriaLabel")}
          className="pl-9 pr-9"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            aria-label={t("common.clearSearch")}
            title={t("common.clearSearch")}
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden pb-24">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
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
          <TooltipProvider delayDuration={300}>
            <div className="overflow-hidden rounded-md border border-border bg-card">
              {filteredServerEntries.map(([id, server], index) => (
                <UnifiedMcpListItem
                  key={id}
                  id={id}
                  server={server}
                  onToggleApp={handleToggleApp}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  isLast={index === filteredServerEntries.length - 1}
                />
              ))}
            </div>
          </TooltipProvider>
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
    </div>
  );
});

UnifiedMcpPanel.displayName = "UnifiedMcpPanel";

const PiMcpAdapterStatusRow: React.FC<{
  status?: PiMcpAdapterStatus;
  isLoading: boolean;
  queryError: Error | null;
}> = ({ status, isLoading, queryError }) => {
  const { t } = useTranslation();
  const state = queryError ? "error" : status?.state;

  if (!state && !isLoading) return null;

  const stateStyles = {
    inactive: "text-muted-foreground",
    pending: "text-amber-600 dark:text-amber-400",
    installed: "text-emerald-600 dark:text-emerald-400",
    error: "text-destructive",
  } as const;
  const StateIcon =
    state === "installed"
      ? CheckCircle2
      : state === "pending"
        ? Clock3
        : state === "error"
          ? AlertTriangle
          : Package;
  const version = status?.installedVersion ?? status?.configuredVersion;
  const error = queryError ? String(queryError) : status?.error;

  return (
    <div
      className="-mt-2 mb-4 flex min-h-8 flex-shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/60 pb-3 text-xs"
      aria-live="polite"
    >
      <Package className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="font-medium" title={status?.configPath}>
        {t("mcp.piAdapter.label")}
      </span>
      {isLoading && !state ? (
        <span className="text-muted-foreground">
          {t("mcp.piAdapter.loading")}
        </span>
      ) : (
        <span
          className={`inline-flex items-center gap-1 ${stateStyles[state!]}`}
        >
          <StateIcon className="h-3.5 w-3.5" />
          {t(`mcp.piAdapter.${state}`)}
          {version ? ` v${version}` : ""}
        </span>
      )}
      {status?.projectOverridePath && (
        <span
          className="ml-auto truncate text-amber-600 dark:text-amber-400"
          title={status.projectOverridePath}
        >
          {t("mcp.piAdapter.projectOverride")}
        </span>
      )}
      {error && (
        <span
          className="min-w-0 flex-1 truncate text-destructive"
          title={error}
        >
          {error}
        </span>
      )}
    </div>
  );
};

interface UnifiedMcpListItemProps {
  id: string;
  server: McpServer;
  onToggleApp: (serverId: string, app: AppId, enabled: boolean) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  isLast?: boolean;
}

const UnifiedMcpListItem: React.FC<UnifiedMcpListItemProps> = ({
  id,
  server,
  onToggleApp,
  onEdit,
  onDelete,
  isLast,
}) => {
  const { t } = useTranslation();
  const name = server.name || id;
  const description = server.description || "";

  const meta = mcpPresets.find((p) => p.id === id);
  const docsUrl = server.docs || meta?.docs;
  const homepageUrl = server.homepage || meta?.homepage;
  const tags = server.tags || meta?.tags;

  const openDocs = async () => {
    const url = docsUrl || homepageUrl;
    if (!url) return;
    try {
      await settingsApi.openExternal(url);
    } catch {}
  };

  return (
    <ListItemRow isLast={isLast}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-sm text-foreground truncate">
            {name}
          </span>
          {docsUrl && (
            <button
              type="button"
              onClick={openDocs}
              className="text-muted-foreground/60 hover:text-foreground flex-shrink-0"
              title={t("mcp.presets.docs")}
            >
              <ExternalLink size={12} />
            </button>
          )}
        </div>
        {description && (
          <p
            className="text-xs text-muted-foreground truncate"
            title={description}
          >
            {description}
          </p>
        )}
        {!description && tags && tags.length > 0 && (
          <p className="text-xs text-muted-foreground/60 truncate">
            {tags.join(", ")}
          </p>
        )}
      </div>

      <AppToggleGroup
        apps={server.apps}
        onToggle={(app, enabled) => onToggleApp(id, app, enabled)}
        appIds={MCP_APP_IDS}
      />

      <div className="flex flex-shrink-0 items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onEdit(id)}
          title={t("common.edit")}
        >
          <Edit3 size={14} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
          onClick={() => onDelete(id)}
          title={t("common.delete")}
        >
          <Trash2 size={14} />
        </Button>
      </div>
    </ListItemRow>
  );
};

export default UnifiedMcpPanel;
