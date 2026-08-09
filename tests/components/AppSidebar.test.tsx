import { fireEvent, render, screen } from "@testing-library/react";
import type { AppId } from "@/lib/api/types";
import { vi } from "vitest";

vi.mock("@/components/UpdateBadge", () => ({
  UpdateBadge: ({ onClick }: { onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      update-badge
    </button>
  ),
}));

import { AppSidebar } from "@/components/shell/AppSidebar";

const precedes = (before: Element, after: Element) =>
  Boolean(
    before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING,
  );

describe("AppSidebar", () => {
  const renderSidebar = (activeApp: AppId = "claude") =>
    render(
      <AppSidebar
        activeApp={activeApp}
        currentView="providers"
        isRouteActive={false}
        onViewChange={vi.fn()}
        onOpenHermesWebUI={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenUsage={vi.fn()}
        onOpenUpdate={vi.fn()}
      />,
    );

  it.each<AppId>([
    "claude",
    "claude-desktop",
    "codex",
    "pi",
    "gemini",
    "grokbuild",
    "opencode",
    "openclaw",
    "hermes",
  ])(
    "keeps global navigation and usage visible for %s routing",
    (activeApp) => {
      const { unmount } = renderSidebar(activeApp);

      expect(screen.getByText("Skills")).toBeInTheDocument();
      expect(screen.getByText("Prompts")).toBeInTheDocument();
      expect(screen.getByText("Sessions")).toBeInTheDocument();
      expect(screen.getByText("MCP servers")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Routing activity" }),
      ).toBeInTheDocument();

      unmount();
    },
  );

  it("adds route-specific tools without duplicating global navigation", () => {
    const { rerender } = renderSidebar("openclaw");

    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByText("Environment")).toBeInTheDocument();
    expect(screen.getAllByText("Sessions")).toHaveLength(1);

    rerender(
      <AppSidebar
        activeApp="hermes"
        currentView="providers"
        isRouteActive={false}
        onViewChange={vi.fn()}
        onOpenHermesWebUI={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenUsage={vi.fn()}
        onOpenUpdate={vi.fn()}
      />,
    );

    expect(screen.getByText("Memory")).toBeInTheDocument();
    expect(screen.getByText("Open dashboard")).toBeInTheDocument();
    expect(screen.getAllByText("Skills")).toHaveLength(1);
    expect(screen.getAllByText("MCP servers")).toHaveLength(1);
  });

  it("shows Pi extensions only for Pi", () => {
    const { rerender } = renderSidebar("claude");
    expect(screen.queryByText("piExtensions.title")).not.toBeInTheDocument();

    rerender(
      <AppSidebar
        activeApp="pi"
        currentView="providers"
        isRouteActive={false}
        onViewChange={vi.fn()}
        onOpenHermesWebUI={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenUsage={vi.fn()}
        onOpenUpdate={vi.fn()}
      />,
    );

    expect(screen.getByText("piExtensions.title")).toBeInTheDocument();
  });

  it("keeps footer actions in order without rendering version content", () => {
    const onOpenUsage = vi.fn();
    const onOpenSettings = vi.fn();
    const onOpenUpdate = vi.fn();

    render(
      <AppSidebar
        activeApp="claude"
        currentView="providers"
        isRouteActive
        onViewChange={vi.fn()}
        onOpenHermesWebUI={vi.fn()}
        onOpenSettings={onOpenSettings}
        onOpenUsage={onOpenUsage}
        onOpenUpdate={onOpenUpdate}
      />,
    );

    const routeActivity = screen.getByRole("button", {
      name: "Routing activity",
    });
    const settings = screen.getByRole("button", { name: "common.settings" });
    const update = screen.getByRole("button", { name: "update-badge" });

    expect(screen.queryByText(/^v\d/)).not.toBeInTheDocument();
    expect(
      document.querySelector(".lucide-sliders-horizontal"),
    ).not.toBeInTheDocument();
    expect(precedes(routeActivity, settings)).toBe(true);
    expect(precedes(settings, update)).toBe(true);

    fireEvent.click(routeActivity);
    fireEvent.click(settings);
    fireEvent.click(update);

    expect(onOpenUsage).toHaveBeenCalledOnce();
    expect(onOpenSettings).toHaveBeenCalledOnce();
    expect(onOpenUpdate).toHaveBeenCalledOnce();
  });
});
