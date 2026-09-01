import { fireEvent, render, screen } from "@testing-library/react";
import type { AppId } from "@/platform/tauri/api/types";
import { vi } from "vitest";

vi.mock("@/features/settings/UpdateBadge", () => ({
  UpdateBadge: ({ onClick }: { onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      update-badge
    </button>
  ),
}));

vi.mock("@/contexts/AnnouncementContext", () => ({
  useAnnouncements: () => ({
    feed: { unreadCount: 2 },
  }),
}));

import { AppSidebar } from "@/app/shell/AppSidebar";
import type { VisibleApps } from "@/shared/contracts";
import { supportsCapability } from "@/app/capabilities";

const precedes = (before: Element, after: Element) =>
  Boolean(
    before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING,
  );

describe("AppSidebar", () => {
  const visibleApps: VisibleApps = {
    claude: true,
    "claude-desktop": true,
    codex: true,
    pi: true,
    gemini: true,
    grokbuild: true,
    opencode: true,
    openclaw: true,
    hermes: true,
  };

  const renderSidebar = (activeApp: AppId = "claude") =>
    render(
      <AppSidebar
        activeApp={activeApp}
        visibleApps={visibleApps}
        currentView="providers"
        isRouteActive={false}
        onAppSwitch={vi.fn()}
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

      if (supportsCapability(activeApp, "skills")) {
        expect(screen.getByText("Skills")).toBeInTheDocument();
      } else {
        expect(screen.queryByText("Skills")).not.toBeInTheDocument();
      }
      if (supportsCapability(activeApp, "prompts")) {
        expect(screen.getByText("Prompts")).toBeInTheDocument();
      } else {
        expect(screen.queryByText("Prompts")).not.toBeInTheDocument();
      }
      expect(screen.getByText("Sessions")).toBeInTheDocument();
      if (supportsCapability(activeApp, "mcp")) {
        expect(screen.getByText("MCP servers")).toBeInTheDocument();
      } else {
        expect(screen.queryByText("MCP servers")).not.toBeInTheDocument();
      }
      expect(screen.getByText("announcements.title")).toBeInTheDocument();
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
        visibleApps={visibleApps}
        currentView="providers"
        isRouteActive={false}
        onAppSwitch={vi.fn()}
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
        visibleApps={visibleApps}
        currentView="providers"
        isRouteActive={false}
        onAppSwitch={vi.fn()}
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
    const onViewChange = vi.fn();

    render(
      <AppSidebar
        activeApp="claude"
        visibleApps={visibleApps}
        currentView="providers"
        isRouteActive
        onAppSwitch={vi.fn()}
        onViewChange={onViewChange}
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

  it("shows a navigation entry and unread dot for announcements", () => {
    const onViewChange = vi.fn();

    render(
      <AppSidebar
        activeApp="claude"
        visibleApps={visibleApps}
        currentView="providers"
        isRouteActive={false}
        onAppSwitch={vi.fn()}
        onViewChange={onViewChange}
        onOpenHermesWebUI={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenUsage={vi.fn()}
        onOpenUpdate={vi.fn()}
      />,
    );

    const announcements = screen.getByRole("button", {
      name: "announcements.title announcements.unread",
    });
    fireEvent.click(announcements);

    expect(onViewChange).toHaveBeenCalledWith("announcements");
  });

  it("renders the active Agent selector above navigation", () => {
    const onAppSwitch = vi.fn();

    render(
      <AppSidebar
        activeApp="codex"
        visibleApps={{ ...visibleApps, gemini: false }}
        currentView="providers"
        isRouteActive={false}
        onAppSwitch={onAppSwitch}
        onViewChange={vi.fn()}
        onOpenHermesWebUI={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenUsage={vi.fn()}
        onOpenUpdate={vi.fn()}
      />,
    );

    const selector = screen.getByRole("button", {
      name: "shell.switchApplication",
    });
    const navigation = screen.getByRole("navigation");

    expect(selector).toHaveAttribute("data-variant", "sidebar");
    expect(selector).toHaveTextContent("Codex");
    expect(precedes(selector, navigation)).toBe(true);
  });
});
