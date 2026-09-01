import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { X } from "lucide-react";
import { useRequestDetail } from "@/features/usage";
import {
  getFreshInputTokens,
  getDiagnosticOrigin,
  isUnpricedUsage,
  type RequestLog,
  type RouteAttempt,
} from "@/shared/contracts/usage";
import { formatTiming } from "./timing";

interface RequestDetailPanelProps {
  requestId: string;
  fallbackRequest?: RequestLog;
  onClose: () => void;
}

function formatThinkingEffort(
  effort: string,
  t: ReturnType<typeof useTranslation>["t"],
) {
  if (effort.startsWith("budget:")) {
    const budget = Number(effort.slice("budget:".length));
    return Number.isFinite(budget)
      ? t("usage.thinkingEffortBudget", {
          count: budget,
        })
      : effort;
  }
  return t(`usage.thinkingEfforts.${effort}`, { defaultValue: effort });
}

export function RequestDetailPanel({
  requestId,
  fallbackRequest,
  onClose,
}: RequestDetailPanelProps) {
  const { t, i18n } = useTranslation();
  const { data: liveRequest, isLoading } = useRequestDetail(requestId);
  const request = liveRequest ?? fallbackRequest;
  const dateLocale =
    i18n.language === "zh"
      ? "zh-CN"
      : i18n.language === "zh-TW"
        ? "zh-TW"
        : i18n.language === "ja"
          ? "ja-JP"
          : "en-US";

  const dialog = (content: ReactNode, className = "max-w-2xl") => (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className={className}>
        <DialogHeader className="relative pr-14">
          <DialogTitle>{t("usage.requestDetail", "请求详情")}</DialogTitle>
          <DialogClose
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
            aria-label={t("common.close", "关闭")}
          >
            <X className="h-4 w-4" />
          </DialogClose>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );

  if (isLoading && !fallbackRequest) {
    return dialog(<div className="h-[400px] animate-pulse rounded bg-muted" />);
  }

  if (!request) {
    return dialog(
      <div className="p-6 text-center text-muted-foreground">
        {t("usage.requestNotFound", "请求未找到")}
      </div>,
    );
  }

  const freshInput = getFreshInputTokens(request);
  const isCacheInclusive = request.inputTokens !== freshInput;
  const unpriced = isUnpricedUsage(request);
  const routeAttempts = parseRouteTrace(request.routeTrace);
  const diagnosticOrigin = getDiagnosticOrigin(
    request.failureKind,
    request.statusCode,
  );

  return dialog(
    <div className="space-y-4 overflow-y-auto p-6">
      {(request.failureKind || request.statusCode >= 400) && (
        <div className="rounded-md border border-border bg-muted/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs text-muted-foreground">
                {t("usage.diagnosticOrigin", "诊断归属")}
              </div>
              <div className="font-medium">
                {t(
                  `usage.diagnosticOrigins.${diagnosticOrigin}`,
                  diagnosticOrigin,
                )}
              </div>
            </div>
            {request.failureKind && (
              <div className="font-mono text-xs">
                {t(`usage.failureKinds.${request.failureKind}`, {
                  defaultValue: request.failureKind,
                })}
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t(
              "usage.diagnosticOriginHint",
              "根据状态码、代理错误分类和路由轨迹判断；请结合上游响应与应用日志确认。",
            )}
          </p>
        </div>
      )}

      {/* 基本信息 */}
      <div className="rounded-lg border p-4">
        <h3 className="mb-3 font-semibold">
          {t("usage.basicInfo", "基本信息")}
        </h3>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">
              {t("usage.requestId", "请求ID")}
            </dt>
            <dd className="font-mono">{request.requestId}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("usage.time", "时间")}</dt>
            <dd>
              {new Date(request.createdAt * 1000).toLocaleString(dateLocale)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {t("usage.provider", "供应商")}
            </dt>
            <dd className="text-sm">
              <span className="font-medium">
                {request.providerName || t("usage.unknownProvider", "未知")}
              </span>
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                {request.providerId}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {t("usage.appType", "应用类型")}
            </dt>
            <dd>{request.appType}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {t("usage.apiType", "API 协议")}
            </dt>
            <dd className="font-mono text-xs">{request.apiType}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {t("usage.model", "模型")}
            </dt>
            <dd className="font-mono">{request.model}</dd>
            {request.requestModel && request.requestModel !== request.model && (
              <>
                <dt className="mt-1 text-muted-foreground">
                  {t("usage.requestModel", "请求模型")}
                </dt>
                <dd className="font-mono text-xs">{request.requestModel}</dd>
              </>
            )}
            {request.pricingModel && request.pricingModel !== request.model && (
              <>
                <dt className="mt-1 text-muted-foreground">
                  {t("usage.pricingModel", "计价模型")}
                </dt>
                <dd className="font-mono text-xs">{request.pricingModel}</dd>
              </>
            )}
          </div>
          {request.thinkingEffort && (
            <div>
              <dt className="text-muted-foreground">
                {t("usage.thinkingEffort", "思考强度")}
              </dt>
              <dd>
                <div className="font-medium">
                  {formatThinkingEffort(request.thinkingEffort, t)}
                </div>
                {request.thinkingEffortSource && (
                  <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
                    {request.thinkingEffortSource}
                  </div>
                )}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-muted-foreground">
              {t("usage.status", "状态")}
            </dt>
            <dd>
              <span
                className={`inline-flex rounded-full px-2 py-1 text-xs ${
                  request.statusCode >= 200 && request.statusCode < 300
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {request.statusCode}
              </span>
            </dd>
          </div>
          {request.upstreamResponseId && (
            <div>
              <dt className="text-muted-foreground">
                {t("usage.upstreamResponseId", "上游响应 ID")}
              </dt>
              <dd className="break-all font-mono text-xs">
                {request.upstreamResponseId}
              </dd>
            </div>
          )}
          {request.stopReason && (
            <div>
              <dt className="text-muted-foreground">
                {t("usage.stopReason", "停止原因")}
              </dt>
              <dd className="font-mono text-xs">{request.stopReason}</dd>
            </div>
          )}
        </dl>
      </div>

      {routeAttempts.length > 0 && (
        <div className="rounded-lg border p-4">
          <h3 className="mb-3 font-semibold">
            {t("usage.routeTrace", "路由诊断")}
          </h3>
          <div className="space-y-2">
            {routeAttempts.map((attempt) => (
              <div
                key={`${attempt.attempt}-${attempt.providerId}`}
                className="grid gap-2 rounded-md border px-3 py-2 text-sm sm:grid-cols-[48px_minmax(0,1fr)_90px_80px]"
              >
                <span className="font-mono text-muted-foreground">
                  #{attempt.attempt}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {attempt.providerName}
                  </div>
                  <div className="truncate font-mono text-xs text-muted-foreground">
                    {(attempt.failureKind &&
                      t(`usage.failureKinds.${attempt.failureKind}`, {
                        defaultValue: attempt.failureKind,
                      })) ||
                      (attempt.outcome === "response_received"
                        ? t("usage.responseReceived", "已收到上游响应")
                        : t("usage.requestFailed", "请求失败"))}
                  </div>
                  {attempt.message && (
                    <div className="mt-1 break-words text-xs text-muted-foreground">
                      {attempt.message}
                    </div>
                  )}
                </div>
                <span className="font-mono text-xs">
                  +{(attempt.startedMs / 1000).toFixed(1)}s
                </span>
                <span className="font-mono text-xs">
                  {(attempt.durationMs / 1000).toFixed(1)}s
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Token 使用量 */}
      <div className="rounded-lg border p-4">
        <h3 className="mb-3 font-semibold">
          {t("usage.tokenUsage", "Token 使用量")}
        </h3>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">
              {t("usage.inputTokens", "输入 Tokens")}
            </dt>
            <dd className="font-mono">
              {freshInput.toLocaleString()}
              {isCacheInclusive && (
                <span className="ml-2 text-xs text-muted-foreground/70 font-normal">
                  ({t("usage.rawInputLabel", "原始")}:{" "}
                  {request.inputTokens.toLocaleString()})
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {t("usage.outputTokens", "输出 Tokens")}
            </dt>
            <dd className="font-mono">
              {request.outputTokens.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {t("usage.cacheReadTokens", "缓存读取")}
            </dt>
            <dd className="font-mono">
              {request.cacheReadTokens.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {t("usage.cacheCreationTokens", "缓存写入")}
            </dt>
            <dd className="font-mono">
              {request.cacheCreationTokens.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {t("usage.reasoningTokens", "推理 Tokens")}
            </dt>
            <dd className="font-mono">
              {request.reasoningTokens.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {t("usage.cacheCreation1hTokens", "1 小时缓存写入")}
            </dt>
            <dd className="font-mono">
              {request.cacheCreation1hTokens.toLocaleString()}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-muted-foreground">
              {t("usage.totalTokens", "总计")}
            </dt>
            <dd className="text-lg font-semibold">
              {(freshInput + request.outputTokens).toLocaleString()}
            </dd>
          </div>
          {request.failureKind && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">
                {t("usage.failureKind", "失败类型")}
              </dt>
              <dd className="font-mono text-xs">{request.failureKind}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* 成本明细 */}
      <div className="rounded-lg border p-4">
        <h3 className="mb-3 font-semibold">
          {t("usage.costBreakdown", "成本明细")}
        </h3>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">
              {t("usage.inputCost", "输入成本")}
              <span className="ml-1 text-xs">
                ({t("usage.baseCost", "基础")})
              </span>
            </dt>
            <dd className="font-mono">
              ${parseFloat(request.inputCostUsd).toFixed(6)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {t("usage.outputCost", "输出成本")}
              <span className="ml-1 text-xs">
                ({t("usage.baseCost", "基础")})
              </span>
            </dt>
            <dd className="font-mono">
              ${parseFloat(request.outputCostUsd).toFixed(6)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {t("usage.cacheReadCost", "缓存读取成本")}
              <span className="ml-1 text-xs">
                ({t("usage.baseCost", "基础")})
              </span>
            </dt>
            <dd className="font-mono">
              ${parseFloat(request.cacheReadCostUsd).toFixed(6)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {t("usage.cacheCreationCost", "缓存写入成本")}
              <span className="ml-1 text-xs">
                ({t("usage.baseCost", "基础")})
              </span>
            </dt>
            <dd className="font-mono">
              ${parseFloat(request.cacheCreationCostUsd).toFixed(6)}
            </dd>
          </div>
          {/* 显示成本倍率（如果不等于1） */}
          {request.costMultiplier &&
            parseFloat(request.costMultiplier) !== 1 && (
              <div className="col-span-2 border-t pt-3">
                <dt className="text-muted-foreground">
                  {t("usage.costMultiplier", "成本倍率")}
                </dt>
                <dd className="font-mono">×{request.costMultiplier}</dd>
              </div>
            )}
          <div
            className={`col-span-2 ${request.costMultiplier && parseFloat(request.costMultiplier) !== 1 ? "" : "border-t"} pt-3`}
          >
            <dt className="text-muted-foreground">
              {t("usage.totalCost", "总成本")}
              {request.costMultiplier &&
                parseFloat(request.costMultiplier) !== 1 && (
                  <span className="ml-1 text-xs">
                    ({t("usage.withMultiplier", "含倍率")})
                  </span>
                )}
            </dt>
            <dd
              className={`text-lg font-semibold ${
                unpriced ? "text-muted-foreground" : "text-primary"
              }`}
            >
              {unpriced
                ? t("usage.unpriced", "未定价")
                : `$${parseFloat(request.totalCostUsd).toFixed(6)}`}
            </dd>
          </div>
        </dl>
      </div>

      {/* 性能信息 */}
      <div className="rounded-lg border p-4">
        <h3 className="mb-3 font-semibold">
          {t("usage.performance", "性能信息")}
        </h3>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">
              {t("usage.latency", "延迟")}
            </dt>
            <dd className="font-mono">{formatTiming(request.latencyMs)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {t("usage.firstToken", "首个有效输出")}
            </dt>
            <dd className="font-mono">{formatTiming(request.firstTokenMs)}</dd>
          </div>
        </dl>
      </div>

      {/* 错误信息 */}
      {request.errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h3 className="mb-2 font-semibold text-red-800">
            {t("usage.errorMessage", "错误信息")}
          </h3>
          <p className="text-sm text-red-700">{request.errorMessage}</p>
        </div>
      )}
    </div>,
    "max-w-2xl max-h-[80vh]",
  );
}

function parseRouteTrace(value?: string): RouteAttempt[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as RouteAttempt[]) : [];
  } catch {
    return [];
  }
}
