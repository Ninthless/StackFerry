import React from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Edit3,
  ExternalLink,
  MoreHorizontal,
  Package,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { AppId } from "@/lib/api/types";
import type { McpServer, PiMcpAdapterStatus } from "@/types";
import { APP_ICON_MAP, MCP_APP_IDS } from "@/config/appConfig";
import { mcpPresets } from "@/config/mcpPresets";
import { settingsApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  StatusBadge,
  type StatusTone,
} from "@/components/common/ManagementWorkbench";

export type McpServerEntry = [string, McpServer];

interface PiProjectionHealthProps {
  status?: PiMcpAdapterStatus;
  isLoading: boolean;
  queryError: Error | null;
  isInstalling: boolean;
  onInstall: () => void;
  onRecheck: () => void;
}

export function PiProjectionHealth({
  status,
  isLoading,
  queryError,
  isInstalling,
  onInstall,
  onRecheck,
}: PiProjectionHealthProps) {
  const { t } = useTranslation();
  const state = queryError ? "error" : status?.state;
  const countsMatch =
    status?.desiredServerCount === status?.projectedServerCount;
  const error = queryError ? String(queryError) : status?.error;
  const canInstall = status?.canInstall === true || status?.canRepair === true;
  const canRecheck =
    Boolean(queryError) ||
    state === "declaredMissing" ||
    state === "incompatible" ||
    state === "error" ||
    (state === "installed" && !countsMatch);
  const tone: StatusTone =
    state === "installed" && countsMatch
      ? "success"
      : state === "uninstalled" && (status?.desiredServerCount ?? 0) === 0
        ? "muted"
        : state === "installed" || state === "uninstalled"
          ? "warning"
          : "error";
  const stateLabel =
    state === "installed"
      ? countsMatch
        ? t("mcp.piAdapter.effective")
        : t("mcp.piAdapter.projectionPending", {
            desired: status?.desiredServerCount ?? 0,
            projected: status?.projectedServerCount ?? 0,
          })
      : state === "uninstalled" && (status?.desiredServerCount ?? 0) > 0
        ? t("mcp.piAdapter.notEffective")
        : state
          ? t(`mcp.piAdapter.${state}`)
          : t("mcp.piAdapter.loading");
  const guidance =
    state === "declaredMissing"
      ? status?.canRepair
        ? t("mcp.piAdapter.repairableMissingHint")
        : t("mcp.piAdapter.declaredMissingHint")
      : null;
  const configuredVersion =
    status?.configuredVersion ?? t("mcp.piAdapter.versionUnavailable");
  const installedVersion =
    status?.installedVersion ?? t("mcp.piAdapter.versionUnavailable");
  return (
    <section
      className="pi-projection-health shrink-0 border-b border-border/70 py-2.5"
      aria-label={t("mcp.piAdapter.healthRegion")}
      aria-live="polite"
    >
      <div className="pi-projection-health-main flex min-w-0 items-center gap-3">
        <div className="pi-projection-health-identity flex min-w-0 items-center gap-2">
          <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span
            className="truncate text-sm font-medium"
            title={status?.configPath}
          >
            {t("mcp.piAdapter.label")}
          </span>
        </div>
        <StatusBadge status={tone} className="shrink-0">
          {isLoading && !state ? t("mcp.piAdapter.loading") : stateLabel}
        </StatusBadge>
        <div className="pi-projection-health-details flex min-w-0 flex-1 items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="shrink-0">
            {t("mcp.piAdapter.configuredVersion", {
              version: configuredVersion,
            })}
          </span>
          <span className="shrink-0">
            {t("mcp.piAdapter.installedVersion", {
              version: installedVersion,
            })}
          </span>
          <span className="shrink-0">
            {t("mcp.piAdapter.counts", {
              desired: status?.desiredServerCount ?? 0,
              projected: status?.projectedServerCount ?? 0,
            })}
          </span>
          {status?.projectOverridePath && (
            <span
              className="min-w-0 truncate text-amber-700 dark:text-amber-300"
              title={status.projectOverridePath}
            >
              {t("mcp.piAdapter.projectOverride")}
            </span>
          )}
        </div>
        <div className="pi-projection-health-actions ml-auto flex shrink-0 items-center gap-1">
          {canRecheck && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              disabled={isLoading || isInstalling}
              onClick={onRecheck}
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", isLoading && "animate-spin")}
              />
              {t("mcp.piAdapter.recheck")}
            </Button>
          )}
          {canInstall && (
            <Button
              type="button"
              size="sm"
              className="h-7 px-2"
              disabled={isInstalling}
              onClick={onInstall}
            >
              <Package className="h-3.5 w-3.5" />
              {status?.canRepair
                ? t("mcp.piAdapter.repairInstall")
                : t("mcp.piAdapter.install")}
            </Button>
          )}
        </div>
      </div>
      {(error || guidance) && (
        <div
          className="pi-projection-health-reason mt-2 flex min-w-0 items-start gap-2 border-l-2 border-destructive pl-3 text-xs text-destructive"
          role="status"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 break-words" title={error || guidance || ""}>
            {error || guidance}
          </span>
        </div>
      )}
    </section>
  );
}

