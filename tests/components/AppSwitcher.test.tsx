import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppSwitcher } from "@/shared/common/AppSwitcher";
import type { VisibleApps } from "@/shared/contracts";

const visibleApps: VisibleApps = {
  claude: false,
  "claude-desktop": false,
  codex: false,
  pi: false,
  gemini: false,
  grokbuild: false,
  opencode: false,
  openclaw: false,
  hermes: false,
};

describe("AppSwitcher", () => {
  it("shows the active app and switches from the menu", async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn();

    render(
      <AppSwitcher
        activeApp="codex"
        onSwitch={onSwitch}
        visibleApps={{
          ...visibleApps,
          claude: true,
          codex: true,
          gemini: true,
        }}
      />,
    );

    expect(screen.getByText("Codex")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "shell.switchApplication" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Gemini" }));

    expect(onSwitch).toHaveBeenCalledWith("gemini");
    expect(window.localStorage.getItem("stackferry-last-app")).toBe("gemini");
  });

  it("does not switch when the current app is selected", async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn();

    render(
      <AppSwitcher
        activeApp="codex"
        onSwitch={onSwitch}
        visibleApps={{ ...visibleApps, codex: true }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "shell.switchApplication" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Codex" }));

    expect(onSwitch).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("stackferry-last-app")).toBeNull();
  });

  it("uses a compact transparent treatment in the page header", () => {
    render(
      <AppSwitcher
        activeApp="codex"
        onSwitch={vi.fn()}
        visibleApps={{ ...visibleApps, codex: true }}
        variant="header"
      />,
    );

    expect(
      screen.getByRole("button", { name: "shell.switchApplication" }),
    ).toHaveClass("h-7", "w-[176px]", "bg-transparent", "text-foreground");
  });

  it("uses a compact sidebar treatment", () => {
    render(
      <AppSwitcher
        activeApp="codex"
        onSwitch={vi.fn()}
        visibleApps={{ ...visibleApps, codex: true }}
        variant="sidebar"
      />,
    );

    expect(
      screen.getByRole("button", { name: "shell.switchApplication" }),
    ).toHaveClass("h-9", "px-2.5", "text-sm");
  });
});
