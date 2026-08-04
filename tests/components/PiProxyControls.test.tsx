import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const proxyState = vi.hoisted(() => ({
  setTakeoverForApp: vi.fn(async () => undefined),
}));
const failoverState = vi.hoisted(() => ({
  mutate: vi.fn(),
}));

vi.mock("@/hooks/useProxyStatus", () => ({
  useProxyStatus: () => ({
    isRunning: true,
    takeoverStatus: { pi: true },
    setTakeoverForApp: proxyState.setTakeoverForApp,
    isPending: false,
    status: { address: "127.0.0.1", port: 15721 },
  }),
}));

vi.mock("@/lib/query/failover", () => ({
  useAutoFailoverEnabled: () => ({ data: false, isLoading: false }),
  useSetAutoFailoverEnabled: () => ({
    mutate: failoverState.mutate,
    isPending: false,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, options?: Record<string, unknown>) =>
      options?.defaultValue ?? _key,
  }),
}));

import { FailoverToggle } from "@/components/proxy/FailoverToggle";
import { ProxyToggle } from "@/components/proxy/ProxyToggle";

describe("Pi proxy controls", () => {
  beforeEach(() => {
    proxyState.setTakeoverForApp.mockClear();
    failoverState.mutate.mockClear();
  });

  it("renders Pi takeover as enabled and delegates disabling", () => {
    render(<ProxyToggle activeApp="pi" />);

    const toggle = screen.getByRole("switch");
    expect(toggle).toBeChecked();
    expect(toggle.closest("[title]")?.getAttribute("title")).toContain("Pi");
    fireEvent.click(toggle);
    expect(proxyState.setTakeoverForApp).toHaveBeenCalledWith({
      appType: "pi",
      enabled: false,
    });
  });

  it("allows Pi failover when takeover is active", () => {
    render(<FailoverToggle activeApp="pi" />);

    const toggle = screen.getByRole("switch");
    expect(toggle).toBeEnabled();
    fireEvent.click(toggle);
    expect(failoverState.mutate).toHaveBeenCalledWith({
      appType: "pi",
      enabled: true,
    });
  });
});
