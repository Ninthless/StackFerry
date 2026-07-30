import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProviderActions } from "@/components/providers/ProviderActions";

const createProps = () => ({
  isCurrent: false,
  onSwitch: vi.fn(),
  onEdit: vi.fn(),
  onDuplicate: vi.fn(),
  onTest: vi.fn(),
  onConfigureUsage: vi.fn(),
  onDelete: vi.fn(),
});

describe("ProviderActions", () => {
  it("keeps the primary switch action visible", async () => {
    const user = userEvent.setup();
    const props = createProps();

    render(<ProviderActions {...props} />);

    await user.click(screen.getByRole("button", { name: "provider.enable" }));

    expect(props.onSwitch).toHaveBeenCalledOnce();
  });

  it("exposes secondary actions in a labelled overflow menu", async () => {
    const user = userEvent.setup();
    const props = createProps();

    render(<ProviderActions {...props} />);

    await user.click(
      screen.getByRole("button", { name: "provider.moreActions" }),
    );

    expect(screen.getByRole("menuitem", { name: "common.edit" })).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: "provider.connectivityCheck" }),
    ).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: "provider.configureUsage" }),
    ).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: "common.delete" }),
    ).toBeVisible();

    await user.click(
      screen.getByRole("menuitem", { name: "provider.duplicate" }),
    );
    expect(props.onDuplicate).toHaveBeenCalledOnce();

    await user.click(
      screen.getByRole("button", { name: "provider.moreActions" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "provider.configureUsage" }),
    );
    expect(props.onConfigureUsage).toHaveBeenCalledOnce();
  });

  it("disables protected actions for current read-only providers", async () => {
    const user = userEvent.setup();
    const props = createProps();

    render(<ProviderActions {...props} isCurrent isReadOnly />);

    await user.click(
      screen.getByRole("button", { name: "provider.moreActions" }),
    );

    expect(
      screen.getByRole("menuitem", { name: "common.edit" }),
    ).toHaveAttribute("data-disabled");
    expect(
      screen.getByRole("menuitem", { name: "common.delete" }),
    ).toHaveAttribute("data-disabled");
  });
});
