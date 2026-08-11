import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CcSwitchImportButton } from "./CcSwitchImportButton";

const mocks = vi.hoisted(() => ({
  dialog: vi.fn(),
}));

vi.mock("./CcSwitchImportDialog", () => ({
  CcSwitchImportDialog: (props: {
    open: boolean;
    appId: string;
    onOpenChange: (open: boolean) => void;
  }) => {
    mocks.dialog(props);
    return props.open ? <div role="dialog">{props.appId}</div> : null;
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("CcSwitchImportButton", () => {
  it.each(["claude", "codex", "gemini", "opencode"] as const)(
    "opens the import dialog for %s",
    (appId) => {
      render(<CcSwitchImportButton appId={appId} />);

      fireEvent.click(
        screen.getByRole("button", {
          name: "provider.importFromCcSwitch",
        }),
      );

      expect(screen.getByRole("dialog")).toHaveTextContent(appId);
      expect(mocks.dialog).toHaveBeenLastCalledWith(
        expect.objectContaining({
          open: true,
          appId,
        }),
      );
    },
  );

  it("passes route changes to the dialog", () => {
    const { rerender } = render(<CcSwitchImportButton appId="claude" />);

    rerender(<CcSwitchImportButton appId="codex" />);

    expect(
      screen.getByRole("button", { name: "provider.importFromCcSwitch" }),
    ).toBeInTheDocument();
    expect(mocks.dialog).toHaveBeenLastCalledWith(
      expect.objectContaining({
        open: false,
        appId: "codex",
      }),
    );
  });
});
