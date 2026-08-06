import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CcSwitchImportButton } from "./CcSwitchImportButton";

const mocks = vi.hoisted(() => ({
  importProviders: vi.fn(),
  switchProvider: vi.fn(),
  importDefault: vi.fn(),
  removeFromLive: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/api/providers", () => ({
  providersApi: {
    importCcSwitchCodexProviders: mocks.importProviders,
    switch: mocks.switchProvider,
    importDefault: mocks.importDefault,
    removeFromLiveConfig: mocks.removeFromLive,
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: mocks.success,
    warning: mocks.warning,
    error: mocks.error,
  },
}));

function renderButton(appId: "claude" | "codex") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <CcSwitchImportButton appId={appId} />
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

const importResult = {
  imported: 4,
  added: 1,
  updated: 1,
  merged: 1,
  skipped: 1,
  warnings: ["one warning"],
  providers: [],
};

describe("CcSwitchImportButton", () => {
  beforeEach(() => {
    mocks.importProviders.mockResolvedValue(importResult);
  });

  it("is available only on the Codex provider route", () => {
    const { rerender, queryClient } = renderButton("claude");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    rerender(
      <QueryClientProvider client={queryClient}>
        <CcSwitchImportButton appId="codex" />
      </QueryClientProvider>,
    );
    expect(
      screen.getByRole("button", { name: "provider.importFromCcSwitch" }),
    ).toBeInTheDocument();
  });

  it("locks duplicate clicks, reports counts, and refreshes Codex providers", async () => {
    let finishImport: (value: typeof importResult) => void = () => {};
    mocks.importProviders.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishImport = resolve;
        }),
    );
    const { queryClient } = renderButton("codex");
    const invalidate = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    const button = screen.getByRole("button", {
      name: "provider.importFromCcSwitch",
    });

    fireEvent.click(button);
    fireEvent.click(button);
    expect(mocks.importProviders).toHaveBeenCalledOnce();
    await waitFor(() => expect(button).toBeDisabled());

    finishImport(importResult);
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["providers", "codex"],
      });
    });
    expect(mocks.success).toHaveBeenCalledWith(
      "provider.ccSwitchImportSuccess",
      expect.objectContaining({
        description: expect.stringContaining('"skipped":1'),
      }),
    );
    expect(mocks.warning).toHaveBeenCalled();
    expect(mocks.switchProvider).not.toHaveBeenCalled();
    expect(mocks.importDefault).not.toHaveBeenCalled();
    expect(mocks.removeFromLive).not.toHaveBeenCalled();
  });

  it("surfaces backend errors without refreshing or switching", async () => {
    mocks.importProviders.mockRejectedValueOnce("database not found");
    const { queryClient } = renderButton("codex");
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    fireEvent.click(
      screen.getByRole("button", { name: "provider.importFromCcSwitch" }),
    );

    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(invalidate).not.toHaveBeenCalled();
    expect(mocks.switchProvider).not.toHaveBeenCalled();
  });
});
