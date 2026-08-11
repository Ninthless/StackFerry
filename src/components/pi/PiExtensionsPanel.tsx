import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FolderCog,
  FolderOpen,
  Loader2,
  MoreHorizontal,
  Package,
  Plus,
  Puzzle,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  type PiExtension,
  type PiInventoryStatus,
  type PiPackage,
  type PiPackageSearchItem,
  type PiPackageStatus,
  type PiExtensionScope,
  type PiExtensionTarget,
  type PiRuntimeInfo,
} from "@/lib/api/piExtensions";
import { settingsApi } from "@/lib/api";
import {
  useInstallPiPackage,
  usePiExtensionInventory,
  useRegisterPiLocalExtension,
  useRemovePiPackage,
  useSearchPiPackages,
  useSetPiExtensionEnabled,
  useTrustPiProject,
  useUnregisterPiLocalExtension,
} from "@/hooks/usePiExtensions";
import { extractErrorMessage } from "@/utils/errorUtils";
import { cn } from "@/lib/utils";
import { PiPackageInstallDialog } from "@/components/pi/PiPackageInstallDialog";
import { WorkbenchEmptyState } from "@/components/common/WorkbenchEmptyState";
import {
  ManagementSummary,
  ManagementSummaryItem,
  ManagementWorkbench,
  ResourceToolbar,
  StatusBadge,
  type StatusTone,
} from "@/components/common/ManagementWorkbench";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type PanelTab = "extensions" | "packages" | "discover";
type ScopeFilter = "all" | PiExtensionScope;
type DetailTarget =
  | { type: "extension"; item: PiExtension }
  | { type: "package"; item: PiPackage }
  | null;

export type PiExtensionsPageState =
  | { mode: "list" }
  | { mode: "detail"; name: string; resourceType: "extension" | "package" };

interface PiExtensionsPanelProps {
  requestedMode?: PiExtensionsPageState["mode"];
  onPageStateChange?: (state: PiExtensionsPageState) => void;
}

const PAGE_SIZE = 12;
const extensionStatuses: PiInventoryStatus[] = [
  "active",
  "disabled",
  "missing",
  "invalid",
  "conflict",
];
const brokenStatuses = new Set(["missing", "invalid", "conflict"]);

const compactNumber = (value: number) =>
  new Intl.NumberFormat(undefined, { notation: "compact" }).format(value);

const statusTone = (status: string): StatusTone => {
  if (status === "active" || status === "installed") return "success";
  if (status === "disabled") return "muted";
  return "error";
};

const isPiMcpAdapterSource = (source?: string) => {
  const normalized = source?.trim().toLocaleLowerCase().replace(/^npm:/, "");
  return (
    normalized === "pi-mcp-adapter" ||
    normalized?.startsWith("pi-mcp-adapter@") === true
  );
};

