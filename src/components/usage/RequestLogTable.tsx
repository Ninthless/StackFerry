import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRequestLogFacets, useRequestLogs } from "@/lib/query/usage";
import { usageApi } from "@/lib/api/usage";
import {
  getFreshInputTokens,
  isUnpricedUsage,
  type LogFilters,
  type UsageRangeSelection,
} from "@/types/usage";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { resolveUsageRange } from "@/lib/usageRange";
import { UsageDateRangePicker } from "./UsageDateRangePicker";
import { RequestDetailPanel } from "./RequestDetailPanel";
import {
  fmtInt,
  fmtUsd,
  getLocaleFromLanguage,
  parseFiniteNumber,
} from "./format";

interface RequestLogTableProps {
  range: UsageRangeSelection;
  rangeLabel: string;
  appType?: string;
  providerName?: string;
  model?: string;
  refreshIntervalMs: number;
  onRangeChange?: (range: UsageRangeSelection) => void;
}

export function RequestLogTable({
  range,
  rangeLabel,
  appType: dashboardAppType,
  providerName,
  model,
  refreshIntervalMs,
  onRangeChange,
}: RequestLogTableProps) {
  const { t, i18n } = useTranslation();

  // 应用/Provider/模型筛选已上移到 Dashboard 顶栏（全局生效）；
  // 这里只保留日志特有的状态码筛选。
  const [statusCode, setStatusCode] = useState<number | undefined>(undefined);
  const [failureKind, setFailureKind] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(0);
  const [pageInput, setPageInput] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null,
  );
  const [isExporting, setIsExporting] = useState(false);
  const pageSize = 20;

  const effectiveFilters: LogFilters = {
    appType:
      dashboardAppType && dashboardAppType !== "all"
        ? dashboardAppType
        : undefined,
    providerName,
    model,
    statusCode,
    failureKind,
  };

  const facetFilters = {
    appType: effectiveFilters.appType,
    providerName,
    model,
  };
  const { data: facets } = useRequestLogFacets(range, facetFilters, {
    refetchInterval: refreshIntervalMs > 0 ? refreshIntervalMs : false,
  });

  const { data: result, isLoading } = useRequestLogs({
    filters: effectiveFilters,
    range,
    page,
    pageSize,
    options: {
      refetchInterval: refreshIntervalMs > 0 ? refreshIntervalMs : false,
    },
  });

  const logs = result?.data ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  useEffect(() => {
    setPage(0);
  }, [
    dashboardAppType,
    providerName,
    model,
    range.customEndDate,
    range.customStartDate,
    range.preset,
  ]);

  const handleGoToPage = () => {
    const trimmed = pageInput.trim();
    if (!/^\d+$/.test(trimmed)) return;
    const parsed = Number(trimmed);
    if (parsed < 1 || parsed > totalPages) return;
    setPage(parsed - 1);
    setPageInput("");
  };

  const language = i18n.resolvedLanguage || i18n.language || "en";
  const locale = getLocaleFromLanguage(language);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const resolvedRange = resolveUsageRange(range);
      const path = await usageApi.exportRequestLogs({
        ...effectiveFilters,
        startDate: resolvedRange.startDate,
        endDate: resolvedRange.endDate,
      });
      if (path) {
        toast.success(t("usage.exportLogsSuccess", { path }));
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-card p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Status code */}
          <Select
            value={statusCode?.toString() || "all"}
            onValueChange={(v) => {
              const parsed = Number.parseInt(v, 10);
              setStatusCode(
                v === "all" || !Number.isFinite(parsed) ? undefined : parsed,
              );
              setPage(0);
            }}
          >
            <SelectTrigger className="h-8 w-[100px] bg-background text-xs">
              <SelectValue placeholder={t("usage.statusCode")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {(facets?.statusCodes ?? []).map((facet) => (
                <SelectItem key={facet.value} value={facet.value}>
                  {facet.value}
                  {facet.value === "200" ? " OK" : ""} ({facet.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={failureKind || "all"}
            onValueChange={(value) => {
              setFailureKind(value === "all" ? undefined : value);
              setPage(0);
            }}
          >
            <SelectTrigger className="h-8 w-[190px] bg-background text-xs">
              <SelectValue placeholder={t("usage.failureKind")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("usage.allFailureKinds")}</SelectItem>
              {(facets?.failureKinds ?? []).map((facet) => (
                <SelectItem key={facet.value} value={facet.value}>
                  {t(`usage.failureKinds.${facet.value}`, {
                    defaultValue: facet.value,
                  })}{" "}
                  ({facet.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {onRangeChange && (
            <UsageDateRangePicker
              selection={range}
              triggerLabel={rangeLabel}
              onApply={onRangeChange}
            />
          )}
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-8"
            onClick={() => void handleExport()}
            disabled={isExporting || total === 0}
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {t("usage.exportLogs")}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-[400px] animate-pulse rounded bg-muted" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center whitespace-nowrap">
                    {t("usage.time")}
                  </TableHead>
                  <TableHead className="text-center whitespace-nowrap">
                    {t("usage.provider")}
                  </TableHead>
                  <TableHead className="text-center whitespace-nowrap">
                    {t("usage.billingModel")}
                  </TableHead>
                  <TableHead className="text-center whitespace-nowrap">
                    {t("usage.inputTokens")}
                  </TableHead>
                  <TableHead className="text-center whitespace-nowrap">
                    {t("usage.outputTokens")}
                  </TableHead>
                  <TableHead className="text-center whitespace-nowrap">
                    {t("usage.totalCost")}
                  </TableHead>
                  <TableHead className="text-center whitespace-nowrap">
                    {t("usage.timingInfo")}
                  </TableHead>
                  <TableHead className="text-center whitespace-nowrap">
                    {t("usage.status")}
                  </TableHead>
                  <TableHead className="text-center whitespace-nowrap">
                    {t("usage.source", { defaultValue: "Source" })}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center text-muted-foreground"
                    >
                      {t("usage.noData")}
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => {
                    const unpriced = isUnpricedUsage(log);
                    return (
                      <TableRow
                        key={log.requestId}
                        className="cursor-pointer"
                        onClick={() => setSelectedRequestId(log.requestId)}
                      >
                        <TableCell className="text-center whitespace-nowrap text-xs px-1.5">
                          {new Date(log.createdAt * 1000).toLocaleString(
                            locale,
                            {
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {log.providerName || t("usage.unknownProvider")}
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs max-w-[200px]">
                          <div
                            className="truncate"
                            title={
                              log.requestModel && log.requestModel !== log.model
                                ? `${log.requestModel} → ${log.model}`
                                : log.model
                            }
                          >
                            {log.requestModel &&
                            log.requestModel !== log.model ? (
                              <span>
                                {log.requestModel}
                                <span className="text-muted-foreground">
                                  {" → "}
                                  {log.model}
                                </span>
                              </span>
                            ) : (
                              log.model
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center px-1.5">
                          {(() => {
                            const freshInput = getFreshInputTokens(log);
                            const isCacheInclusive =
                              log.inputTokens !== freshInput;
                            return (
                              <div
                                className="tabular-nums"
                                title={
                                  isCacheInclusive
                                    ? `Raw: ${log.inputTokens.toLocaleString()}`
                                    : undefined
                                }
                              >
                                {fmtInt(freshInput, locale)}
                              </div>
                            );
                          })()}
                          {(log.cacheReadTokens > 0 ||
                            log.cacheCreationTokens > 0) && (
                            <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                              {[
                                log.cacheReadTokens > 0 &&
                                  `R${fmtInt(log.cacheReadTokens, locale)}`,
                                log.cacheCreationTokens > 0 &&
                                  `W${fmtInt(log.cacheCreationTokens, locale)}`,
                              ]
                                .filter(Boolean)
                                .join("·")}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {fmtInt(log.outputTokens, locale)}
                        </TableCell>
                        <TableCell className="text-center px-1.5">
                          <div
                            className={`font-medium tabular-nums ${
                              unpriced ? "text-muted-foreground" : ""
                            }`}
                          >
                            {unpriced
                              ? t("usage.unpriced", "未定价")
                              : fmtUsd(log.totalCostUsd, 4)}
                          </div>
                          {parseFiniteNumber(log.costMultiplier) != null &&
                            parseFiniteNumber(log.costMultiplier) !== 1 && (
                              <div className="text-[11px] text-muted-foreground">
                                ×
                                {parseFiniteNumber(log.costMultiplier)?.toFixed(
                                  2,
                                )}
                              </div>
                            )}
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap text-xs tabular-nums">
                          {(log.latencyMs / 1000).toFixed(1)}s
                          {log.firstTokenMs != null && (
                            <span className="text-muted-foreground">
                              /{(log.firstTokenMs / 1000).toFixed(1)}s
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={
                              log.statusCode >= 200 && log.statusCode < 300
                                ? "text-green-600"
                                : "text-red-600"
                            }
                          >
                            {log.statusCode}
                          </span>
                          {log.failureKind && (
                            <div
                              className="mt-0.5 max-w-[150px] truncate font-mono text-[10px] text-muted-foreground"
                              title={log.failureKind}
                            >
                              {t(`usage.failureKinds.${log.failureKind}`, {
                                defaultValue: log.failureKind,
                              })}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">
                          {log.dataSource || "proxy"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{t("usage.totalRecords", { total })}</span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {(() => {
                const pages: (number | string)[] = [];
                if (totalPages <= 9) {
                  for (let i = 0; i < totalPages; i++) pages.push(i);
                } else {
                  const pageSet = new Set<number>();
                  for (let i = 0; i < 3; i++) pageSet.add(i);
                  for (let i = totalPages - 3; i < totalPages; i++)
                    pageSet.add(i);
                  for (
                    let i = Math.max(0, page - 1);
                    i <= Math.min(totalPages - 1, page + 1);
                    i++
                  )
                    pageSet.add(i);
                  const sorted = Array.from(pageSet).sort((a, b) => a - b);
                  for (let i = 0; i < sorted.length; i++) {
                    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
                      pages.push(`ellipsis-${i}`);
                    }
                    pages.push(sorted[i]);
                  }
                }
                return pages.map((p) =>
                  typeof p === "string" ? (
                    <span key={p} className="px-2 text-muted-foreground">
                      ...
                    </span>
                  ) : (
                    <Button
                      key={p}
                      variant={p === page ? "default" : "outline"}
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setPage(p)}
                    >
                      {p + 1}
                    </Button>
                  ),
                );
              })()}
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-1 ml-2">
                <Input
                  type="text"
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleGoToPage();
                  }}
                  placeholder={t("usage.pageInputPlaceholder")}
                  className="h-8 w-16 text-center text-xs"
                />
                <Button variant="outline" size="sm" onClick={handleGoToPage}>
                  {t("usage.goToPage")}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
      {selectedRequestId && (
        <RequestDetailPanel
          requestId={selectedRequestId}
          onClose={() => setSelectedRequestId(null)}
        />
      )}
    </div>
  );
}
