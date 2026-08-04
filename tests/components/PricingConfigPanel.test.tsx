import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PricingConfigPanel } from "@/components/usage/PricingConfigPanel";

const proxyApiMock = vi.hoisted(() => ({
  getDefaultCostMultiplier: vi.fn(),
  getPricingModelSource: vi.fn(),
  setDefaultCostMultiplier: vi.fn(),
  setPricingModelSource: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/lib/api/proxy", () => ({ proxyApi: proxyApiMock }));

vi.mock("@/lib/query/usage", () => ({
  useModelPricing: () => ({ data: [], isLoading: false, error: null }),
  useDeleteModelPricing: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/components/usage/ModelsDevAutoSyncPanel", () => ({
  ModelsDevAutoSyncPanel: () => null,
}));

vi.mock("@/components/usage/PricingEditModal", () => ({
  PricingEditModal: () => null,
}));

describe("PricingConfigPanel", () => {
  beforeEach(() => {
    proxyApiMock.getDefaultCostMultiplier.mockReset().mockResolvedValue("1");
    proxyApiMock.getPricingModelSource
      .mockReset()
      .mockResolvedValue("response");
    proxyApiMock.setDefaultCostMultiplier
      .mockReset()
      .mockResolvedValue(undefined);
    proxyApiMock.setPricingModelSource.mockReset().mockResolvedValue(undefined);
  });

  it("loads and renders Pi pricing defaults", async () => {
    render(<PricingConfigPanel />);

    await waitFor(() =>
      expect(proxyApiMock.getDefaultCostMultiplier).toHaveBeenCalledWith("pi"),
    );
    expect(proxyApiMock.getPricingModelSource).toHaveBeenCalledWith("pi");
    expect(screen.getByText("apps.pi")).toBeInTheDocument();
  });
});