interface McpManagementMatrixProps {
  entries: McpServerEntry[];
  isMutationPending: boolean;
  onToggleApp: (serverId: string, app: AppId, enabled: boolean) => void;
  onToggleFiltered: (app: AppId, enabled: boolean) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function McpManagementMatrix({
  entries,
  isMutationPending,
  onToggleApp,
  onToggleFiltered,
  onEdit,
  onDelete,
}: McpManagementMatrixProps) {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const counts = React.useMemo(() => {
    const next = Object.fromEntries(
      MCP_APP_IDS.map((app) => [app, 0]),
    ) as Record<AppId, number>;
    entries.forEach(([_, server]) => {
      MCP_APP_IDS.forEach((app) => {
        if (server.apps[app]) next[app]++;
      });
    });
    return next;
  }, [entries]);

  return (
    <div className="mcp-resource-surface min-w-0 max-w-full">
      <div
        className="mcp-matrix-scroll container-scroll-x max-w-full border-x border-b border-border"
        data-layout="local-horizontal-scroll"
      >
        <div
          className="mcp-matrix"
          role="table"
          aria-label={t("mcp.matrix.label")}
        >
          <div className="mcp-matrix-header mcp-matrix-grid" role="row">
            <div
              className="mcp-matrix-identity mcp-matrix-sticky"
              role="columnheader"
            >
              {t("mcp.matrix.server")}
            </div>
            {MCP_APP_IDS.map((app) => {
              const enabledCount = counts[app];
              const allEnabled =
                entries.length > 0 && enabledCount === entries.length;
              const partiallyEnabled =
                enabledCount > 0 && enabledCount < entries.length;
              const actionLabel = allEnabled
                ? t("mcp.matrix.disableFiltered", {
                    app: APP_ICON_MAP[app].label,
                    count: entries.length,
                  })
                : t("mcp.matrix.enableFiltered", {
                    app: APP_ICON_MAP[app].label,
                    count: entries.length,
                  });

              return (
                <div
                  key={app}
                  className="mcp-matrix-app-header"
                  role="columnheader"
                >
                  <span className="flex h-4 items-center justify-center">
                    {APP_ICON_MAP[app].icon}
                  </span>
                  <span className="mcp-matrix-app-label truncate">
                    {APP_ICON_MAP[app].label}
                  </span>
                  <Checkbox
                    checked={
                      allEnabled
                        ? true
                        : partiallyEnabled
                          ? "indeterminate"
                          : false
                    }
                    disabled={isMutationPending || entries.length === 0}
                    onCheckedChange={() => onToggleFiltered(app, !allEnabled)}
                    aria-label={actionLabel}
                    title={actionLabel}
                    className="h-3.5 w-3.5"
                  />
                </div>
              );
            })}
            <div className="mcp-matrix-status" role="columnheader">
              {t("mcp.matrix.status")}
            </div>
            <div className="mcp-matrix-actions" role="columnheader">
              <span className="sr-only">{t("common.actions")}</span>
            </div>
          </div>
          {entries.map(([id, server]) => {
            const enabledCount = MCP_APP_IDS.filter(
              (app) => server.apps[app],
            ).length;
            return (
              <div
                className="mcp-matrix-row mcp-matrix-grid"
                role="row"
                key={id}
              >
                <ServerIdentity id={id} server={server} sticky />
                {MCP_APP_IDS.map((app) => (
                  <div
                    className="mcp-matrix-cell"
                    role="cell"
                    key={`${id}-${app}`}
                  >
                    <Checkbox
                      checked={Boolean(server.apps[app])}
                      disabled={isMutationPending}
                      onCheckedChange={(checked) =>
                        onToggleApp(id, app, checked === true)
                      }
                      aria-label={t("mcp.matrix.cellLabel", {
                        server: server.name || id,
                        app: APP_ICON_MAP[app].label,
                      })}
                      title={t("mcp.matrix.cellLabel", {
                        server: server.name || id,
                        app: APP_ICON_MAP[app].label,
                      })}
                    />
                  </div>
                ))}
                <div className="mcp-matrix-status" role="cell">
                  <StatusBadge
                    status={enabledCount > 0 ? "success" : "muted"}
                    className="h-5 px-1.5"
                  >
                    {enabledCount > 0
                      ? t("mcp.matrix.projectedCount", { count: enabledCount })
                      : t("mcp.matrix.notProjected")}
                  </StatusBadge>
                </div>
                <div className="mcp-matrix-actions" role="cell">
                  <ServerActions
                    id={id}
                    disabled={isMutationPending}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div
        className="mcp-compact-list divide-y divide-border border-x border-b border-border"
        data-layout="no-page-horizontal-scroll"
      >
        {entries.map(([id, server]) => {
          const expanded = expandedId === id;
          const enabledApps = MCP_APP_IDS.filter((app) => server.apps[app]);
          return (
            <div className="mcp-compact-resource" key={id}>
              <div className="mcp-compact-resource-row">
                <button
                  type="button"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setExpandedId(expanded ? null : id)}
                  aria-expanded={expanded}
                  aria-label={t("mcp.matrix.toggleDetails", {
                    server: server.name || id,
                  })}
                >
                  {expanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  className="mcp-compact-resource-main min-w-0 text-left"
                  onClick={() => setExpandedId(expanded ? null : id)}
                  aria-expanded={expanded}
                >
                  <ServerIdentityContent id={id} server={server} />
                </button>
                <div className="mcp-compact-resource-actions">
                  <StatusBadge
                    status={enabledApps.length > 0 ? "success" : "muted"}
                    className="h-5 shrink-0 px-1.5"
                  >
                    {t("mcp.matrix.projectedCount", {
                      count: enabledApps.length,
                    })}
                  </StatusBadge>
                  <ServerActions
                    id={id}
                    disabled={isMutationPending}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                </div>
              </div>
              {expanded && (
                <div
                  className="mcp-compact-detail border-t border-border/70 bg-muted/20 px-3 py-3"
                  role="region"
                  aria-label={t("mcp.matrix.detailsLabel", {
                    server: server.name || id,
                  })}
                >
                  <div className="grid grid-cols-2 gap-2">
                    {MCP_APP_IDS.map((app) => (
                      <label
                        key={app}
                        className="flex min-w-0 items-center gap-2 rounded border border-border bg-background px-2 py-2 text-xs"
                      >
                        <Checkbox
                          checked={Boolean(server.apps[app])}
                          disabled={isMutationPending}
                          onCheckedChange={(checked) =>
                            onToggleApp(id, app, checked === true)
                          }
                          aria-label={t("mcp.matrix.cellLabel", {
                            server: server.name || id,
                            app: APP_ICON_MAP[app].label,
                          })}
                        />
                        <span className="shrink-0">
                          {APP_ICON_MAP[app].icon}
                        </span>
                        <span className="truncate">
                          {APP_ICON_MAP[app].label}
                        </span>
                      </label>
                    ))}
                  </div>
                  <ServerDetails server={server} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ServerIdentity({
  id,
  server,
  sticky,
}: {
  id: string;
  server: McpServer;
  sticky?: boolean;
}) {
  return (
    <div
      className={cn(
        "mcp-matrix-identity min-w-0",
        sticky && "mcp-matrix-sticky",
      )}
      role="rowheader"
    >
      <ServerIdentityContent id={id} server={server} />
    </div>
  );
}

function ServerIdentityContent({
  id,
  server,
}: {
  id: string;
  server: McpServer;
}) {
  const { t } = useTranslation();
  const preset = mcpPresets.find((item) => item.id === id);
  const docsUrl = server.docs || preset?.docs;
  const homepageUrl = server.homepage || preset?.homepage;
  const source =
    server.source ||
    server.server.url ||
    server.server.command ||
    server.server.type ||
    id;

  const openDocs = async (event: React.MouseEvent) => {
    event.stopPropagation();
    const url = docsUrl || homepageUrl;
    if (!url) return;
    try {
      await settingsApi.openExternal(url);
    } catch {}
  };

  return (
    <div className="mcp-server-identity-content min-w-0">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 truncate text-sm font-medium">
          {server.name || id}
        </span>
        {(docsUrl || homepageUrl) && (
          <button
            type="button"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={openDocs}
            aria-label={t("mcp.presets.docs")}
            title={t("mcp.presets.docs")}
          >
            <ExternalLink className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="mcp-server-identity-meta mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <span className="mcp-server-description min-w-0 shrink truncate">
          {server.description || t("mcp.matrix.noDescription")}
        </span>
        <span
          className="mcp-server-source min-w-0 flex-1 truncate text-muted-foreground/70"
          title={source}
        >
          {source}
        </span>
      </div>
    </div>
  );
}

function ServerDetails({ server }: { server: McpServer }) {
  const { t } = useTranslation();
  const spec = server.server;
  const source =
    server.source || spec.url || spec.command || spec.type || server.id;

  return (
    <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-t border-border/70 pt-3 text-xs">
      <dt className="text-muted-foreground">{t("mcp.matrix.source")}</dt>
      <dd className="min-w-0 break-all">{source}</dd>
      <dt className="text-muted-foreground">{t("mcp.matrix.type")}</dt>
      <dd>{spec.type || "stdio"}</dd>
      {spec.args && spec.args.length > 0 && (
        <>
          <dt className="text-muted-foreground">{t("mcp.matrix.arguments")}</dt>
          <dd className="min-w-0 break-all">{spec.args.join(" ")}</dd>
        </>
      )}
      {spec.cwd && (
        <>
          <dt className="text-muted-foreground">
            {t("mcp.matrix.workingDir")}
          </dt>
          <dd className="min-w-0 break-all">{spec.cwd}</dd>
        </>
      )}
    </dl>
  );
}

function ServerActions({
  id,
  disabled,
  onEdit,
  onDelete,
}: {
  id: string;
  disabled: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={disabled}
              aria-label={t("common.moreActions")}
              title={t("common.moreActions")}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("common.moreActions")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onEdit(id)}>
          <Edit3 className="h-4 w-4" />
          {t("common.edit")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => onDelete(id)}
        >
          <Trash2 className="h-4 w-4" />
          {t("common.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
