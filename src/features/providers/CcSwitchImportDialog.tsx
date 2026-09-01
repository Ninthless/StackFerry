import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  KeyRound,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { AppId } from "@/platform/tauri/api";
import {
  providersApi,
  type CcSwitchApplyResult,
  type CcSwitchImportAction,
  type CcSwitchImportPreview,
  type CcSwitchPreviewItem,
} from "@/platform/tauri/api/providers";
import { APP_ICON_MAP } from "@/shared/platform/appRegistry";
import { extractErrorMessage } from "@/shared/lib/errorUtils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";

const CC_SWITCH_APPS: AppId[] = [
  "claude",
  "claude-desktop",
  "codex",
  "gemini",
  "grokbuild",
  "opencode",
  "openclaw",
  "hermes",
];

interface CcSwitchImportDialogProps {
  open: boolean;
  appId: AppId;
  onOpenChange: (open: boolean) => void;
}

type Scope = "current" | "all";

const actionTone: Record<CcSwitchImportAction, string> = {
  add: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  update: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  preserveLocal:
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  attach:
    "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  invalid: "border-destructive/30 bg-destructive/10 text-destructive",
};

function isCcSwitchApp(appId: AppId): boolean {
  return CC_SWITCH_APPS.includes(appId);
}

export function CcSwitchImportDialog({
  open,
  appId,
  onOpenChange,
}: CcSwitchImportDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const requestId = useRef(0);
  const [scope, setScope] = useState<Scope>("current");
  const [preview, setPreview] = useState<CcSwitchImportPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CcSwitchApplyResult | null>(null);

  const scan = async () => {
    const currentRequest = ++requestId.current;
    setIsScanning(true);
    setError(null);
    setResult(null);
    try {
      const nextPreview = await providersApi.previewCcSwitchProviderImport();
      if (currentRequest !== requestId.current) return;
      setPreview(nextPreview);
      setSelected(
        new Set(
          nextPreview.items
            .filter((item) => item.selectable)
            .filter(
              (item) =>
                scope === "all" ||
                (isCcSwitchApp(appId) && item.appType === appId),
            )
            .map((item) => item.key),
        ),
      );
    } catch (scanError) {
      if (currentRequest !== requestId.current) return;
      setPreview(null);
      setSelected(new Set());
      setError(extractErrorMessage(scanError));
    } finally {
      if (currentRequest === requestId.current) {
        setIsScanning(false);
      }
    }
  };

  useEffect(() => {
    if (!open) {
      requestId.current += 1;
      return;
    }
    setScope(isCcSwitchApp(appId) ? "current" : "all");
    void scan();
  }, [open, appId]);

  const visibleItems = useMemo(() => {
    if (!preview) return [];
    if (scope === "all" || !isCcSwitchApp(appId)) return preview.items;
    return preview.items.filter((item) => item.appType === appId);
  }, [appId, preview, scope]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, CcSwitchPreviewItem[]>();
    for (const item of visibleItems) {
      const items = groups.get(item.appType) ?? [];
      items.push(item);
      groups.set(item.appType, items);
    }
    return Array.from(groups.entries());
  }, [visibleItems]);

  useEffect(() => {
    if (!preview) return;
    const visibleKeys = new Set(
      visibleItems.filter((item) => item.selectable).map((item) => item.key),
    );
    setSelected(visibleKeys);
  }, [scope]);

  const selectedItems = visibleItems.filter((item) => selected.has(item.key));
  const selectedSummary = {
    add: selectedItems.filter((item) => item.action === "add").length,
    update: selectedItems.filter((item) => item.action === "update").length,
    attach: selectedItems.filter((item) => item.action === "attach").length,
  };

  const toggleItem = (key: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const toggleGroup = (items: CcSwitchPreviewItem[], checked: boolean) => {
    const selectableKeys = items
      .filter((item) => item.selectable)
      .map((item) => item.key);
    setSelected((current) => {
      const next = new Set(current);
      for (const key of selectableKeys) {
        if (checked) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  };

  const apply = async () => {
    if (!preview || selected.size === 0 || isApplying) return;
    setIsApplying(true);
    setError(null);
    try {
      const nextResult = await providersApi.applyCcSwitchProviderImport({
        token: preview.token,
        keys: Array.from(selected),
      });
      setResult(nextResult);
      await Promise.all(
        nextResult.affectedApps.map((affectedApp) =>
          queryClient.invalidateQueries({
            queryKey: ["providers", affectedApp],
          }),
        ),
      );
      toast.success(t("provider.ccSwitchImport.successTitle"), {
        description: t("provider.ccSwitchImport.resultSummary", {
          imported: nextResult.imported,
          skipped: nextResult.skipped,
        }),
      });
    } catch (applyError) {
      setError(extractErrorMessage(applyError));
    } finally {
      setIsApplying(false);
    }
  };

  const close = () => {
    if (isApplying) return;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent
        className="ccswitch-import-dialog h-[min(760px,88vh)] max-w-[min(920px,calc(100vw-32px))] p-0"
        zIndex="top"
      >
        <DialogHeader className="text-left">
          <DialogTitle>{t("provider.ccSwitchImport.title")}</DialogTitle>
          <DialogDescription>
            {t("provider.ccSwitchImport.description")}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold">
                {t("provider.ccSwitchImport.successTitle")}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("provider.ccSwitchImport.resultDetail", {
                  added: result.added,
                  updated: result.updated,
                  attached: result.attached,
                  skipped: result.skipped,
                })}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="ccswitch-import-controls flex shrink-0 items-center justify-between gap-3 border-b border-border px-6 py-3">
              <Tabs
                value={scope}
                onValueChange={(value) => setScope(value as Scope)}
              >
                <TabsList
                  layout="compact"
                  className="rounded-md border border-border bg-muted/40 p-0.5"
                >
                  <TabsTrigger
                    value="current"
                    disabled={!isCcSwitchApp(appId)}
                    className="h-7 min-w-28 px-2 py-1 text-xs"
                  >
                    {t("provider.ccSwitchImport.currentAgent")}
                  </TabsTrigger>
                  <TabsTrigger
                    value="all"
                    className="h-7 min-w-28 px-2 py-1 text-xs"
                  >
                    {t("provider.ccSwitchImport.allAgents")}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void scan()}
                disabled={isScanning}
              >
                {isScanning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {t("provider.ccSwitchImport.rescan")}
              </Button>
            </div>

            <div className="min-h-0 flex-1">
              {isScanning && !preview ? (
                <div
                  className="grid h-full place-items-center text-sm text-muted-foreground"
                  role="status"
                >
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    {t("provider.ccSwitchImport.scanning")}
                  </div>
                </div>
              ) : error && !preview ? (
                <div className="grid h-full place-items-center px-6 text-center">
                  <div className="max-w-md">
                    <AlertTriangle className="mx-auto h-7 w-7 text-amber-500" />
                    <h3 className="mt-3 text-sm font-semibold">
                      {t("provider.ccSwitchImport.scanFailed")}
                    </h3>
                    <p className="mt-1 break-words text-sm text-muted-foreground">
                      {error}
                    </p>
                  </div>
                </div>
              ) : (
                <ScrollArea className="h-full">
                  <div className="ccswitch-import-body space-y-4 px-6 py-4">
                    {preview && (
                      <div className="ccswitch-source-row flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                        <Database className="h-4 w-4 shrink-0" />
                        <span className="shrink-0">
                          {t("provider.ccSwitchImport.source")}
                        </span>
                        <span
                          className="min-w-0 truncate"
                          title={preview.sourcePath}
                        >
                          {preview.sourcePath}
                        </span>
                        <Badge variant="outline" className="shrink-0 rounded">
                          v{preview.sourceVersion}
                        </Badge>
                      </div>
                    )}

                    {groupedItems.length === 0 ? (
                      <div className="py-16 text-center text-sm text-muted-foreground">
                        {t("provider.ccSwitchImport.empty")}
                      </div>
                    ) : (
                      groupedItems.map(([groupApp, items]) => {
                        const appConfig =
                          APP_ICON_MAP[groupApp as AppId] ?? APP_ICON_MAP.codex;
                        const selectable = items.filter(
                          (item) => item.selectable,
                        );
                        const selectedCount = selectable.filter((item) =>
                          selected.has(item.key),
                        ).length;
                        const groupChecked =
                          selectedCount === 0
                            ? false
                            : selectedCount === selectable.length
                              ? true
                              : "indeterminate";
                        return (
                          <section
                            key={groupApp}
                            className="ccswitch-agent-group overflow-hidden rounded-md border border-border"
                          >
                            <div className="flex min-w-0 items-center gap-2 border-b border-border bg-muted/35 px-3 py-2">
                              <Checkbox
                                checked={groupChecked}
                                disabled={selectable.length === 0}
                                onCheckedChange={(checked) =>
                                  toggleGroup(items, checked === true)
                                }
                                aria-label={t(
                                  "provider.ccSwitchImport.selectAgent",
                                  { agent: appConfig.label },
                                )}
                              />
                              {appConfig.icon}
                              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                                {appConfig.label}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {selectedCount}/{selectable.length}
                              </span>
                            </div>
                            <div className="divide-y divide-border/70">
                              {items.map((item) => (
                                <div
                                  key={item.key}
                                  className="ccswitch-provider-row grid min-w-0 items-center gap-3 px-3 py-2.5"
                                >
                                  <Checkbox
                                    checked={selected.has(item.key)}
                                    disabled={!item.selectable}
                                    onCheckedChange={(checked) =>
                                      toggleItem(item.key, checked === true)
                                    }
                                    aria-label={t(
                                      "provider.ccSwitchImport.selectProvider",
                                      { name: item.name },
                                    )}
                                  />
                                  <div className="min-w-0">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <span className="truncate text-sm font-medium">
                                        {item.name}
                                      </span>
                                      <Badge
                                        variant="outline"
                                        className={`shrink-0 rounded ${actionTone[item.action]}`}
                                      >
                                        {t(
                                          `provider.ccSwitchImport.actions.${item.action}`,
                                        )}
                                      </Badge>
                                    </div>
                                    <div className="mt-1 flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
                                      <span
                                        className="min-w-0 truncate"
                                        title={item.endpoint ?? undefined}
                                      >
                                        {item.endpoint ??
                                          t(
                                            "provider.ccSwitchImport.endpointUnavailable",
                                          )}
                                      </span>
                                      {item.modelCount > 0 && (
                                        <span className="shrink-0">
                                          {t(
                                            "provider.ccSwitchImport.modelCount",
                                            { count: item.modelCount },
                                          )}
                                        </span>
                                      )}
                                    </div>
                                    {item.reason && (
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        {item.reason}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                                    <KeyRound className="h-3.5 w-3.5" />
                                    {t(
                                      `provider.ccSwitchImport.credentials.${item.credentialState}`,
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </section>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              )}
            </div>
          </>
        )}

        <DialogFooter className="ccswitch-import-footer">
          {result ? (
            <Button type="button" onClick={close}>
              {t("common.close")}
            </Button>
          ) : (
            <>
              <div className="mr-auto min-w-0 text-xs text-muted-foreground">
                {error && preview ? (
                  <span className="text-destructive" role="alert">
                    {error}
                  </span>
                ) : (
                  t("provider.ccSwitchImport.selectionSummary", {
                    selected: selected.size,
                    added: selectedSummary.add,
                    updated: selectedSummary.update,
                    attached: selectedSummary.attach,
                  })
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={close}
                disabled={isApplying}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                onClick={() => void apply()}
                disabled={!preview || selected.size === 0 || isApplying}
              >
                {isApplying && <Loader2 className="h-4 w-4 animate-spin" />}
                {isApplying
                  ? t("provider.ccSwitchImport.applying")
                  : t("provider.ccSwitchImport.apply")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
