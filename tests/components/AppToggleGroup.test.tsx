import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppToggleGroup } from "@/components/common/AppToggleGroup";
import { TooltipProvider } from "@/components/ui/tooltip";

describe("AppToggleGroup", () => {
  it("shows selection independently from brand icon color", () => {
    const onToggle = vi.fn();

    render(
      <TooltipProvider>
        <AppToggleGroup
          apps={{ claude: true, codex: false }}
          appIds={["claude", "codex"]}
          onToggle={onToggle}
        />
      </TooltipProvider>,
    );

    const claude = screen.getByRole("button", { name: "Claude" });
    const codex = screen.getByRole("button", { name: "Codex" });

    expect(claude).toHaveAttribute("aria-pressed", "true");
    expect(codex).toHaveAttribute("aria-pressed", "false");
    expect(claude.querySelector(".lucide-check")).toBeInTheDocument();
    expect(codex.querySelector(".lucide-check")).not.toBeInTheDocument();

    fireEvent.click(codex);

    expect(onToggle).toHaveBeenCalledWith("codex", true);
  });
});
