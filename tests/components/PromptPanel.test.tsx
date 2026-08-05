import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PromptPanel from "@/components/prompts/PromptPanel";
import type { AppId } from "@/lib/api/types";

const usePromptActionsMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/usePromptActions", () => ({
  usePromptActions: (app: AppId) => usePromptActionsMock(app),
}));

vi.mock("@/hooks/useTauriEvent", () => ({
  useTauriEvent: () => {},
}));

vi.mock("@/components/prompts/PromptFormPanel", () => ({
  default: ({ appId }: { appId: AppId }) => (
    <div data-testid="prompt-form">{appId}</div>
  ),
}));

const promptActions = {
  prompts: {},
  loading: false,
  reload: vi.fn(),
  savePrompt: vi.fn(),
  deletePrompt: vi.fn(),
  toggleEnabled: vi.fn(),
};

describe("PromptPanel", () => {
  beforeEach(() => {
    usePromptActionsMock.mockReset();
    usePromptActionsMock.mockReturnValue(promptActions);
    promptActions.reload.mockReset();
  });

  it("uses the application supplied by the page scope", () => {
    render(<PromptPanel appId="codex" />);

    fireEvent.click(screen.getByRole("button", { name: "prompts.add" }));
    expect(screen.getByTestId("prompt-form")).toHaveTextContent("codex");
    expect(usePromptActionsMock).toHaveBeenLastCalledWith("codex");
  });
});
