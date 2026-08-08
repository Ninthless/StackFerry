import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { RequestDetailPanel } from "@/components/usage/RequestDetailPanel";

const requestDetailMock = vi.hoisted((): { data: any } => ({
  data: {
    requestId: "pi-request",
    providerId: "provider-1",
    providerName: "Pi Provider",
    appType: "pi",
    apiType: "pi-messages",
    model: "pi-model",
    requestModel: "pi-model",
    pricingModel: "pi-model",
    costMultiplier: "1",
    inputTokens: 100,
    outputTokens: 20,
    cacheReadTokens: 30,
    cacheCreationTokens: 10,
    reasoningTokens: 7,
    cacheCreation1hTokens: 11,
    inputTokenSemantics: 2,
    inputCostUsd: "0.0001",
    outputCostUsd: "0.0002",
    cacheReadCostUsd: "0.00003",
    cacheCreationCostUsd: "0.00004",
    totalCostUsd: "0.00037",
    isStreaming: true,
    latencyMs: 123,
    firstTokenMs: 87,
    statusCode: 200,
    failureKind: "upstream_capacity",
    routeTrace: JSON.stringify([
      {
        providerId: "provider-0",
        providerName: "Slow Provider",
        attempt: 1,
        startedMs: 0,
        durationMs: 60_000,
        outcome: "failed",
        statusCode: 503,
        failureKind: "upstream_capacity",
        message: "Upstream capacity unavailable",
      },
      {
        providerId: "provider-1",
        providerName: "Pi Provider",
        attempt: 2,
        startedMs: 60_001,
        durationMs: 123,
        outcome: "response_received",
        statusCode: 200,
      },
    ]),
    upstreamResponseId: "resp-pi-1",
    stopReason: "stop",
    createdAt: 1_700_000_000,
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | { defaultValue?: string }) => {
      const translations: Record<string, string> = {
        "usage.diagnosticOrigins.upstream": "上游服务",
        "usage.failureKinds.upstream_capacity": "上游容量不足",
      };
      return (
        translations[key] ??
        (typeof fallback === "string"
          ? fallback
          : (fallback?.defaultValue ?? key))
      );
    },
    i18n: { language: "en" },
  }),
}));

vi.mock("@/components/ui/dialog", () => {
  let closeDialog: (() => void) | undefined;
  return {
    Dialog: ({
      children,
      onOpenChange,
    }: {
      children: ReactNode;
      onOpenChange?: (open: boolean) => void;
    }) => {
      closeDialog = () => onOpenChange?.(false);
      return (
        <div>
          {children}
          <button type="button" onClick={closeDialog}>
            dismiss-dialog
          </button>
        </div>
      );
    },
    DialogContent: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    DialogHeader: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    DialogClose: ({ children, ...props }: any) => (
      <button type="button" onClick={() => closeDialog?.()} {...props}>
        {children}
      </button>
    ),
  };
});

vi.mock("@/lib/query/usage", () => ({
  useRequestDetail: () => ({
    isLoading: false,
    data: requestDetailMock.data,
  }),
}));

describe("RequestDetailPanel", () => {
  it("shows Pi protocol and extended usage fields without total-input subtraction", () => {
    const onClose = vi.fn();
    render(<RequestDetailPanel requestId="pi-request" onClose={onClose} />);

    expect(screen.getByText("pi-messages")).toBeInTheDocument();
    expect(screen.getByText("推理 Tokens")).toBeInTheDocument();
    expect(screen.getByText("1 小时缓存写入")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("resp-pi-1")).toBeInTheDocument();
    expect(screen.getByText("stop")).toBeInTheDocument();
    expect(screen.getByText("路由诊断")).toBeInTheDocument();
    expect(screen.getByText("诊断归属")).toBeInTheDocument();
    expect(screen.getByText("上游服务")).toBeInTheDocument();
    expect(screen.getByText("Slow Provider")).toBeInTheDocument();
    expect(screen.getAllByText("上游容量不足")).toHaveLength(2);
    expect(screen.getByText("首个有效输出")).toBeInTheDocument();
    expect(screen.getByText("87ms")).toBeInTheDocument();
    expect(screen.queryByText(/原始/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    fireEvent.click(screen.getByRole("button", { name: "dismiss-dialog" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("uses the selected row snapshot when the live record was removed", () => {
    const fallbackRequest = requestDetailMock.data;
    requestDetailMock.data = null;

    render(
      <RequestDetailPanel
        requestId={fallbackRequest.requestId}
        fallbackRequest={fallbackRequest}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByText("请求未找到")).not.toBeInTheDocument();
    expect(screen.getByText("pi-messages")).toBeInTheDocument();

    requestDetailMock.data = fallbackRequest;
  });
});
