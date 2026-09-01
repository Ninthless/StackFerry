import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProviderHealthBadge } from "@/features/providers/ProviderHealthBadge";

describe("ProviderHealthBadge", () => {
  it("offers manual recovery only when the circuit is open", () => {
    const onRecover = vi.fn();
    const { rerender } = render(
      <ProviderHealthBadge
        consecutiveFailures={3}
        isHealthy={false}
        onRecover={onRecover}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "手动恢复熔断" }));
    expect(onRecover).toHaveBeenCalledTimes(1);

    rerender(
      <ProviderHealthBadge
        consecutiveFailures={0}
        isHealthy
        onRecover={onRecover}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "手动恢复熔断" }),
    ).not.toBeInTheDocument();
  });

  it("disables recovery while reset is pending", () => {
    render(
      <ProviderHealthBadge
        consecutiveFailures={3}
        isHealthy={false}
        isRecovering
        onRecover={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "手动恢复熔断" })).toBeDisabled();
  });
});
