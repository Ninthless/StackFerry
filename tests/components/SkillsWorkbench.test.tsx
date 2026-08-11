import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import SkillsWorkbench from "@/components/skills/SkillsWorkbench";

vi.mock("@/components/skills/UnifiedSkillsPanel", () => ({
  default: React.forwardRef(
    ({ workbenchTabs }: { workbenchTabs: React.ReactNode }, _ref) => (
      <div>
        {workbenchTabs}
        <div>Installed workspace</div>
      </div>
    ),
  ),
}));

vi.mock("@/components/skills/SkillsPage", () => ({
  SkillsPage: React.forwardRef(
    ({ workbenchTabs }: { workbenchTabs: React.ReactNode }, _ref) => (
      <div>
        {workbenchTabs}
        <div>Discovery workspace</div>
      </div>
    ),
  ),
}));

describe("SkillsWorkbench", () => {
  it("integrates installed and discovery tabs in one workspace", async () => {
    const user = userEvent.setup();
    render(
      <SkillsWorkbench initialTab="installed" availableApps={["claude"]} />,
    );

    expect(screen.getByText("Installed workspace")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "skills.tabs.discover" }));
    expect(screen.getByText("Discovery workspace")).toBeInTheDocument();
  });

  it("supports the discovery route initial tab", () => {
    render(
      <SkillsWorkbench initialTab="discover" availableApps={["claude"]} />,
    );
    expect(screen.getByText("Discovery workspace")).toBeInTheDocument();
  });
});
