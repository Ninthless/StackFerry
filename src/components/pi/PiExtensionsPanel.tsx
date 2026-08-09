import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Box,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Info,
  Loader2,
  Package,
  Plus,
  Puzzle,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  type PiExtension,
  type PiPackage,
  type PiPackageSearchItem,
} from "@/lib/api/piExtensions";
import { settingsApi } from "@/lib/api";
import {
  useInstallPiPackage,
  usePiExtensionInventory,
  useRegisterPiLocalExtension,
  useRemovePiPackage,
  useSearchPiPackages,
  useSetPiExtensionEnabled,
  useUnregisterPiLocalExtension,
} from "@/hooks/usePiExtensions";
import { extractErrorMessage } from "@/utils/errorUtils";
import { cn } from "@/lib/utils";
import { PiPackageInstallDialog } from "@/components/pi/PiPackageInstallDialog";
import { WorkbenchEmptyState } from "@/components/common/WorkbenchEmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type PanelTab = "extensions" | "packages" | "discover";
type DetailTarget =
  | { type: "extension"; item: PiExtension }
  | { type: "package"; item: PiPackage }
  | null;

const PAGE_SIZE = 12;
const brokenStatuses = new Set(["missing", "invalid", "conflict"]);

const statusClass = (status: string) => {
  if (status === "active" || status === "installed") {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (status === "disabled") {
    return "border-border bg-muted text-muted-foreground";
  }
  return "border-destructive/25 bg-destructive/10 text-destructive";
};

const compactNumber = (value: number) =>
  new Intl.NumberFormat(undefined, { notation: "compact" }).format(value);

const isPiMcpAdapterSource = (source?: string) => {
  const normalized = source?.trim().toLocaleLowerCase().replace(/^npm:/, "");
  return (
    normalized === "pi-mcp-adapter" ||
    normalized?.startsWith("pi-mcp-adapter@") === true
  );
};

export default function PiExtensionsPanel() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<PanelTab>("extensions");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [installOpen, setInstallOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<DetailTarget>(null);
  const [removeTarget, setRemoveTarget] = useState<PiPackage | null>(null);
  const [unregisterTarget, setUnregisterTarget] = useState<PiExtension | null>(
    null,
  );
  const [discoverInput, setDiscoverInput] = useState("");
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [discoverOffset, setDiscoverOffset] = useState(0);
  const [installTarget, setInstallTarget] =
    useState<PiPackageSearchItem | null>(null);

  const inventoryQuery = usePiExtensionInventory();
  const inventory = inventoryQuery.data;
  const searchQuery = useSearchPiPackages(
    discoverQuery,
    discoverOffset,
    PAGE_SIZE,
  );
  const toggleMutation = useSetPiExtensionEnabled();
  const removeMutation = useRemovePiPackage();
  const installMutation = useInstallPiPackage();
  const registerMutation = useRegisterPiLocalExtension();
  const unregisterMutation = useUnregisterPiLocalExtension();

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
      return matchesQuery && matchesStatus && matchesSource;
    });
  }, [inventory?.extensions, search, sourceFilter, statusFilter]);

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
      return matchesQuery && matchesStatus && matchesSource;
    });
  }, [inventory?.packages, search, sourceFilter, statusFilter]);

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
    sourceFilter !== "all";
  const canMutate =
    inventory?.runtime.mutable === true &&
    inventory.runtime.cliAvailable === true;

  const reportError = (key: string, error: unknown) => {
    toast.error(t(key), { description: extractErrorMessage(error) });
  };

  const handleToggle = async (extension: PiExtension, enabled: boolean) => {
    try {
      await toggleMutation.mutateAsync({ id: extension.id, enabled });
    } catch (error) {
      reportError("piExtensions.messages.toggleFailed", error);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    try {
      await removeMutation.mutateAsync(removeTarget.source);
      toast.success(
        t("piExtensions.messages.removeSuccess", {
          name: removeTarget.displayName,
        }),
      );
      setRemoveTarget(null);
    } catch (error) {
      reportError("piExtensions.messages.removeFailed", error);
    }
  };

  const handleInstall = async (source: string) => {
    await installMutation.mutateAsync(source);
    toast.success(t("piExtensions.messages.installSuccess"));
    setInstallOpen(false);
  };

  const handleRegister = async (path: string) => {
    await registerMutation.mutateAsync(path);
    toast.success(t("piExtensions.messages.registerSuccess"));
    setInstallOpen(false);
  };

  const handleUnregister = async () => {
    if (!unregisterTarget) return;
    try {
      await unregisterMutation.mutateAsync(unregisterTarget.path);
      toast.success(
        t("piExtensions.messages.unregisterSuccess", {
          name: unregisterTarget.name,
        }),
      );
      setUnregisterTarget(null);
    } catch (error) {
      reportError("piExtensions.messages.unregisterFailed", error);
    }
  };

  const handleConfirmDiscoverInstall = async () => {
    if (!installTarget) return;
    try {
      await installMutation.mutateAsync(installTarget.source);
      toast.success(
        t("piExtensions.messages.installNamedSuccess", {
          name: installTarget.name,
        }),
      );
      setInstallTarget(null);
    } catch (error) {
      reportError("piExtensions.messages.installFailed", error);
    }
  };

  const submitDiscovery = () => {
    const query = discoverInput.trim();
    if (!query) return;
    setDiscoverOffset(0);
    setDiscoverQuery(query);
  };

  const renderStatusBadge = (status: string) => (
    <Badge variant="outline" className={cn("shrink-0", statusClass(status))}>
      {t(`piExtensions.status.${status}`)}
    </Badge>
  );

  const mutationUnavailableReason = !inventory?.runtime.mutable
    ? inventory?.runtime.error || t("piExtensions.actions.configUnavailable")
    : !inventory.runtime.cliAvailable
      ? t("piExtensions.actions.cliRequired")
      : undefined;

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

  return (
    <TooltipProvider>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6">
        <div className="shrink-0 border-b border-border py-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            <span>
              <span className="text-muted-foreground">
                {t("piExtensions.summary.extensions")}
              </span>{" "}
              <strong>{inventory.extensions.length}</strong>
            </span>
            <span>
              <span className="text-muted-foreground">
                {t("piExtensions.summary.enabled")}
              </span>{" "}
              <strong>{enabledCount}</strong>
            </span>
            <span>
              <span className="text-muted-foreground">
                {t("piExtensions.summary.packages")}
              </span>{" "}
              <strong>{inventory.packages.length}</strong>
            </span>
            <span>
              <span className="text-muted-foreground">
                {t("piExtensions.summary.issues")}
              </span>{" "}
              <strong className={issueCount > 0 ? "text-destructive" : ""}>
                {issueCount}
              </strong>
            </span>
            <span className="ml-auto flex min-w-0 items-center gap-1.5">
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  inventory.runtime.cliAvailable
                    ? "bg-emerald-500"
                    : "bg-destructive",
                )}
              />
              <span className="truncate text-muted-foreground">
                {inventory.runtime.cliAvailable
                  ? t("piExtensions.summary.cliAvailable", {
                      version: inventory.runtime.cliVersion || "",
                    })
                  : t("piExtensions.summary.cliUnavailable")}
              </span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={inventoryQuery.isFetching}
              onClick={() => void inventoryQuery.refetch()}
              aria-label={t("piExtensions.actions.refresh")}
              title={t("piExtensions.actions.refresh")}
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5",
                  inventoryQuery.isFetching && "animate-spin",
                )}
              />
            </Button>
          </div>
          {inventory.runtime.error && (
            <div className="mt-2 flex items-center gap-2 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{inventory.runtime.error}</span>
            </div>
          )}
        </div>

        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value as PanelTab);
            setSearch("");
            setStatusFilter("all");
            setSourceFilter("all");
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex shrink-0 flex-wrap items-center gap-3 py-3">
            <TabsList className="rounded-md border border-border bg-muted/35 p-1">
              <TabsTrigger value="extensions" className="min-w-[96px] py-1.5">
                {t("piExtensions.tabs.extensions")}
              </TabsTrigger>
              <TabsTrigger value="packages" className="min-w-[96px] py-1.5">
                {t("piExtensions.tabs.packages")}
              </TabsTrigger>
              <TabsTrigger value="discover" className="min-w-[96px] py-1.5">
                {t("piExtensions.tabs.discover")}
              </TabsTrigger>
            </TabsList>
            {tab !== "discover" && (
              <>
                <div className="relative min-w-[220px] flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="pl-9"
                    placeholder={t("piExtensions.searchPlaceholder")}
                    aria-label={t("piExtensions.searchPlaceholder")}
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger
                    className="w-[145px]"
                    aria-label={t("piExtensions.filters.status")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("piExtensions.filters.allStatuses")}
                    </SelectItem>
                    {[
                      "active",
                      "disabled",
                      "installed",
                      "missing",
                      "invalid",
                      "conflict",
                    ].map((status) => (
                      <SelectItem key={status} value={status}>
                        {t(`piExtensions.status.${status}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger
                    className="w-[135px]"
                    aria-label={t("piExtensions.filters.source")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("piExtensions.filters.allSources")}
                    </SelectItem>
                    {["auto", "local", "npm", "git"].map((source) => (
                      <SelectItem key={source} value={source}>
                        {t(`piExtensions.source.${source}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={!canMutate}
                  onClick={() => setInstallOpen(true)}
                  title={mutationUnavailableReason}
                >
                  <Plus className="h-4 w-4" />
                  {t("piExtensions.add")}
                </Button>
              </>
            )}
          </div>

          <TabsContent
            value="extensions"
            className="mt-0 min-h-0 flex-1 overflow-y-auto pb-8"
          >
            {filteredExtensions.length === 0 ? (
              <WorkbenchEmptyState
                icon={<Puzzle className="h-5 w-5" />}
                title={t(
                  hasFilters
                    ? "piExtensions.empty.noExtensionResults"
                    : "piExtensions.empty.noExtensions",
                )}
                actions={
                  !hasFilters ? (
                    <Button
                      size="sm"
                      disabled={!canMutate}
                      onClick={() => setInstallOpen(true)}
                      title={mutationUnavailableReason}
                    >
                      <Plus className="h-4 w-4" />
                      {t("piExtensions.add")}
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="border-y border-border">
                {filteredExtensions.map((extension, index) => {
                  const adapterManaged = isPiMcpAdapterSource(
                    extension.packageSource,
                  );
                  const toggleBlocked =
                    brokenStatuses.has(extension.status) || adapterManaged;
                  const togglePending =
                    toggleMutation.isPending &&
                    toggleMutation.variables?.id === extension.id;
                  return (
                    <div
                      key={extension.id}
                      className={cn(
                        "flex min-w-0 items-center gap-3 px-3 py-2.5 hover:bg-muted/60",
                        index < filteredExtensions.length - 1 &&
                          "border-b border-border",
                      )}
                    >
                      <Puzzle className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {extension.name}
                          </span>
                          <Badge
                            variant="secondary"
                            className="shrink-0 rounded-md px-1.5 font-normal"
                          >
                            {t(`piExtensions.source.${extension.sourceType}`)}
                          </Badge>
                          {extension.packageId && (
                            <span className="truncate text-xs text-muted-foreground">
                              {extension.packageId}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex min-w-0 gap-2 text-xs text-muted-foreground">
                          <span className="truncate">{extension.path}</span>
                          {extension.version && (
                            <span className="shrink-0">
                              v{extension.version}
                            </span>
                          )}
                        </div>
                      </div>
                      {renderStatusBadge(extension.status)}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            {togglePending ? (
                              <Loader2 className="mx-2 h-4 w-4 animate-spin text-muted-foreground" />
                            ) : (
                              <Switch
                                checked={extension.enabled}
                                disabled={
                                  toggleBlocked ||
                                  toggleMutation.isPending ||
                                  !canMutate
                                }
                                onCheckedChange={(enabled) =>
                                  void handleToggle(extension, enabled)
                                }
                                aria-label={t("piExtensions.actions.toggle", {
                                  name: extension.name,
                                })}
                              />
                            )}
                          </span>
                        </TooltipTrigger>
                        {(toggleBlocked || !canMutate) && (
                          <TooltipContent>
                            {adapterManaged
                              ? t("piExtensions.actions.adapterManaged")
                              : toggleBlocked
                                ? t("piExtensions.actions.toggleUnavailable")
                                : mutationUnavailableReason}
                          </TooltipContent>
                        )}
                      </Tooltip>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setDetailTarget({
                            type: "extension",
                            item: extension,
                          })
                        }
                        aria-label={t("piExtensions.actions.details")}
                        title={t("piExtensions.actions.details")}
                      >
                        <Info className="h-4 w-4" />
                      </Button>
                      {extension.origin === "local" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={unregisterMutation.isPending || !canMutate}
                          onClick={() => setUnregisterTarget(extension)}
                          aria-label={t(
                            "piExtensions.actions.unregisterLocal",
                            {
                              name: extension.name,
                            },
                          )}
                          title={t("piExtensions.actions.unregisterLocal", {
                            name: extension.name,
                          })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent
            value="packages"
            className="mt-0 min-h-0 flex-1 overflow-y-auto pb-8"
          >
            {filteredPackages.length === 0 ? (
              <WorkbenchEmptyState
                icon={<Package className="h-5 w-5" />}
                title={t(
                  hasFilters
                    ? "piExtensions.empty.noPackageResults"
                    : "piExtensions.empty.noPackages",
                )}
                actions={
                  !hasFilters ? (
                    <Button size="sm" onClick={() => setInstallOpen(true)}>
                      <Plus className="h-4 w-4" />
                      {t("piExtensions.add")}
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="border-y border-border">
                {filteredPackages.map((packageItem, index) => {
                  const adapterManaged = isPiMcpAdapterSource(
                    packageItem.source,
                  );
                  const removeProtected =
                    adapterManaged || packageItem.status === "missing";
                  return (
                    <div
                      key={packageItem.id}
                      className={cn(
                        "flex min-w-0 items-center gap-3 px-3 py-3 hover:bg-muted/60",
                        index < filteredPackages.length - 1 &&
                          "border-b border-border",
                      )}
                    >
                      <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {packageItem.displayName}
                          </span>
                          {packageItem.version && (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              v{packageItem.version}
                            </span>
                          )}
                          {adapterManaged && (
                            <Badge
                              variant="secondary"
                              className="shrink-0 rounded-md px-1.5 font-normal"
                              title={t(
                                "piExtensions.actions.adapterManagedPackage",
                              )}
                            >
                              {t("piExtensions.adapterBadge")}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {packageItem.source}
                        </div>
                      </div>
                      <div className="hidden shrink-0 items-center gap-2 text-xs text-muted-foreground xl:flex">
                        <span>
                          {t("piExtensions.resources.extensionsShort", {
                            count: packageItem.extensionCount,
                          })}
                        </span>
                        <span>
                          {t("piExtensions.resources.skillsShort", {
                            count: packageItem.skillCount,
                          })}
                        </span>
                        <span>
                          {t("piExtensions.resources.promptsShort", {
                            count: packageItem.promptCount,
                          })}
                        </span>
                        <span>
                          {t("piExtensions.resources.themesShort", {
                            count: packageItem.themeCount,
                          })}
                        </span>
                      </div>
                      {renderStatusBadge(packageItem.status)}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setDetailTarget({
                            type: "package",
                            item: packageItem,
                          })
                        }
                        aria-label={t("piExtensions.actions.details")}
                        title={t("piExtensions.actions.details")}
                      >
                        <Info className="h-4 w-4" />
                      </Button>
                      {!removeProtected && (
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={removeMutation.isPending || !canMutate}
                          onClick={() => setRemoveTarget(packageItem)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={t("piExtensions.actions.remove", {
                            name: packageItem.displayName,
                          })}
                          title={t("piExtensions.actions.removePackage")}
                        >
                          {removeMutation.isPending &&
                          removeMutation.variables === packageItem.source ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent
            value="discover"
            className="mt-0 flex min-h-0 flex-1 flex-col"
          >
            <div className="flex shrink-0 gap-2 pb-3">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={discoverInput}
                  onChange={(event) => setDiscoverInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submitDiscovery();
                  }}
                  className="pl-9"
                  placeholder={t("piExtensions.discover.placeholder")}
                  aria-label={t("piExtensions.discover.placeholder")}
                />
              </div>
              <Button onClick={submitDiscovery}>
                <Search className="h-4 w-4" />
                {t("common.search")}
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-8">
              {!discoverQuery ? (
                <WorkbenchEmptyState
                  icon={<Search className="h-5 w-5" />}
                  title={t("piExtensions.discover.initial")}
                />
              ) : searchQuery.isLoading ? (
                <div className="flex min-h-64 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : searchQuery.isError ? (
                <WorkbenchEmptyState
                  icon={<AlertTriangle className="h-5 w-5" />}
                  title={t("piExtensions.discover.failed")}
                  description={extractErrorMessage(searchQuery.error)}
                  actions={
                    <Button onClick={() => void searchQuery.refetch()}>
                      {t("common.refresh")}
                    </Button>
                  }
                />
              ) : searchQuery.data?.items.length === 0 ? (
                <WorkbenchEmptyState
                  icon={<Box className="h-5 w-5" />}
                  title={t("piExtensions.discover.noResults", {
                    query: discoverQuery,
                  })}
                />
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                    {searchQuery.data?.items.map((packageItem) => {
                      const externalUrl =
                        packageItem.npmUrl ||
                        packageItem.repositoryUrl ||
                        packageItem.homepageUrl;
                      return (
                        <div
                          key={`${packageItem.name}@${packageItem.version}`}
                          className="flex min-h-44 min-w-0 flex-col rounded-md border border-border bg-card/45 p-4"
                        >
                          <div className="flex min-w-0 items-start gap-2">
                            <Package className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            <div className="min-w-0 flex-1">
                              <div className="break-all text-sm font-semibold leading-5">
                                {packageItem.name}
                              </div>
                              <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                                {packageItem.publisher && (
                                  <span>{packageItem.publisher}</span>
                                )}
                                <span>v{packageItem.version}</span>
                                {packageItem.downloads !== undefined && (
                                  <span>
                                    {t("piExtensions.discover.downloads", {
                                      value: compactNumber(
                                        packageItem.downloads,
                                      ),
                                    })}
                                  </span>
                                )}
                              </div>
                            </div>
                            {externalUrl && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                onClick={() =>
                                  void settingsApi.openExternal(externalUrl)
                                }
                                aria-label={t(
                                  "piExtensions.discover.openExternal",
                                )}
                                title={t("piExtensions.discover.openExternal")}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">
                            {packageItem.description ||
                              t("piExtensions.discover.noDescription")}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {packageItem.resourceTypes.map((resourceType) => (
                              <Badge
                                key={resourceType}
                                variant="secondary"
                                className="rounded-md px-1.5 font-normal"
                              >
                                {resourceType}
                              </Badge>
                            ))}
                            {packageItem.manifestStatus !== "available" && (
                              <Badge
                                variant="outline"
                                className="rounded-md border-amber-500/30 bg-amber-500/10 px-1.5 font-normal text-amber-700 dark:text-amber-300"
                              >
                                {t("piExtensions.discover.manifestUnavailable")}
                              </Badge>
                            )}
                          </div>
                          <div className="mt-auto flex justify-end pt-3">
                            <Button
                              size="sm"
                              disabled={
                                packageItem.installed ||
                                installMutation.isPending ||
                                !canMutate
                              }
                              onClick={() => setInstallTarget(packageItem)}
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
                  <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                    <span>
                      {t("piExtensions.discover.resultCount", {
                        total: searchQuery.data?.total ?? 0,
                      })}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        disabled={
                          discoverOffset === 0 || searchQuery.isFetching
                        }
                        onClick={() =>
                          setDiscoverOffset((offset) =>
                            Math.max(0, offset - PAGE_SIZE),
                          )
                        }
                        aria-label={t("piExtensions.discover.previous")}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span>{Math.floor(discoverOffset / PAGE_SIZE) + 1}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        disabled={
                          discoverOffset + PAGE_SIZE >=
                            (searchQuery.data?.total ?? 0) ||
                          searchQuery.isFetching
                        }
                        onClick={() =>
                          setDiscoverOffset((offset) => offset + PAGE_SIZE)
                        }
                        aria-label={t("piExtensions.discover.next")}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <PiPackageInstallDialog
        open={installOpen}
        pending={registerMutation.isPending || installMutation.isPending}
        disabled={!canMutate}
        disabledReason={mutationUnavailableReason}
        onOpenChange={setInstallOpen}
        onRegisterExtension={async (path) => {
          try {
            await handleRegister(path);
          } catch (error) {
            reportError("piExtensions.messages.registerFailed", error);
          }
        }}
        onInstallPackage={async (source) => {
          try {
            await handleInstall(source);
          } catch (error) {
            reportError("piExtensions.messages.installFailed", error);
          }
        }}
      />

      <PiDetailsDialog
        target={detailTarget}
        onOpenChange={(open) => {
          if (!open) setDetailTarget(null);
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
    </TooltipProvider>
  );
}

function PiDetailsDialog({
  target,
  onOpenChange,
}: {
  target: DetailTarget;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const rows =
    target?.type === "extension"
      ? [
          ["name", target.item.name],
          ["source", target.item.packageSource || target.item.sourceType],
          ["path", target.item.path],
          ["version", target.item.version],
          ["status", t(`piExtensions.status.${target.item.status}`)],
          ["error", target.item.error],
        ]
      : target?.type === "package"
        ? [
            ["name", target.item.displayName],
            ["source", target.item.source],
            ["path", target.item.installedPath],
            ["version", target.item.version],
            ["status", t(`piExtensions.status.${target.item.status}`)],
            [
              "resources",
              t("piExtensions.details.resourceCounts", {
                extensions: target.item.extensionCount,
                skills: target.item.skillCount,
                prompts: target.item.promptCount,
                themes: target.item.themeCount,
              }),
            ],
            ["error", target.item.error],
          ]
        : [];

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("piExtensions.details.title")}</DialogTitle>
          <DialogDescription>
            {target?.type === "extension"
              ? t("piExtensions.details.extension")
              : t("piExtensions.details.package")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 overflow-y-auto px-6 py-5">
          {rows.map(([key, value]) =>
            value ? (
              <div
                key={key}
                className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm"
              >
                <span className="text-muted-foreground">
                  {t(`piExtensions.details.fields.${key}`)}
                </span>
                <span className="break-all">{value}</span>
              </div>
            ) : null,
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
