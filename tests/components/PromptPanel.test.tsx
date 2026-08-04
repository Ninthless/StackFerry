import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
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

vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: any) => (
    <div data-testid={`prompt-app-${value}`}>
      {children}
      <button type="button" onClick={() => onValueChange("codex")}>
        choose-codex
      </button>
    </div>
  ),
  SelectTrigger: ({ children, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => (
    <div data-value={value}>{children}</div>
  ),
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

function PromptHarness({ routeApp }: { routeApp: AppId }) {
  const [promptApp, setPromptApp] = useState<AppId>("claude");
  return (
    <>
      <span data-testid="route-app">{routeApp}</span>
      <PromptPanel
        key={promptApp}
        open
        onOpenChange={() => {}}
        appId={promptApp}
        availableApps={["claude", "codex", "pi"]}
        onAppChange={setPromptApp}
      />
    </>
  );
}

describe("PromptPanel", () => {
  beforeEach(() => {
    usePromptActionsMock.mockReset();
    usePromptActionsMock.mockReturnValue(promptActions);
    promptActions.reload.mockReset();
  });

  it("uses its own application and resets the form when it changes", () => {
    render(<PromptHarness routeApp="pi" />);

    expect(screen.getByTestId("route-app")).toHaveTextContent("pi");
    expect(screen.getByTestId("prompt-app-claude")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "prompts.add" }));
    expect(screen.getByTestId("prompt-form")).toHaveTextContent("claude");

    fireEvent.click(screen.getByRole("button", { name: "choose-codex" }));

    expect(screen.getByTestId("prompt-app-codex")).toBeInTheDocument();
    expect(screen.queryByTestId("prompt-form")).not.toBeInTheDocument();
    expect(usePromptActionsMock).toHaveBeenLastCalledWith("codex");
    expect(screen.getByTestId("route-app")).toHaveTextContent("pi");
  });
});
