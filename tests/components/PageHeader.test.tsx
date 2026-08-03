import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";

describe("PageHeader", () => {
  it("keeps primary actions visible and exposes secondary actions in a menu", async () => {
    const user = userEvent.setup();
    const onPrimary = vi.fn();
    const onImport = vi.fn();

    render(
      <PageHeader
        title="Providers"
        context="Direct mode"
        actions={<button onClick={onPrimary}>Add provider</button>}
        overflowLabel="More actions"
        overflowActions={[
          {
            key: "import",
            label: "Import providers",
            icon: <Download className="h-4 w-4" />,
            onSelect: onImport,
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add provider" }));
    expect(onPrimary).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(
      screen.getByRole("menuitem", { name: "Import providers" }),
    );
    expect(onImport).toHaveBeenCalledOnce();
  });

  it("does not use horizontal scrolling for header actions", () => {
    const { container } = render(
      <PageHeader title="Settings" actions={<button>Save</button>} />,
    );

    expect(container.querySelector(".overflow-x-auto")).toBeNull();
  });

  it("uses the app switcher as the sole provider identity", () => {
    const { container } = render(
      <PageHeader
        title="Codex"
        appSwitcher={<button>Switch Codex</button>}
        showTitle={false}
      />,
    );

    expect(screen.getByRole("button", { name: "Switch Codex" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Codex" })).toHaveClass(
      "sr-only",
    );
    expect(container.querySelector("header p")).toBeNull();
  });

  it("keeps non-provider page titles and context without an app switcher", () => {
    render(<PageHeader title="Settings" context="Manage the application" />);

    expect(screen.getByRole("heading", { name: "Settings" })).not.toHaveClass(
      "sr-only",
    );
    expect(screen.getByText("Manage the application")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Switch Codex" }),
    ).not.toBeInTheDocument();
  });
});
