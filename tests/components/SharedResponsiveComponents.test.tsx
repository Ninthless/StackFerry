import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppCountBar } from "@/components/common/AppCountBar";
import { AppToggleGroup } from "@/components/common/AppToggleGroup";
import { ListItemRow } from "@/components/common/ListItemRow";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("shared responsive components", () => {
  it("keeps app counts fixed and exposes the scroll region to keyboards", () => {
    const { container } = render(
      <AppCountBar
        totalLabel="Configured 2"
        counts={{ claude: 1, codex: 2 }}
        appIds={["claude", "codex"]}
      />,
    );

    expect(screen.getByText("Configured 2")).toHaveClass(
      "h-7",
      "shrink-0",
      "whitespace-nowrap",
    );
    expect(
      screen.getByRole("generic", { name: "Configured 2" }),
    ).toHaveAttribute("tabindex", "0");
    expect(
      container.querySelectorAll(".app-count-bar-stats .shrink-0"),
    ).toHaveLength(2);
    expect(container.querySelector(".app-count-bar-stats")).toHaveClass(
      "min-w-0",
      "flex-1",
      "overflow-x-auto",
    );
  });

  it("keeps list children unchanged unless an actions slot is supplied", () => {
    const { container, rerender } = render(
      <ListItemRow>
        <span data-testid="content">Content</span>
      </ListItemRow>,
    );

    expect(container.querySelector(".list-item-row-content")).toBeNull();

    rerender(
      <ListItemRow actions={<button type="button">Edit</button>}>
        <span data-testid="content">Content</span>
      </ListItemRow>,
    );

    expect(container.querySelector(".list-item-row-content")).toContainElement(
      screen.getByTestId("content"),
    );
    expect(container.querySelector(".list-item-row-actions")).toContainElement(
      screen.getByRole("button", { name: "Edit" }),
    );
    expect(container.querySelector(".list-item-row-actions")).toHaveClass(
      "shrink-0",
    );
  });

  it.each([
    ["equal", "w-full"],
    ["scrollable", "overflow-x-auto"],
    ["compact", "justify-start"],
  ] as const)("supports the %s tabs layout", (layout, expectedClass) => {
    const { container } = render(
      <Tabs defaultValue="one">
        <TabsList layout={layout}>
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    expect(container.querySelector('[role="tablist"]')).toHaveClass(
      expectedClass,
    );
  });

  it("preserves the legacy tabs list when layout is omitted", () => {
    const { container } = render(
      <Tabs defaultValue="one">
        <TabsList>
          <TabsTrigger value="one">One</TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    expect(container.querySelector('[role="tablist"]')).not.toHaveClass(
      "overflow-x-auto",
      "w-full",
    );
  });

  it("accepts toggle group layout classes and keeps buttons at 32px", () => {
    const { container } = render(
      <TooltipProvider>
        <AppToggleGroup
          apps={{ claude: true }}
          appIds={["claude"]}
          onToggle={vi.fn()}
          className="justify-end"
        />
      </TooltipProvider>,
    );

    expect(container.querySelector(".app-toggle-group")).toHaveClass(
      "flex-wrap",
      "justify-end",
    );
    expect(screen.getByRole("button", { name: "Claude" })).toHaveClass(
      "h-8",
      "w-8",
    );
  });
});