export default function PiExtensionsPanel({
  requestedMode,
  onPageStateChange,
}: PiExtensionsPanelProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<PanelTab>("extensions");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [projectDir, setProjectDir] = useState("");
  const [trustConfirmOpen, setTrustConfirmOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<DetailTarget>(null);
  const [expandedPackages, setExpandedPackages] = useState<Set<string>>(
    new Set(),
  );
  const [removeTarget, setRemoveTarget] = useState<PiPackage | null>(null);
  const [unregisterTarget, setUnregisterTarget] = useState<PiExtension | null>(
    null,
  );
  const [discoverInput, setDiscoverInput] = useState("");
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [installTarget, setInstallTarget] =
    useState<PiPackageSearchItem | null>(null);

  const inventoryQuery = usePiExtensionInventory(projectDir || undefined);
  const inventory = inventoryQuery.data;
  const searchQuery = useSearchPiPackages(discoverQuery, PAGE_SIZE);
  const toggleMutation = useSetPiExtensionEnabled(projectDir || undefined);
  const removeMutation = useRemovePiPackage(projectDir || undefined);
  const installMutation = useInstallPiPackage(projectDir || undefined);
  const registerMutation = useRegisterPiLocalExtension(projectDir || undefined);
  const unregisterMutation = useUnregisterPiLocalExtension(
    projectDir || undefined,
  );
  const trustMutation = useTrustPiProject(projectDir || undefined);

  useEffect(() => {
    let active = true;
    void settingsApi
      .get()
      .then((settings) => {
        if (active && settings.recentPiProjectDir) {
          setProjectDir(settings.recentPiProjectDir);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!detailTarget || !inventory) return;
    if (detailTarget.type === "extension") {
      const current = inventory.extensions.find(
        (item) => item.id === detailTarget.item.id,
      );
      if (current) setDetailTarget({ type: "extension", item: current });
    } else {
      const current = inventory.packages.find(
        (item) => item.id === detailTarget.item.id,
      );
      if (current) setDetailTarget({ type: "package", item: current });
    }
  }, [inventory, detailTarget?.item.id, detailTarget?.type]);

  useEffect(() => {
    if (requestedMode === "list" && detailTarget) {
      setDetailTarget(null);
    }
  }, [detailTarget, requestedMode]);

  const packageStatuses = useMemo(
    () =>
      Array.from(
        new Set((inventory?.packages ?? []).map((item) => item.status)),
      ) as PiPackageStatus[],
    [inventory?.packages],
  );

  const filteredExtensions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (inventory?.extensions ?? []).filter((extension) => {
      const matchesQuery =
        !query ||
        [
          extension.name,
          extension.id,
          extension.path,
          extension.packageId,
          extension.packageSource,
          extension.version,
        ].some((value) => value?.toLocaleLowerCase().includes(query));
      const matchesStatus =
        statusFilter === "all" || extension.status === statusFilter;
      const matchesSource =
        sourceFilter === "all" || extension.sourceType === sourceFilter;
      const matchesScope =
        scopeFilter === "all" || extension.scope === scopeFilter;
      return matchesQuery && matchesStatus && matchesSource && matchesScope;
    });
  }, [inventory?.extensions, scopeFilter, search, sourceFilter, statusFilter]);

  const filteredPackages = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (inventory?.packages ?? []).filter((packageItem) => {
      const matchesQuery =
        !query ||
        [
          packageItem.displayName,
          packageItem.source,
          packageItem.version,
          packageItem.installedPath,
        ].some((value) => value?.toLocaleLowerCase().includes(query));
      const matchesStatus =
        statusFilter === "all" || packageItem.status === statusFilter;
      const matchesSource =
        sourceFilter === "all" || packageItem.sourceType === sourceFilter;
      const matchesScope =
        scopeFilter === "all" || packageItem.scope === scopeFilter;
      return matchesQuery && matchesStatus && matchesSource && matchesScope;
    });
  }, [inventory?.packages, scopeFilter, search, sourceFilter, statusFilter]);

  const enabledCount =
    inventory?.extensions.filter((extension) => extension.enabled).length ?? 0;
  const issueCount =
    (inventory?.extensions.filter((extension) =>
      brokenStatuses.has(extension.status),
    ).length ?? 0) +
    (inventory?.packages.filter((packageItem) =>
      brokenStatuses.has(packageItem.status),
    ).length ?? 0);
  const hasFilters =
    search.trim().length > 0 ||
    statusFilter !== "all" ||
    sourceFilter !== "all" ||
    scopeFilter !== "all";
  const globalRuntime = inventory?.runtimes.find(
    (runtime) => runtime.scope === "global",
  );
  const projectRuntime = inventory?.runtimes.find(
    (runtime) => runtime.scope === "project",
  );
  const selectedRuntime =
    scopeFilter === "project" ? projectRuntime : globalRuntime;
  const configMutable = selectedRuntime?.mutable === true;
  const cliAvailable = selectedRuntime?.cliAvailable === true;
  const configUnavailableReason = !configMutable
    ? selectedRuntime?.error || t("piExtensions.actions.configUnavailable")
    : undefined;
  const cliUnavailableReason = !cliAvailable
    ? t("piExtensions.actions.cliRequired")
    : undefined;
  const discoverItems = useMemo(() => {
    const items = searchQuery.data?.pages.flatMap((page) => page.items) ?? [];
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = `${item.name}@${item.version}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [searchQuery.data?.pages]);
  const reportError = (key: string, error: unknown) => {
    toast.error(t(key), { description: extractErrorMessage(error) });
  };

  const targetFor = (
    item: Pick<PiExtension, "scope" | "resourceKey" | "projectDir">,
  ): PiExtensionTarget => ({
    scope: item.scope,
    resourceKey: item.resourceKey,
    projectDir: item.projectDir,
  });

  const runtimeFor = (scope: PiExtensionScope) =>
    inventory?.runtimes.find((runtime) => runtime.scope === scope);

  const selectProject = async () => {
    const selected = await settingsApi.pickDirectory(projectDir || undefined);
    if (!selected) return;
    setProjectDir(selected);
    setScopeFilter("all");
    try {
      const settings = await settingsApi.get();
      await settingsApi.save({ ...settings, recentPiProjectDir: selected });
    } catch (error) {
      reportError("piExtensions.messages.projectSaveFailed", error);
    }
  };

  const clearProject = () => {
    setProjectDir("");
    if (scopeFilter === "project") setScopeFilter("all");
    void settingsApi
      .get()
      .then((settings) =>
        settingsApi.save({ ...settings, recentPiProjectDir: undefined }),
      )
      .catch((error) =>
        reportError("piExtensions.messages.projectSaveFailed", error),
      );
  };

  const selectDetail = (target: DetailTarget) => {
    setDetailTarget(target);
    if (target) {
      onPageStateChange?.({
        mode: "detail",
        name:
          target.type === "extension"
            ? target.item.name
            : target.item.displayName,
        resourceType: target.type,
      });
    }
  };

  const closeDetail = () => {
    setDetailTarget(null);
    onPageStateChange?.({ mode: "list" });
  };

  const handleToggle = async (extension: PiExtension, enabled: boolean) => {
    try {
      await toggleMutation.mutateAsync({
        target: targetFor(extension),
        enabled,
      });
    } catch (error) {
      reportError("piExtensions.messages.toggleFailed", error);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    try {
      await removeMutation.mutateAsync(targetFor(removeTarget));
      toast.success(
        t("piExtensions.messages.removeSuccess", {
          name: removeTarget.displayName,
        }),
      );
      setRemoveTarget(null);
      if (detailTarget?.item.id === removeTarget.id) closeDetail();
    } catch (error) {
      reportError("piExtensions.messages.removeFailed", error);
    }
  };

  const handleUnregister = async () => {
    if (!unregisterTarget) return;
    try {
      await unregisterMutation.mutateAsync(targetFor(unregisterTarget));
      toast.success(
        t("piExtensions.messages.unregisterSuccess", {
          name: unregisterTarget.name,
        }),
      );
      setUnregisterTarget(null);
      if (detailTarget?.item.id === unregisterTarget.id) closeDetail();
    } catch (error) {
      reportError("piExtensions.messages.unregisterFailed", error);
    }
  };

  const handleConfirmDiscoverInstall = async () => {
    if (!installTarget) return;
    try {
      const result = await installMutation.mutateAsync({
        source: installTarget.source,
        target: { scope: "global" },
      });
      reportInstallResult(result.isolatedExtensions, installTarget.name);
      setInstallTarget(null);
    } catch (error) {
      reportError("piExtensions.messages.installFailed", error);
    }
  };

  const submitDiscovery = () => {
    const query = discoverInput.trim();
    if (query.length < 2) return;
    if (query === discoverQuery) {
      void searchQuery.refetch();
      return;
    }
    setDiscoverQuery(query);
  };

  const reportInstallResult = (
    isolatedExtensions: PiExtension[],
    name?: string,
  ) => {
    if (isolatedExtensions.length > 0) {
      toast.warning(t("piExtensions.messages.installedWithConflicts"), {
        description: t("piExtensions.messages.isolatedExtensions", {
          names: isolatedExtensions
            .map((extension) => extension.name)
            .join(", "),
        }),
      });
      return;
    }
    toast.success(
      name
        ? t("piExtensions.messages.installNamedSuccess", { name })
        : t("piExtensions.messages.installSuccess"),
    );
  };

  const resetFilters = (nextTab: PanelTab) => {
    setTab(nextTab);
    setSearch("");
    setStatusFilter("all");
    setSourceFilter("all");
    setScopeFilter("all");
    closeDetail();
  };

  if (inventoryQuery.isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (inventoryQuery.isError || !inventory) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6">
        <WorkbenchEmptyState
          icon={<AlertTriangle className="h-5 w-5" />}
          title={t("piExtensions.loadFailed")}
          description={extractErrorMessage(inventoryQuery.error)}
          actions={
            <Button onClick={() => void inventoryQuery.refetch()}>
              {t("common.refresh")}
            </Button>
          }
        />
      </div>
    );
  }

  const tabs = (
    <Tabs
      value={tab}
      onValueChange={(value) => resetFilters(value as PanelTab)}
    >
      <TabsList layout="compact" className="pi-extensions-tabs">
        <TabsTrigger value="extensions">
          {t("piExtensions.tabs.extensions")}
        </TabsTrigger>
        <TabsTrigger value="packages">
          {t("piExtensions.tabs.packages")}
        </TabsTrigger>
        <TabsTrigger value="discover">
          {t("piExtensions.tabs.discover")}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );

  const dialogs = (
    <>
      <PiPackageInstallDialog
        open={installOpen}
        pending={registerMutation.isPending || installMutation.isPending}
        configMutable={configMutable}
        cliAvailable={cliAvailable}
        configUnavailableReason={configUnavailableReason}
        cliUnavailableReason={cliUnavailableReason}
        projectDir={projectDir || undefined}
        initialScope={scopeFilter === "project" ? "project" : "global"}
        onOpenChange={setInstallOpen}
        onRegisterExtension={async (path, target) => {
          try {
            await registerMutation.mutateAsync({ path, target });
            toast.success(t("piExtensions.messages.registerSuccess"));
            setInstallOpen(false);
          } catch (error) {
            reportError("piExtensions.messages.registerFailed", error);
          }
        }}
        onInstallPackage={async (source, target) => {
          try {
            const result = await installMutation.mutateAsync({
              source,
              target,
            });
            reportInstallResult(result.isolatedExtensions);
            setInstallOpen(false);
          } catch (error) {
            reportError("piExtensions.messages.installFailed", error);
          }
        }}
      />
      <ConfirmDialog
        isOpen={removeTarget !== null}
        title={t("piExtensions.removeConfirm.title")}
        message={t("piExtensions.removeConfirm.message", {
          name: removeTarget?.displayName ?? "",
        })}
        confirmText={t("piExtensions.removeConfirm.confirm")}
        onConfirm={() => void handleRemove()}
        onCancel={() => setRemoveTarget(null)}
      />
      <ConfirmDialog
        isOpen={trustConfirmOpen}
        title={t("piExtensions.project.trustTitle")}
        message={t("piExtensions.project.trustMessage", {
          path: projectDir,
        })}
        confirmText={t("piExtensions.project.trustConfirm")}
        variant="info"
        onConfirm={() => {
          void trustMutation
            .mutateAsync(projectDir)
            .then(() => {
              setTrustConfirmOpen(false);
              toast.success(t("piExtensions.messages.projectTrusted"));
            })
            .catch((error) =>
              reportError("piExtensions.messages.projectTrustFailed", error),
            );
        }}
        onCancel={() => setTrustConfirmOpen(false)}
      />
      <ConfirmDialog
        isOpen={unregisterTarget !== null}
        title={t("piExtensions.unregisterConfirm.title")}
        message={t("piExtensions.unregisterConfirm.message", {
          name: unregisterTarget?.name ?? "",
        })}
        confirmText={t("piExtensions.unregisterConfirm.confirm")}
        onConfirm={() => void handleUnregister()}
        onCancel={() => setUnregisterTarget(null)}
      />
      <ConfirmDialog
        isOpen={installTarget !== null}
        title={t("piExtensions.installConfirm.title")}
        message={t("piExtensions.installConfirm.message", {
          name: installTarget?.name ?? "",
          manifest:
            installTarget?.manifestStatus === "available"
              ? t("piExtensions.installConfirm.manifestAvailable")
              : t("piExtensions.installConfirm.manifestUnavailable"),
        })}
        confirmText={t("piExtensions.installConfirm.confirm")}
        variant="info"
        onConfirm={() => void handleConfirmDiscoverInstall()}
        onCancel={() => setInstallTarget(null)}
      />
    </>
  );

  if (detailTarget) {
    return (
      <TooltipProvider delayDuration={300}>
        <PiDetailPage
          target={detailTarget}
          configMutable={runtimeFor(detailTarget.item.scope)?.mutable === true}
          cliAvailable={
            runtimeFor(detailTarget.item.scope)?.cliAvailable === true
          }
          togglePending={toggleMutation.isPending}
          removePending={removeMutation.isPending}
          unregisterPending={unregisterMutation.isPending}
          onToggle={handleToggle}
          onRemove={setRemoveTarget}
          onUnregister={setUnregisterTarget}
        />
        {dialogs}
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <ManagementWorkbench
        className="pi-extensions-workbench px-6"
        mode="list"
        summary={
          <ManagementSummary
            className="pi-extensions-summary"
            trailing={
              <div className="flex min-w-0 items-center gap-2">
                <ProjectSelector
                  projectDir={projectDir}
                  trusted={inventory.project?.trusted === true}
                  onSelect={() => void selectProject()}
                  onClear={clearProject}
                  onTrust={() => setTrustConfirmOpen(true)}
                />
                {tabs}
              </div>
            }
          >
            <ManagementSummaryItem
              label={t("piExtensions.summary.extensions")}
              value={inventory.extensions.length}
            />
            <ManagementSummaryItem
              label={t("piExtensions.summary.enabled")}
              value={enabledCount}
              status={enabledCount ? "success" : "muted"}
            />
            <ManagementSummaryItem
              label={t("piExtensions.summary.packages")}
              value={inventory.packages.length}
            />
            <ManagementSummaryItem
              label={t("piExtensions.summary.issues")}
              value={issueCount}
              status={issueCount ? "error" : "success"}
            />
          </ManagementSummary>
        }
        toolbar={
          <PiToolbar
            tab={tab}
            search={search}
            statusFilter={statusFilter}
            sourceFilter={sourceFilter}
            scopeFilter={scopeFilter}
            projectSelected={Boolean(projectDir)}
            packageStatuses={packageStatuses}
            discoverInput={discoverInput}
            isDiscoverSearching={
              discoverQuery.length > 0 &&
              (searchQuery.isPending ||
                (searchQuery.isFetching && !searchQuery.data))
            }
            isRefreshing={inventoryQuery.isFetching}
            configMutable={configMutable}
            onSearchChange={setSearch}
            onStatusChange={setStatusFilter}
            onSourceChange={setSourceFilter}
            onScopeChange={(value) => setScopeFilter(value as ScopeFilter)}
            onDiscoverInputChange={setDiscoverInput}
            onDiscover={submitDiscovery}
            onAdd={() => setInstallOpen(true)}
            onRefresh={() => void inventoryQuery.refetch()}
          />
        }
      >
        <div className="h-full overflow-y-auto overflow-x-hidden pb-8">
          {inventory.extensions.some(
            (extension) => extension.enabled && extension.status === "conflict",
          ) && (
            <ExtensionConflictBanner
              extensions={inventory.extensions}
              onSelect={(item) => selectDetail({ type: "extension", item })}
            />
          )}
          {inventory.runtimes.map((runtime) => (
            <RuntimeHealthBand key={runtime.scope} runtime={runtime} />
          ))}
          {projectDir && inventory.project?.trusted === false && (
            <ProjectTrustBanner
              projectDir={projectDir}
              onTrust={() => setTrustConfirmOpen(true)}
            />
          )}
          {!projectDir && scopeFilter === "project" && (
            <ProjectSelectionGuide onSelect={() => void selectProject()} />
          )}
          {tab === "extensions" && (
            <ExtensionInventory
              extensions={filteredExtensions}
              hasFilters={hasFilters}
              configMutable={configMutable}
              togglePendingId={
                toggleMutation.isPending
                  ? toggleMutation.variables?.target.resourceKey
                  : null
              }
              unregisterPending={unregisterMutation.isPending}
              onAdd={() => setInstallOpen(true)}
              onSelect={(item) => selectDetail({ type: "extension", item })}
              onToggle={handleToggle}
              onUnregister={setUnregisterTarget}
            />
          )}
          {tab === "packages" && (
            <PackageInventory
              packages={filteredPackages}
              hasFilters={hasFilters}
              expanded={expandedPackages}
              cliAvailable={cliAvailable}
              removePending={removeMutation.isPending}
              onAdd={() => setInstallOpen(true)}
              onExpand={(id) =>
                setExpandedPackages((current) => {
                  const next = new Set(current);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              onSelect={(item) => selectDetail({ type: "package", item })}
              onSelectExtension={(item) =>
                selectDetail({ type: "extension", item })
              }
              onRemove={setRemoveTarget}
            />
          )}
          {tab === "discover" && (
            <DiscoverDirectory
              query={discoverQuery}
              items={discoverItems}
              loading={searchQuery.isPending}
              refreshing={
                searchQuery.isFetching && !searchQuery.isFetchingNextPage
              }
              loadingMore={searchQuery.isFetchingNextPage}
              error={searchQuery.error}
              nextPageError={searchQuery.isFetchNextPageError}
              hasMore={searchQuery.hasNextPage === true}
              cliAvailable={cliAvailable}
              installPending={installMutation.isPending}
              onRetry={() => void searchQuery.refetch()}
              onLoadMore={() => void searchQuery.fetchNextPage()}
              onInstall={setInstallTarget}
            />
          )}
        </div>
      </ManagementWorkbench>
      {dialogs}
    </TooltipProvider>
  );
}

function PiToolbar({
  tab,
  search,
  statusFilter,
  sourceFilter,
  scopeFilter,
  projectSelected,
  packageStatuses,
  discoverInput,
  isDiscoverSearching,
  isRefreshing,
  configMutable,
  onSearchChange,
  onStatusChange,
  onSourceChange,
  onScopeChange,
  onDiscoverInputChange,
  onDiscover,
  onAdd,
  onRefresh,
}: {
  tab: PanelTab;
  search: string;
  statusFilter: string;
  sourceFilter: string;
  scopeFilter: ScopeFilter;
  projectSelected: boolean;
  packageStatuses: PiPackageStatus[];
  discoverInput: string;
  isDiscoverSearching: boolean;
  isRefreshing: boolean;
  configMutable: boolean;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onSourceChange: (value: string) => void;
  onScopeChange: (value: string) => void;
  onDiscoverInputChange: (value: string) => void;
  onDiscover: () => void;
  onAdd: () => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const statuses = tab === "extensions" ? extensionStatuses : packageStatuses;
  const searchValue = tab === "discover" ? discoverInput : search;
  const setSearchValue =
    tab === "discover" ? onDiscoverInputChange : onSearchChange;

  return (
    <ResourceToolbar
      className="pi-extensions-toolbar"
      aria-label={t("piExtensions.toolbar")}
      search={
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            onKeyDown={(event) => {
              if (tab === "discover" && event.key === "Enter") onDiscover();
            }}
            className="h-8 pl-8 pr-8"
            placeholder={
              tab === "discover"
                ? t("piExtensions.discover.placeholder")
                : t("piExtensions.searchPlaceholder")
            }
            aria-label={
              tab === "discover"
                ? t("piExtensions.discover.placeholder")
                : t("piExtensions.searchPlaceholder")
            }
          />
          {searchValue && (
            <button
              type="button"
              onClick={() => setSearchValue("")}
              aria-label={t("common.clearSearch")}
              className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      }
      primaryFilters={
        tab === "discover" ? (
          <Button
            type="button"
            size="sm"
            className="h-8"
            disabled={discoverInput.trim().length < 2 || isDiscoverSearching}
            onClick={onDiscover}
          >
            {isDiscoverSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {isDiscoverSearching
              ? t("piExtensions.discover.searching")
              : t("common.search")}
          </Button>
        ) : (
          <>
            <Select value={scopeFilter} onValueChange={onScopeChange}>
              <SelectTrigger
                className="pi-extensions-scope-filter h-8"
                aria-label={t("piExtensions.filters.scope")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("piExtensions.filters.allScopes")}
                </SelectItem>
                <SelectItem value="global">
                  {t("piExtensions.scope.global")}
                </SelectItem>
                <SelectItem value="project" disabled={!projectSelected}>
                  {t("piExtensions.scope.project")}
                </SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={onStatusChange}>
              <SelectTrigger
                className="pi-extensions-status-filter h-8"
                aria-label={t("piExtensions.filters.status")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("piExtensions.filters.allStatuses")}
                </SelectItem>
                {statuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {t(`piExtensions.status.${status}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={onSourceChange}>
              <SelectTrigger
                className="pi-extensions-source-filter h-8"
                aria-label={t("piExtensions.filters.source")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("piExtensions.filters.allSources")}
                </SelectItem>
                {(tab === "extensions"
                  ? ["auto", "local", "npm", "git"]
                  : ["local", "npm", "git"]
                ).map((source) => (
                  <SelectItem key={source} value={source}>
                    {t(`piExtensions.source.${source}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )
      }
      actions={
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={isRefreshing}
            onClick={onRefresh}
            aria-label={t("piExtensions.actions.refresh")}
            title={t("piExtensions.actions.refresh")}
          >
            <RefreshCw
              className={cn("h-4 w-4", isRefreshing && "animate-spin")}
            />
          </Button>
          <Button
            type="button"
            size="sm"
            className="pi-extensions-add h-8"
            disabled={!configMutable}
            onClick={onAdd}
          >
            <Plus className="h-4 w-4" />
            {t("piExtensions.add")}
          </Button>
        </>
      }
    />
  );
}

function RuntimeHealthBand({ runtime }: { runtime: PiRuntimeInfo }) {
  const { t } = useTranslation();
  const {
    scope,
    projectDir,
    piDir,
    settingsPath,
    mutable,
    cliAvailable,
    cliVersion,
    error,
  } = runtime;
  return (
    <section
      className="pi-runtime-health border-b border-border/70 py-2.5"
      aria-label={t("piExtensions.runtime.title")}
    >
      <div className="pi-runtime-health-grid">
        <ScopeBadge scope={scope} />
        <div className="pi-runtime-path" title={piDir}>
          <span>{t("piExtensions.runtime.piDir")}</span>
          <strong>{piDir}</strong>
        </div>
        <div className="pi-runtime-path" title={settingsPath}>
          <span>{t("piExtensions.runtime.settings")}</span>
          <strong>{settingsPath}</strong>
        </div>
        <div className="pi-runtime-statuses">
          <StatusBadge status={mutable ? "success" : "error"}>
            {mutable
              ? t("piExtensions.runtime.configWritable")
              : t("piExtensions.runtime.configReadOnly")}
          </StatusBadge>
          <StatusBadge status={cliAvailable ? "success" : "warning"}>
            {cliAvailable
              ? t("piExtensions.summary.cliAvailable", {
                  version: cliVersion || "",
                })
              : t("piExtensions.summary.cliUnavailable")}
          </StatusBadge>
        </div>
      </div>
      {error && (
        <div className="mt-2 flex items-start gap-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}
      {projectDir && (
        <div
          className="mt-2 truncate text-xs text-muted-foreground"
          title={projectDir}
        >
          {projectDir}
        </div>
      )}
    </section>
  );
}

function ScopeBadge({ scope }: { scope: PiExtensionScope }) {
  const { t } = useTranslation();
  return (
    <Badge
      variant={scope === "global" ? "secondary" : "outline"}
      className="h-5 shrink-0 rounded px-1.5"
    >
      {t(`piExtensions.scope.${scope}`)}
    </Badge>
  );
}

function ProjectSelector({
  projectDir,
  trusted,
  onSelect,
  onClear,
  onTrust,
}: {
  projectDir: string;
  trusted: boolean;
  onSelect: () => void;
  onClear: () => void;
  onTrust: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="pi-project-selector flex min-w-0 items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 min-w-0 max-w-64"
        onClick={onSelect}
      >
        <FolderOpen className="h-4 w-4 shrink-0" />
        <span className="truncate">
          {projectDir || t("piExtensions.project.select")}
        </span>
      </Button>
      {projectDir && !trusted && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={onTrust}
        >
          {t("piExtensions.project.trust")}
        </Button>
      )}
      {projectDir && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onClear}
          aria-label={t("piExtensions.project.clear")}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

function ProjectTrustBanner({
  projectDir,
  onTrust,
}: {
  projectDir: string;
  onTrust: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="flex items-center gap-3 border-x border-b border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {t("piExtensions.project.untrusted")}
        </p>
        <p
          className="truncate text-xs text-muted-foreground"
          title={projectDir}
        >
          {projectDir}
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onTrust}>
        {t("piExtensions.project.trust")}
      </Button>
    </section>
  );
}

function ProjectSelectionGuide({ onSelect }: { onSelect: () => void }) {
  const { t } = useTranslation();
  return (
    <WorkbenchEmptyState
      icon={<FolderOpen className="h-5 w-5" />}
      title={t("piExtensions.project.required")}
      description={t("piExtensions.project.requiredDescription")}
      actions={
        <Button size="sm" onClick={onSelect}>
          {t("piExtensions.project.select")}
        </Button>
      }
    />
  );
}

function ExtensionConflictBanner({
  extensions,
  onSelect,
}: {
  extensions: PiExtension[];
  onSelect: (item: PiExtension) => void;
}) {
  const { t } = useTranslation();
  const conflicting = extensions.filter(
    (extension) => extension.enabled && extension.status === "conflict",
  );
  return (
    <section
      className="flex items-center gap-3 border-x border-b border-destructive/30 bg-destructive/5 px-3 py-2.5"
      role="alert"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {t("piExtensions.conflicts.bannerTitle", {
            count: conflicting.length,
          })}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {t("piExtensions.conflicts.bannerDescription")}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={() => onSelect(conflicting[0])}
      >
        {t("piExtensions.conflicts.review")}
      </Button>
    </section>
  );
}

function ExtensionInventory({
  extensions,
  hasFilters,
  configMutable,
  togglePendingId,
  unregisterPending,
  onAdd,
  onSelect,
  onToggle,
  onUnregister,
}: {
  extensions: PiExtension[];
  hasFilters: boolean;
  configMutable: boolean;
  togglePendingId?: string | null;
  unregisterPending: boolean;
  onAdd: () => void;
  onSelect: (item: PiExtension) => void;
  onToggle: (item: PiExtension, enabled: boolean) => void;
  onUnregister: (item: PiExtension) => void;
}) {
  const { t } = useTranslation();
  if (extensions.length === 0) {
    return (
      <WorkbenchEmptyState
        icon={<Puzzle className="h-5 w-5" />}
        title={t(
          hasFilters
            ? "piExtensions.empty.noExtensionResults"
            : "piExtensions.empty.noExtensions",
        )}
        actions={
          !hasFilters ? (
            <Button size="sm" disabled={!configMutable} onClick={onAdd}>
              <Plus className="h-4 w-4" />
              {t("piExtensions.add")}
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="divide-y divide-border border-x border-b border-border">
      {extensions.map((extension) => {
        const adapterManaged =
          extension.scope === "global" &&
          isPiMcpAdapterSource(extension.packageSource);
        const toggleBlocked =
          ["missing", "invalid"].includes(extension.status) ||
          adapterManaged ||
          !configMutable;
        return (
          <div key={extension.id} className="pi-extension-list-row">
            <button
              type="button"
              className="pi-extension-list-main min-w-0 text-left"
              onClick={() => onSelect(extension)}
            >
              <div className="pi-resource-title">
                <Puzzle className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm font-medium">
                  {extension.name}
                </span>
                <Badge variant="secondary" className="h-5 rounded px-1.5">
                  {t(`piExtensions.source.${extension.sourceType}`)}
                </Badge>
                <ScopeBadge scope={extension.scope} />
                {adapterManaged && (
                  <StatusBadge status="protected" className="h-5 px-1.5">
                    {t("piExtensions.adapterBadge")}
                  </StatusBadge>
                )}
              </div>
              <div className="pi-resource-meta">
                <span className="truncate">{extension.path}</span>
                {extension.packageSource && (
                  <span className="shrink-0 truncate">
                    {extension.packageSource}
                  </span>
                )}
              </div>
            </button>
            <div className="pi-extension-list-actions">
              <StatusBadge status={statusTone(extension.status)}>
                {t(`piExtensions.status.${extension.status}`)}
              </StatusBadge>
              {togglePendingId === extension.resourceKey ? (
                <Loader2 className="mx-2 h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex">
                      <Switch
                        checked={extension.enabled}
                        disabled={toggleBlocked || Boolean(togglePendingId)}
                        onCheckedChange={(enabled) =>
                          onToggle(extension, enabled)
                        }
                        aria-label={t("piExtensions.actions.toggle", {
                          name: extension.name,
                        })}
                      />
                    </span>
                  </TooltipTrigger>
                  {toggleBlocked && (
                    <TooltipContent>
                      {adapterManaged
                        ? t("piExtensions.actions.adapterManaged")
                        : ["missing", "invalid"].includes(extension.status)
                          ? t("piExtensions.actions.toggleUnavailable")
                          : t("piExtensions.actions.configUnavailable")}
                    </TooltipContent>
                  )}
                </Tooltip>
              )}
              <ExtensionActions
                extension={extension}
                disabled={unregisterPending || !configMutable}
                onDetails={() => onSelect(extension)}
                onUnregister={() => onUnregister(extension)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ExtensionActions({
  extension,
  disabled,
  onDetails,
  onUnregister,
}: {
  extension: PiExtension;
  disabled: boolean;
  onDetails: () => void;
  onUnregister: () => void;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label={t("common.moreActions")}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onDetails}>
          <FolderCog className="h-4 w-4" />
          {t("piExtensions.actions.details")}
        </DropdownMenuItem>
        {extension.origin === "local" && (
          <DropdownMenuItem
            disabled={disabled}
            className="text-destructive focus:text-destructive"
            onSelect={onUnregister}
          >
            <Trash2 className="h-4 w-4" />
            {t("piExtensions.actions.unregisterLocal", {
              name: extension.name,
            })}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PackageInventory({
  packages,
  hasFilters,
  expanded,
  cliAvailable,
  removePending,
  onAdd,
  onExpand,
  onSelect,
  onSelectExtension,
  onRemove,
}: {
  packages: PiPackage[];
  hasFilters: boolean;
  expanded: Set<string>;
  cliAvailable: boolean;
  removePending: boolean;
  onAdd: () => void;
  onExpand: (id: string) => void;
  onSelect: (item: PiPackage) => void;
  onSelectExtension: (item: PiExtension) => void;
  onRemove: (item: PiPackage) => void;
}) {
  const { t } = useTranslation();
  if (packages.length === 0) {
    return (
      <WorkbenchEmptyState
        icon={<Package className="h-5 w-5" />}
        title={t(
          hasFilters
            ? "piExtensions.empty.noPackageResults"
            : "piExtensions.empty.noPackages",
        )}
        actions={
          !hasFilters ? (
            <Button size="sm" onClick={onAdd}>
              <Plus className="h-4 w-4" />
              {t("piExtensions.add")}
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="divide-y divide-border border-x border-b border-border">
      {packages.map((packageItem) => {
        const isExpanded = expanded.has(packageItem.id);
        const adapterManaged =
          packageItem.scope === "global" &&
          isPiMcpAdapterSource(packageItem.source);
        const removeProtected =
          adapterManaged || packageItem.status === "missing";
        return (
          <div key={packageItem.id}>
            <div className="pi-package-row">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => onExpand(packageItem.id)}
                aria-expanded={isExpanded}
                aria-label={t("piExtensions.packages.toggleResources", {
                  name: packageItem.displayName,
                })}
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
              <button
                type="button"
                className="pi-package-main min-w-0 text-left"
                onClick={() => onSelect(packageItem)}
              >
                <div className="pi-resource-title">
                  <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">
                    {packageItem.displayName}
                  </span>
                  {packageItem.version && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      v{packageItem.version}
                    </span>
                  )}
                  {adapterManaged && (
                    <StatusBadge status="protected" className="h-5 px-1.5">
                      {t("piExtensions.adapterBadge")}
                    </StatusBadge>
                  )}
                  <ScopeBadge scope={packageItem.scope} />
                </div>
                <div className="pi-resource-meta">{packageItem.source}</div>
              </button>
              <div className="pi-package-actions">
                <ResourceSummary packageItem={packageItem} />
                <StatusBadge status={statusTone(packageItem.status)}>
                  {t(`piExtensions.status.${packageItem.status}`)}
                </StatusBadge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={t("common.moreActions")}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onSelect(packageItem)}>
                      <FolderCog className="h-4 w-4" />
                      {t("piExtensions.actions.details")}
                    </DropdownMenuItem>
                    {!removeProtected && (
                      <DropdownMenuItem
                        disabled={removePending || !cliAvailable}
                        className="text-destructive focus:text-destructive"
                        onSelect={() => onRemove(packageItem)}
                      >
                        <Trash2 className="h-4 w-4" />
                        {t("piExtensions.actions.removePackage")}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            {isExpanded && (
              <div
                className="border-t border-border/70 bg-muted/20 py-1"
                role="region"
                aria-label={t("piExtensions.packages.resources", {
                  name: packageItem.displayName,
                })}
              >
                {packageItem.extensions.length > 0 ? (
                  packageItem.extensions.map((extension) => (
                    <button
                      key={extension.id}
                      type="button"
                      className="flex min-h-10 w-full min-w-0 items-center gap-2 px-10 py-1.5 text-left hover:bg-muted/60"
                      onClick={() => onSelectExtension(extension)}
                    >
                      <Puzzle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {extension.name}
                      </span>
                      <span className="max-w-[45%] truncate text-xs text-muted-foreground">
                        {extension.path}
                      </span>
                      <StatusBadge
                        status={statusTone(extension.status)}
                        className="h-5 px-1.5"
                      >
                        {t(`piExtensions.status.${extension.status}`)}
                      </StatusBadge>
                    </button>
                  ))
                ) : (
                  <div className="px-10 py-2 text-xs text-muted-foreground">
                    {t("piExtensions.packages.noExtensionResources")}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ResourceSummary({ packageItem }: { packageItem: PiPackage }) {
  const { t } = useTranslation();
  return (
    <div
      className="pi-extension-resource-counts flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
      aria-label={t("piExtensions.details.resourceCounts", {
        extensions: packageItem.extensionCount,
        skills: packageItem.skillCount,
        prompts: packageItem.promptCount,
        themes: packageItem.themeCount,
      })}
    >
      <span>{t("piExtensions.resources.extensionsCompact")}</span>
      <strong>{packageItem.extensionCount}</strong>
      <span>{t("piExtensions.resources.skillsCompact")}</span>
      <strong>{packageItem.skillCount}</strong>
      <span>{t("piExtensions.resources.promptsCompact")}</span>
      <strong>{packageItem.promptCount}</strong>
      <span>{t("piExtensions.resources.themesCompact")}</span>
      <strong>{packageItem.themeCount}</strong>
    </div>
  );
}

function DiscoverDirectory({
  query,
  items,
  loading,
  refreshing,
  loadingMore,
  error,
  nextPageError,
  hasMore,
  cliAvailable,
  installPending,
  onRetry,
  onLoadMore,
  onInstall,
}: {
  query: string;
  items: PiPackageSearchItem[];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: unknown;
  nextPageError: boolean;
  hasMore: boolean;
  cliAvailable: boolean;
  installPending: boolean;
  onRetry: () => void;
  onLoadMore: () => void;
  onInstall: (item: PiPackageSearchItem) => void;
}) {
  const { t } = useTranslation();
  if (!query) {
    return (
      <WorkbenchEmptyState
        icon={<Search className="h-5 w-5" />}
        title={t("piExtensions.discover.initial")}
        description={t("piExtensions.discover.minimumQuery")}
      />
    );
  }
  if (loading && items.length === 0) {
    return (
      <div
        className="pi-discover-loading flex min-h-64 flex-col items-center justify-center gap-3"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">
          {t("piExtensions.discover.searching")}
        </span>
      </div>
    );
  }
  if (error && items.length === 0) {
    return (
      <WorkbenchEmptyState
        icon={<AlertTriangle className="h-5 w-5" />}
        title={t("piExtensions.discover.failed")}
        description={extractErrorMessage(error)}
        actions={<Button onClick={onRetry}>{t("common.refresh")}</Button>}
      />
    );
  }
  if (items.length === 0) {
    return (
      <WorkbenchEmptyState
        icon={<Package className="h-5 w-5" />}
        title={t("piExtensions.discover.noResults", { query })}
      />
    );
  }

  return (
    <div className="pi-discover-results" aria-busy={refreshing || loadingMore}>
      <div className="pi-discover-results-header flex items-center justify-between gap-3 border-x border-b border-border px-3 py-2 text-xs text-muted-foreground">
        <span>
          {t("piExtensions.discover.loadedCount", { count: items.length })}
        </span>
        {refreshing && (
          <span
            className="flex items-center gap-1.5"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("piExtensions.discover.refreshing")}
          </span>
        )}
      </div>
      <div className="divide-y divide-border border-x border-b border-border">
        {items.map((packageItem) => {
          const externalUrl =
            packageItem.npmUrl ||
            packageItem.repositoryUrl ||
            packageItem.homepageUrl;
          return (
            <div
              key={`${packageItem.name}@${packageItem.version}`}
              className="pi-discover-row"
            >
              <Package className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="pi-discover-main min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="min-w-0 break-all text-sm font-medium">
                    {packageItem.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    v{packageItem.version}
                  </span>
                  {packageItem.publisher && (
                    <span className="text-xs text-muted-foreground">
                      {packageItem.publisher}
                    </span>
                  )}
                  {packageItem.downloads !== undefined && (
                    <span className="text-xs text-muted-foreground">
                      {t("piExtensions.discover.downloads", {
                        value: compactNumber(packageItem.downloads),
                      })}
                    </span>
                  )}
                  {packageItem.resourceTypes.map((resourceType) => (
                    <Badge
                      key={resourceType}
                      variant="secondary"
                      className="h-5 rounded px-1.5 font-normal"
                    >
                      {resourceType}
                    </Badge>
                  ))}
                  {packageItem.manifestStatus !== "available" && (
                    <StatusBadge status="warning" className="h-5 px-1.5">
                      {t("piExtensions.discover.manifestUnavailable")}
                    </StatusBadge>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {packageItem.description ||
                    t("piExtensions.discover.noDescription")}
                </p>
              </div>
              <div className="pi-discover-actions">
                {externalUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => void settingsApi.openExternal(externalUrl)}
                    aria-label={t("piExtensions.discover.openExternal")}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  className="h-7"
                  disabled={
                    packageItem.installed || installPending || !cliAvailable
                  }
                  title={
                    !cliAvailable
                      ? t("piExtensions.actions.cliRequired")
                      : undefined
                  }
                  onClick={() => onInstall(packageItem)}
                >
                  {packageItem.installed
                    ? t("piExtensions.discover.installed")
                    : t("piExtensions.discover.install")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      {(hasMore || nextPageError) && (
        <div
          className="pi-discover-pagination flex justify-center border-x border-b border-border py-3"
          role="status"
          aria-live="polite"
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={onLoadMore}
          >
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
            {loadingMore
              ? t("piExtensions.discover.loadingMore")
              : nextPageError
                ? t("piExtensions.discover.retryMore")
                : t("piExtensions.discover.loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}

function PiDetailPage({
  target,
  configMutable,
  cliAvailable,
  togglePending,
  removePending,
  unregisterPending,
  onToggle,
  onRemove,
  onUnregister,
}: {
  target: Exclude<DetailTarget, null>;
  configMutable: boolean;
  cliAvailable: boolean;
  togglePending: boolean;
  removePending: boolean;
  unregisterPending: boolean;
  onToggle: (item: PiExtension, enabled: boolean) => void;
  onRemove: (item: PiPackage) => void;
  onUnregister: (item: PiExtension) => void;
}) {
  if (target.type === "extension") {
    return (
      <ExtensionDetailPane
        item={target.item}
        configMutable={configMutable}
        togglePending={togglePending}
        unregisterPending={unregisterPending}
        onToggle={onToggle}
        onUnregister={onUnregister}
      />
    );
  }
  return (
    <PackageDetailPane
      item={target.item}
      cliAvailable={cliAvailable}
      removePending={removePending}
      onRemove={onRemove}
    />
  );
}

function DetailRows({ rows }: { rows: Array<[string, string | undefined]> }) {
  const { t } = useTranslation();
  return (
    <dl className="grid grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)] gap-x-8 gap-y-3 text-sm">
      {rows.map(([key, value]) =>
        value ? (
          <div key={key} className="contents">
            <dt className="text-muted-foreground">
              {t(`piExtensions.details.fields.${key}`)}
            </dt>
            <dd className="min-w-0 break-all">{value}</dd>
          </div>
        ) : null,
      )}
    </dl>
  );
}

function ExtensionDetailPane({
  item,
  configMutable,
  togglePending,
  unregisterPending,
  onToggle,
  onUnregister,
}: {
  item: PiExtension;
  configMutable: boolean;
  togglePending: boolean;
  unregisterPending: boolean;
  onToggle: (item: PiExtension, enabled: boolean) => void;
  onUnregister: (item: PiExtension) => void;
}) {
  const { t } = useTranslation();
  const adapterManaged =
    item.scope === "global" && isPiMcpAdapterSource(item.packageSource);
  const rows: Array<[string, string | undefined]> = [
    ["scope", t(`piExtensions.scope.${item.scope}`)],
    ["projectDir", item.projectDir],
    ["resourceKey", item.resourceKey],
    ["source", item.packageSource || item.sourceType],
    ["ownership", item.origin],
    ["package", item.packageId],
    ["path", item.path],
    ["version", item.version],
    ["status", t(`piExtensions.status.${item.status}`)],
    ["error", item.error],
  ];

  return (
    <section className="pi-extension-detail-page flex min-h-0 flex-1 flex-col overflow-hidden px-6">
      <div className="min-h-0 flex-1 overflow-y-auto py-6">
        <div className="mx-auto w-full max-w-5xl space-y-6">
          <div className="flex min-w-0 items-start gap-4 border-b border-border pb-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-border bg-muted/50 text-muted-foreground">
              <Puzzle className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="break-all text-sm text-muted-foreground">
                {item.packageSource ||
                  t(`piExtensions.source.${item.sourceType}`)}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={statusTone(item.status)}>
                  {t(`piExtensions.status.${item.status}`)}
                </StatusBadge>
                {adapterManaged && (
                  <StatusBadge status="protected">
                    {t("piExtensions.adapterBadge")}
                  </StatusBadge>
                )}
                <StatusBadge status={item.enabled ? "success" : "muted"}>
                  {item.enabled
                    ? t("piExtensions.actions.enabled")
                    : t("piExtensions.actions.disabled")}
                </StatusBadge>
              </div>
            </div>
          </div>
          <section className="space-y-4" aria-labelledby="pi-extension-info">
            <h2 id="pi-extension-info" className="text-sm font-semibold">
              {t("piExtensions.details.extension")}
            </h2>
            <DetailRows rows={rows} />
          </section>
          <ExtensionRegistrationSection item={item} />
          <ExtensionConflictSection
            item={item}
            configMutable={configMutable}
            togglePending={togglePending}
            onToggle={onToggle}
          />
          {adapterManaged && (
            <div className="border-l-2 border-indigo-500 pl-3 text-sm text-muted-foreground">
              {t("piExtensions.actions.adapterManaged")}
            </div>
          )}
          <section className="space-y-3" aria-labelledby="pi-extension-actions">
            <h2 id="pi-extension-actions" className="text-sm font-semibold">
              {t("piExtensions.details.capabilities")}
            </h2>
            <div className="flex flex-wrap gap-2">
              <StatusBadge
                status={
                  configMutable &&
                  !adapterManaged &&
                  !["missing", "invalid"].includes(item.status)
                    ? "success"
                    : "muted"
                }
              >
                {t("piExtensions.details.toggleCapability")}
              </StatusBadge>
              <StatusBadge
                status={
                  configMutable && item.origin === "local" ? "success" : "muted"
                }
              >
                {t("piExtensions.details.unregisterCapability")}
              </StatusBadge>
            </div>
          </section>
        </div>
      </div>
      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border py-3">
        <>
          {item.origin === "local" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!configMutable || unregisterPending}
              onClick={() => onUnregister(item)}
            >
              {t("piExtensions.unregisterConfirm.confirm")}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            disabled={
              !configMutable ||
              togglePending ||
              adapterManaged ||
              ["missing", "invalid"].includes(item.status)
            }
            onClick={() => onToggle(item, !item.enabled)}
          >
            {item.enabled
              ? t("piExtensions.actions.disable")
              : t("piExtensions.actions.enable")}
          </Button>
        </>
      </footer>
    </section>
  );
}

function ExtensionRegistrationSection({ item }: { item: PiExtension }) {
  const { t } = useTranslation();
  return (
    <section className="space-y-3" aria-labelledby="pi-extension-registrations">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="pi-extension-registrations" className="text-sm font-semibold">
          {t("piExtensions.conflicts.registrations")}
        </h2>
        <StatusBadge status={item.analysisComplete ? "success" : "warning"}>
          {item.analysisComplete
            ? t("piExtensions.conflicts.analysisComplete")
            : t("piExtensions.conflicts.analysisIncomplete")}
        </StatusBadge>
      </div>
      {item.registrations.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {item.registrations.map((registration) => (
            <Badge
              key={`${registration.kind}:${registration.name}`}
              variant="outline"
              className="font-mono"
            >
              {t(`piExtensions.conflicts.kinds.${registration.kind}`)}{" "}
              {registration.kind === "command" && "/"}
              {registration.kind === "flag" && "--"}
              {registration.name}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("piExtensions.conflicts.noRegistrations")}
        </p>
      )}
      {!item.analysisComplete && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("piExtensions.conflicts.dynamicWarning")}
        </p>
      )}
    </section>
  );
}

function ExtensionConflictSection({
  item,
  configMutable,
  togglePending,
  onToggle,
}: {
  item: PiExtension;
  configMutable: boolean;
  togglePending: boolean;
  onToggle: (item: PiExtension, enabled: boolean) => void;
}) {
  const { t } = useTranslation();
  if (item.conflicts.length === 0) return null;
  return (
    <section className="space-y-3" aria-labelledby="pi-extension-conflicts">
      <h2 id="pi-extension-conflicts" className="text-sm font-semibold">
        {t("piExtensions.conflicts.title")}
      </h2>
      <div className="divide-y divide-border border border-border">
        {item.conflicts.map((conflict) => (
          <div
            key={`${conflict.kind}:${conflict.name}:${conflict.otherExtensionId}`}
            className="flex min-w-0 items-center gap-3 px-3 py-2.5"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {t(`piExtensions.conflicts.kinds.${conflict.kind}`)}{" "}
                <span className="font-mono">{conflict.name}</span>
              </p>
              <p
                className="truncate text-xs text-muted-foreground"
                title={conflict.otherExtensionPath}
              >
                {t("piExtensions.conflicts.withExtension", {
                  name: conflict.otherExtensionName,
                })}{" "}
                · {t(`piExtensions.scope.${conflict.otherExtensionScope}`)}
              </p>
            </div>
          </div>
        ))}
      </div>
      {item.enabled && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!configMutable || togglePending}
          onClick={() => onToggle(item, false)}
        >
          {t("piExtensions.conflicts.disableThis")}
        </Button>
      )}
    </section>
  );
}

function PackageDetailPane({
  item,
  cliAvailable,
  removePending,
  onRemove,
}: {
  item: PiPackage;
  cliAvailable: boolean;
  removePending: boolean;
  onRemove: (item: PiPackage) => void;
}) {
  const { t } = useTranslation();
  const adapterManaged =
    item.scope === "global" && isPiMcpAdapterSource(item.source);
  const rows: Array<[string, string | undefined]> = [
    ["scope", t(`piExtensions.scope.${item.scope}`)],
    ["projectDir", item.projectDir],
    ["resourceKey", item.resourceKey],
    ["source", item.source],
    ["path", item.installedPath],
    ["version", item.version],
    ["status", t(`piExtensions.status.${item.status}`)],
    [
      "resources",
      t("piExtensions.details.resourceCounts", {
        extensions: item.extensionCount,
        skills: item.skillCount,
        prompts: item.promptCount,
        themes: item.themeCount,
      }),
    ],
    ["error", item.error],
  ];

  return (
    <section className="pi-package-detail-page flex min-h-0 flex-1 flex-col overflow-hidden px-6">
      <div className="min-h-0 flex-1 overflow-y-auto py-6">
        <div className="mx-auto w-full max-w-5xl space-y-6">
          <div className="flex min-w-0 items-start gap-4 border-b border-border pb-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-border bg-muted/50 text-muted-foreground">
              <Package className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="break-all text-sm text-muted-foreground">
                {item.source}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={statusTone(item.status)}>
                  {t(`piExtensions.status.${item.status}`)}
                </StatusBadge>
                {adapterManaged && (
                  <StatusBadge status="protected">
                    {t("piExtensions.adapterBadge")}
                  </StatusBadge>
                )}
              </div>
            </div>
          </div>
          <section className="space-y-4" aria-labelledby="pi-package-info">
            <h2 id="pi-package-info" className="text-sm font-semibold">
              {t("piExtensions.details.package")}
            </h2>
            <DetailRows rows={rows} />
          </section>
          {adapterManaged && (
            <div className="border-l-2 border-indigo-500 pl-3 text-sm text-muted-foreground">
              {t("piExtensions.actions.adapterManagedPackage")}
            </div>
          )}
        </div>
      </div>
      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border py-3">
        {!adapterManaged && item.status !== "missing" ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={!cliAvailable || removePending}
            onClick={() => onRemove(item)}
          >
            {t("piExtensions.actions.removePackage")}
          </Button>
        ) : null}
      </footer>
    </section>
  );
}
