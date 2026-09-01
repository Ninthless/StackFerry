import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequestLogTable } from "@/features/usage/RequestLogTable";
import type { UsageRangeSelection } from "@/shared/contracts/usage";

const useRequestLogsMock = vi.hoisted(() => vi.fn());
const useRequestLogFacetsMock = vi.hoisted(() => vi.fn());
const requestLogSource = fs.readFileSync(
  path.resolve(
    __dirname,
    "..",
    "..",
    "src",
    "features",
    "usage",
    "RequestLogTable.tsx",
  ),
  "utf8",
);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      options?: {
        defaultValue?: string;
        count?: number;
      },
    ) =>
      key === "usage.thinkingEffortBudget" && options?.count != null
        ? `Budget ${options.count}`
        : (options?.defaultValue ?? key),
    i18n: {
      resolvedLanguage: "en",
      language: "en",
    },
  }),
}));

vi.mock("@/features/usage/model/usage", () => ({
  useRequestLogs: (args: unknown) => useRequestLogsMock(args),
  useRequestLogFacets: (args: unknown) => useRequestLogFacetsMock(args),
}));

vi.mock("@/shared/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/shared/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock("@/shared/ui/select", () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  SelectValue: ({ placeholder }: any) => <span>{placeholder ?? null}</span>,
  SelectContent: () => null,
  SelectItem: () => null,
}));

vi.mock("@/shared/ui/table", () => ({
  Table: ({ children }: any) => <table>{children}</table>,
  TableBody: ({ children }: any) => <tbody>{children}</tbody>,
  TableCell: ({ children, ...props }: any) => <td {...props}>{children}</td>,
  TableHead: ({ children, ...props }: any) => <th {...props}>{children}</th>,
  TableHeader: ({ children }: any) => <thead>{children}</thead>,
  TableRow: ({ children }: any) => <tr>{children}</tr>,
}));

