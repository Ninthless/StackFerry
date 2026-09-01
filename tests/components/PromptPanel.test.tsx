import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createRef, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import PromptPanel, {
  type PromptPageState,
  type PromptPanelHandle,
} from "@/features/prompts/PromptPanel";
import type { AppId } from "@/platform/tauri/api/types";

const usePromptActionsMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/prompts/model/usePromptActions", () => ({
  usePromptActions: (app: AppId) => usePromptActionsMock(app),
}));

vi.mock("@/platform/tauri/react/useTauriEvent", () => ({
  useTauriEvent: () => {},
}));

vi.mock("@/features/prompts/PromptFormPanel", () => ({
  default: ({
    appId,
    onCancel,
    onSave,
  }: {
    appId: AppId;
    onCancel: () => void;
    onSave: (id: string, prompt: unknown) => Promise<void>;
  }) => (
    <div data-testid="prompt-form">
      {appId}
      <button type="button" onClick={onCancel}>
        cancel-form
      </button>
      <button
        type="button"
        onClick={() =>
          void onSave("saved-prompt", {
            id: "saved-prompt",
            name: "Saved Prompt",
            content: "Saved content",
            enabled: false,
          })
        }
      >
        save-form
      </button>
    </div>
  ),
}));

const promptActions = {
  prompts: {},
  loading: false,
  reload: vi.fn(),
  savePrompt: vi.fn(),
  deletePrompt: vi.fn(),
  toggleEnabled: vi.fn(),
  pendingToggleId: null,
  importFromFile: vi.fn(),
  getCurrentFileContent: vi.fn(),
};

describe("PromptPanel", () => {
  beforeEach(() => {
    usePromptActionsMock.mockReset();
    usePromptActionsMock.mockReturnValue(promptActions);
    promptActions.reload.mockReset();
  });

  it("opens a full editor page for the application supplied by the page scope", () => {
    const ref = createRef<PromptPanelHandle>();
    const onPageStateChange = vi.fn();
    const { container } = render(
      <PromptPanel
        ref={ref}
        appId="codex"
        onPageStateChange={onPageStateChange}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "prompts.add" }),
    ).not.toBeInTheDocument();
    act(() => ref.current?.openAdd());
    expect(screen.getByTestId("prompt-form")).toHaveTextContent("codex");
    expect(container.querySelector(".prompt-editor-page")).toBeInTheDocument();
    expect(onPageStateChange).toHaveBeenLastCalledWith({ mode: "create" });
    expect(usePromptActionsMock).toHaveBeenLastCalledWith("codex");

    fireEvent.click(screen.getByText("cancel-form"));
    expect(screen.queryByTestId("prompt-form")).not.toBeInTheDocument();
  });

  it.each([
    ["cancel-form", false],
    ["save-form", true],
  ])(
    "closes a parent-controlled create page after %s",
    async (action, expectsSave) => {
      const user = userEvent.setup();

      function ControlledPromptPanel() {
        const [pageState, setPageState] = useState<PromptPageState>({
          mode: "create",
        });
        return (
          <PromptPanel
            appId="codex"
            requestedMode={pageState.mode}
            onPageStateChange={setPageState}
          />
        );
      }

      render(<ControlledPromptPanel />);
      expect(await screen.findByTestId("prompt-form")).toBeInTheDocument();
      await user.click(screen.getByText(action));

      await waitFor(() =>
        expect(screen.queryByTestId("prompt-form")).not.toBeInTheDocument(),
      );
      if (expectsSave) {
        expect(promptActions.savePrompt).toHaveBeenCalledWith(
          "saved-prompt",
          expect.objectContaining({ name: "Saved Prompt" }),
        );
      }
    },
  );

  it("keeps enabled prompts visible but disables deletion", () => {
    usePromptActionsMock.mockReturnValue({
      ...promptActions,
      prompts: {
        enabled: {
          id: "enabled",
          name: "Enabled Prompt",
          content: "Content",
          enabled: true,
        },
      },
    });

    render(<PromptPanel appId="codex" />);
    expect(
      screen.getByRole("button", { name: "common.delete" }),
    ).toBeDisabled();
  });

  it("exposes import from the overflow menu", async () => {
    const user = userEvent.setup();
    render(<PromptPanel appId="pi" />);
    const trigger = screen.getByRole("button", { name: "common.moreActions" });
    await user.click(trigger);
    await waitFor(() => {
      expect(screen.getByText("prompts.import")).toBeInTheDocument();
    });
    await user.click(screen.getByText("prompts.import"));
    expect(promptActions.importFromFile).toHaveBeenCalled();
  });
});
