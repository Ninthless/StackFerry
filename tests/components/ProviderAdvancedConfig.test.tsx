import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProviderAdvancedConfig } from "@/components/providers/forms/ProviderAdvancedConfig";

describe("ProviderAdvancedConfig", () => {
  it("keeps the disclosure and pricing switch as separate controls", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ProviderAdvancedConfig
        pricingConfig={{
          enabled: false,
          pricingModelSource: "inherit",
        }}
        onPricingConfigChange={onChange}
      />,
    );

    const disclosure = screen.getByRole("button", { name: "计费配置" });
    const pricingSwitch = screen.getByRole("switch", {
      name: "使用单独配置",
    });

    expect(disclosure.contains(pricingSwitch)).toBe(false);
    expect(container.querySelector("button button")).toBeNull();
    expect(
      screen.queryByText(
        "为此供应商配置单独的计费参数，不启用时使用全局默认配置。",
      ),
    ).toBeNull();

    fireEvent.click(disclosure);
    expect(
      screen.getByText(
        "为此供应商配置单独的计费参数，不启用时使用全局默认配置。",
      ),
    ).toBeInTheDocument();

    fireEvent.click(pricingSwitch);
    expect(onChange).toHaveBeenCalledWith({
      enabled: true,
      pricingModelSource: "inherit",
    });
  });
});