describe("RequestLogTable", () => {
  beforeEach(() => {
    useRequestLogsMock.mockReset();
    useRequestLogFacetsMock.mockReset();
    useRequestLogFacetsMock.mockReturnValue({
      data: {
        statusCodes: [
          { value: "200", count: 80 },
          { value: "503", count: 4 },
          { value: "504", count: 2 },
        ],
        failureKinds: [{ value: "upstream_capacity", count: 6 }],
      },
    });
    useRequestLogsMock.mockImplementation(
      ({ page = 0, pageSize = 20 }: { page?: number; pageSize?: number }) => ({
        data: {
          data: [],
          total: 120,
          page,
          pageSize,
        },
        isLoading: false,
      }),
    );
  });

  it("resets pagination when the dashboard range changes", async () => {
    const initialRange: UsageRangeSelection = { preset: "today" };
    const nextRange: UsageRangeSelection = {
      preset: "custom",
      customStartDate: 1_710_000_000,
      customEndDate: 1_710_086_400,
    };

    const { rerender } = render(
      <RequestLogTable
        range={initialRange}
        rangeLabel="Today"
        appType="all"
        refreshIntervalMs={0}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "2" }));

    await waitFor(() => {
      expect(useRequestLogsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          range: initialRange,
        }),
      );
    });

    rerender(
      <RequestLogTable
        range={nextRange}
        rangeLabel="Custom"
        appType="all"
        refreshIntervalMs={0}
      />,
    );

    await waitFor(() => {
      expect(useRequestLogsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 0,
          range: nextRange,
        }),
      );
    });
  });

  it("resets pagination when the dashboard app filter changes", async () => {
    const range: UsageRangeSelection = { preset: "today" };
    const { rerender } = render(
      <RequestLogTable
        range={range}
        rangeLabel="Today"
        appType="all"
        refreshIntervalMs={0}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "2" }));

    await waitFor(() => {
      expect(useRequestLogsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          range,
        }),
      );
    });

    rerender(
      <RequestLogTable
        range={range}
        rangeLabel="Today"
        appType="claude"
        refreshIntervalMs={0}
      />,
    );

    await waitFor(() => {
      expect(useRequestLogsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 0,
          range,
        }),
      );
    });
  });

  it("keeps pagination bounded and uses one table scroll container", () => {
    useRequestLogsMock.mockReturnValue({
      data: {
        data: [],
        total: 4000,
        page: 0,
        pageSize: 20,
      },
      isLoading: false,
    });

    render(
      <RequestLogTable
        range={{ preset: "today" }}
        rangeLabel="Today"
        appType="all"
        refreshIntervalMs={0}
      />,
    );

    expect(screen.getAllByRole("button", { name: /^\d+$/ })).toHaveLength(3);
    expect(requestLogSource).toContain("request-log-page-numbers");
    expect(requestLogSource).toContain('<Table className="min-w-[920px]">');
    expect(requestLogSource).not.toContain(
      'className="overflow-x-auto rounded-md border border-border bg-card"',
    );
  });

  it("shows normalized thinking effort below the request model", () => {
    useRequestLogsMock.mockReturnValue({
      data: {
        data: [
          {
            requestId: "request-1",
            providerId: "provider-1",
            providerName: "Provider",
            appType: "codex",
            apiType: "codex",
            model: "gpt-5.6",
            requestModel: "gpt-5.6",
            thinkingEffort: "budget:16000",
            thinkingEffortSource: "thinking.budget_tokens=16000",
            costMultiplier: "1",
            inputTokens: 10,
            outputTokens: 5,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            reasoningTokens: 0,
            cacheCreation1hTokens: 0,
            inputTokenSemantics: 0,
            inputCostUsd: "0",
            outputCostUsd: "0",
            cacheReadCostUsd: "0",
            cacheCreationCostUsd: "0",
            totalCostUsd: "0",
            isStreaming: false,
            latencyMs: 100,
            statusCode: 200,
            createdAt: 1_700_000_000,
            dataSource: "proxy",
          },
        ],
        total: 1,
        page: 0,
        pageSize: 20,
      },
      isLoading: false,
    });

    render(
      <RequestLogTable
        range={{ preset: "today" }}
        rangeLabel="Today"
        appType="all"
        refreshIntervalMs={0}
      />,
    );

    expect(screen.getByTitle("thinking.budget_tokens=16000")).toHaveTextContent(
      "Budget 16000",
    );
  });

  it("shows milliseconds and distinguishes unavailable timing values", () => {
    useRequestLogsMock.mockReturnValue({
      data: {
        data: [
          {
            requestId: "proxy-request",
            providerId: "provider-1",
            providerName: "Provider",
            appType: "codex",
            apiType: "codex",
            model: "gpt-5.6",
            requestModel: "gpt-5.6",
            costMultiplier: "1",
            inputTokens: 10,
            outputTokens: 5,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            reasoningTokens: 0,
            cacheCreation1hTokens: 0,
            inputTokenSemantics: 0,
            inputCostUsd: "0",
            outputCostUsd: "0",
            cacheReadCostUsd: "0",
            cacheCreationCostUsd: "0",
            totalCostUsd: "0",
            isStreaming: true,
            latencyMs: 842,
            firstTokenMs: 173,
            statusCode: 200,
            createdAt: 1_700_000_000,
            dataSource: "proxy",
          },
          {
            requestId: "session-request",
            providerId: "_codex_session",
            providerName: "Codex (Session)",
            appType: "codex",
            apiType: "codex",
            model: "gpt-5.6",
            requestModel: "gpt-5.6",
            costMultiplier: "1",
            inputTokens: 10,
            outputTokens: 5,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            reasoningTokens: 0,
            cacheCreation1hTokens: 0,
            inputTokenSemantics: 0,
            inputCostUsd: "0",
            outputCostUsd: "0",
            cacheReadCostUsd: "0",
            cacheCreationCostUsd: "0",
            totalCostUsd: "0",
            isStreaming: true,
            latencyMs: 0,
            statusCode: 200,
            createdAt: 1_700_000_000,
            dataSource: "codex_session",
          },
        ],
        total: 2,
        page: 0,
        pageSize: 20,
      },
      isLoading: false,
    });

    render(
      <RequestLogTable
        range={{ preset: "today" }}
        rangeLabel="Today"
        appType="all"
        refreshIntervalMs={0}
      />,
    );

    expect(screen.getByText("842ms/173ms")).toBeInTheDocument();
    expect(screen.getByText("—/—")).toBeInTheDocument();
    expect(screen.queryByText("0.0s")).not.toBeInTheDocument();
  });
});
