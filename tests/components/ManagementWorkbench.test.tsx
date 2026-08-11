import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  DetailPane,
  ManagementSummary,
  ManagementSummaryItem,
  ManagementWorkbench,
  ResourceToolbar,
  StatusBadge,
  StatusReason,
  type StatusTone,
} from "@/components/common/ManagementWorkbench";

describe("ManagementWorkbench", () => {
  it("renders summary, toolbar, primary content, and detail slots", () => {
    const { container } = render(
      <ManagementWorkbench
        mode="split"
        summary={<div>Summary slot</div>}
        toolbar={<div>Toolbar slot</div>}
        detail={<aside>Detail slot</aside>}
      >
        <main>Primary slot</main>
      </ManagementWorkbench>,
    );

    const root = container.querySelector(".management-workbench");
    expect(root).toHaveClass("workbench-container");
    expect(root).toHaveAttribute("data-mode", "split");
    expect(screen.getByText("Summary slot")).toBeInTheDocument();
    expect(screen.getByText("Toolbar slot")).toBeInTheDocument();
    expect(screen.getByText("Primary slot")).toBeInTheDocument();
    expect(screen.getByText("Detail slot")).toBeInTheDocument();
  });

  it("exposes compact summary and toolbar slots", () => {
    const { container } = render(
      <>
        <ManagementSummary
          trailing={<button type="button">Refresh</button>}
          aria-label="Inventory summary"
        >
          <ManagementSummaryItem label="Installed" value="12" />
          <ManagementSummaryItem label="Issues" value="2" status="error" />
        </ManagementSummary>
        <ResourceToolbar
          aria-label="Resource controls"
          search={<input aria-label="Search resources" />}
          primaryFilters={<button type="button">Status</button>}
          secondaryFilters={<button type="button">Source</button>}
          actions={<button type="button">Add</button>}
        />
      </>,
    );

    expect(
      screen.getByRole("toolbar", { name: "Resource controls" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Search resources")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(
      container.querySelector(".management-summary-items"),
    ).toHaveTextContent("Installed12Issues2");
    expect(
      container.querySelector(".resource-toolbar-secondary-filters"),
    ).toContainElement(screen.getByRole("button", { name: "Source" }));
  });

  it("renders every supported status with an icon and stable semantics", () => {
    const statuses: StatusTone[] = [
      "success",
      "muted",
      "warning",
      "error",
      "info",
      "protected",
      "pending",
    ];

    const { container } = render(
      <div>
        {statuses.map((status) => (
          <StatusBadge key={status} status={status}>
            {status}
          </StatusBadge>
        ))}
        <StatusReason status="protected" title="Managed by policy">
          This resource cannot be changed.
        </StatusReason>
      </div>,
    );

    statuses.forEach((status) => {
      const badge = container.querySelector(
        `.status-badge[data-status="${status}"]`,
      );
      expect(badge).toBeInTheDocument();
      expect(badge?.querySelector("svg")).toBeInTheDocument();
    });
    expect(screen.getByText("Managed by policy")).toBeInTheDocument();
    expect(
      screen.getByText("This resource cannot be changed."),
    ).toBeInTheDocument();
  });

  it("keeps detail pane state caller-owned and exposes header, body, and actions", () => {
    const { container } = render(
      <DetailPane
        aria-label="Resource details"
        title="Filesystem"
        description="Local MCP server"
        actions={<button type="button">Close</button>}
        footer={<button type="button">Save</button>}
      >
        <p>Detail body</p>
      </DetailPane>,
    );

    expect(
      screen.getByRole("region", { name: "Resource details" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Filesystem" })).toHaveClass(
      "text-sm",
    );
    expect(screen.getByText("Detail body")).toBeInTheDocument();
    expect(container.querySelector(".detail-pane-actions")).toContainElement(
      screen.getByRole("button", { name: "Close" }),
    );
    expect(container.querySelector(".detail-pane-footer")).toContainElement(
      screen.getByRole("button", { name: "Save" }),
    );
  });
});
