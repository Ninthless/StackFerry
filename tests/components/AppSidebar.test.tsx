import { fireEvent, render, screen } from "@testing-library/react";
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
  it("keeps footer actions in order without rendering version content", () => {
    const onOpenUsage = vi.fn();
    const onOpenSettings = vi.fn();
    const onOpenUpdate = vi.fn();

    render(
      <AppSidebar
        activeApp="claude"
        currentView="providers"
        isRouteActive
        hasSkillsSupport={false}
        hasSessionSupport={false}
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
