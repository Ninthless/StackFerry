import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useProviderHealth,
  useResetCircuitBreaker,
} from "@/features/proxy/model/failover";
import { useProvidersQuery } from "@/features/providers/model/queries";
import { invalidateDatabaseState } from "@/platform/tauri/query/invalidateDatabaseState";

const {
  getProviderHealthMock,
  resetCircuitBreakerMock,
  toastSuccessMock,
  getAllProvidersMock,
  getCurrentProviderMock,
} = vi.hoisted(() => ({
  getProviderHealthMock: vi.fn(),
  resetCircuitBreakerMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  getAllProvidersMock: vi.fn(),
  getCurrentProviderMock: vi.fn(),
}));

vi.mock("@/platform/tauri/api/failover", () => ({
  failoverApi: {
    getProviderHealth: getProviderHealthMock,
    resetCircuitBreaker: resetCircuitBreakerMock,
  },
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock, error: vi.fn() },
}));

vi.mock("@/platform/tauri/api", () => ({
  providersApi: {
    getAll: getAllProvidersMock,
    getCurrent: getCurrentProviderMock,
  },
  settingsApi: { get: vi.fn() },
  usageApi: { query: vi.fn() },
  sessionsApi: { list: vi.fn(), getMessages: vi.fn() },
}));

const createWrapper = (
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) => {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
};

describe("query lifecycle", () => {
  beforeEach(() => {
    getProviderHealthMock.mockReset();
    getProviderHealthMock.mockResolvedValue({
      is_healthy: true,
      consecutive_failures: 0,
    });
    resetCircuitBreakerMock.mockReset();
    resetCircuitBreakerMock.mockResolvedValue(undefined);
    toastSuccessMock.mockReset();
    getAllProvidersMock.mockReset();
    getAllProvidersMock.mockResolvedValue({});
    getCurrentProviderMock.mockReset();
    getCurrentProviderMock.mockResolvedValue("");
  });

  it("does not query provider health until monitoring is enabled", async () => {
    const { rerender, unmount } = renderHook(
      ({ enabled }) => useProviderHealth("provider-1", "codex", enabled),
      {
        initialProps: { enabled: false },
        wrapper: createWrapper(),
      },
    );

    expect(getProviderHealthMock).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(getProviderHealthMock).toHaveBeenCalledTimes(1));
    unmount();
  });

  it("does not load providers while the provider route is inactive", async () => {
    const { rerender } = renderHook(
      ({ enabled }) =>
        useProvidersQuery("codex", { enabled, isProxyRunning: true }),
      {
        initialProps: { enabled: false },
        wrapper: createWrapper(),
      },
    );

    expect(getAllProvidersMock).not.toHaveBeenCalled();
    expect(getCurrentProviderMock).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => {
      expect(getAllProvidersMock).toHaveBeenCalledTimes(1);
      expect(getCurrentProviderMock).toHaveBeenCalledTimes(1);
    });
  });

  it("resets an open circuit and updates its cached health immediately", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const healthKey = ["providerHealth", "provider-1", "codex"];
    queryClient.setQueryData(healthKey, {
      provider_id: "provider-1",
      app_type: "codex",
      is_healthy: false,
      consecutive_failures: 3,
      last_success_at: null,
      last_failure_at: null,
      last_error: "timeout",
      updated_at: "2026-08-05T00:00:00Z",
    });
    const { result } = renderHook(() => useResetCircuitBreaker(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        providerId: "provider-1",
        appType: "codex",
      });
    });

    expect(resetCircuitBreakerMock).toHaveBeenCalledWith("provider-1", "codex");
    expect(queryClient.getQueryData(healthKey)).toMatchObject({
      is_healthy: true,
      consecutive_failures: 0,
      last_error: null,
    });
    expect(toastSuccessMock).toHaveBeenCalledTimes(1);
  });

  it("invalidates restored database state without touching external catalogs", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["providers", "codex"], { providers: {} });
    queryClient.setQueryData(["models-dev-pricing"], { openai: {} });

    await invalidateDatabaseState(queryClient);

    expect(
      queryClient.getQueryState(["providers", "codex"])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["models-dev-pricing"])?.isInvalidated,
    ).toBe(false);
  });
});
