import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { RequestDetailPanel } from "@/components/usage/RequestDetailPanel";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { language: "en" },
  }),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/lib/query/usage", () => ({
  useRequestDetail: () => ({
    isLoading: false,
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
      statusCode: 200,
      upstreamResponseId: "resp-pi-1",
      stopReason: "stop",
      createdAt: 1_700_000_000,
    },
  }),
}));

describe("RequestDetailPanel", () => {
  it("shows Pi protocol and extended usage fields without total-input subtraction", () => {
    render(<RequestDetailPanel requestId="pi-request" onClose={vi.fn()} />);

    expect(screen.getByText("pi-messages")).toBeInTheDocument();
    expect(screen.getByText("推理 Tokens")).toBeInTheDocument();
    expect(screen.getByText("1 小时缓存写入")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("resp-pi-1")).toBeInTheDocument();
    expect(screen.getByText("stop")).toBeInTheDocument();
    expect(screen.queryByText(/原始/)).not.toBeInTheDocument();
  });
});
