import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePromptActions } from "@/hooks/usePromptActions";

const promptsApiMock = vi.hoisted(() => ({
  getPrompts: vi.fn(),
  upsertPrompt: vi.fn(),
  deletePrompt: vi.fn(),
  enablePrompt: vi.fn(),
  importFromFile: vi.fn(),
  getCurrentFileContent: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ promptsApi: promptsApiMock }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const prompt = {
  id: "prompt-1",
  name: "Prompt",
  content: "Content",
  enabled: true,
};
const disabledPrompt = { ...prompt, enabled: false };

describe("usePromptActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    promptsApiMock.getPrompts.mockResolvedValue({ "prompt-1": prompt });
    promptsApiMock.upsertPrompt.mockResolvedValue(undefined);
    promptsApiMock.deletePrompt.mockResolvedValue(undefined);
    promptsApiMock.enablePrompt.mockResolvedValue(undefined);
    promptsApiMock.importFromFile.mockResolvedValue("imported");
    promptsApiMock.getCurrentFileContent.mockResolvedValue("Current");
  });

  it("routes every operation through the Prompt application", async () => {
    const { result } = renderHook(() => usePromptActions("pi"));

    await act(async () => result.current.reload());
    await act(async () => result.current.savePrompt("prompt-1", prompt));
    promptsApiMock.getPrompts.mockResolvedValue({ "prompt-1": disabledPrompt });
    await act(async () => result.current.reload());
    await act(async () => result.current.deletePrompt("prompt-1"));
    await act(async () => result.current.enablePrompt("prompt-1"));
    await act(async () => result.current.toggleEnabled("prompt-1", false));
    await act(async () => result.current.importFromFile());
    await act(async () => result.current.getCurrentFileContent());

    expect(promptsApiMock.getPrompts).toHaveBeenCalledWith("pi");
    expect(promptsApiMock.upsertPrompt).toHaveBeenCalledWith(
      "pi",
      "prompt-1",
      expect.any(Object),
    );
    expect(promptsApiMock.deletePrompt).toHaveBeenCalledWith("pi", "prompt-1");
    expect(promptsApiMock.enablePrompt).toHaveBeenCalledWith("pi", "prompt-1");
    expect(promptsApiMock.importFromFile).toHaveBeenCalledWith("pi");
    expect(promptsApiMock.getCurrentFileContent).toHaveBeenCalledWith("pi");
  });

  it("prevents deleting the enabled prompt", async () => {
    const { result } = renderHook(() => usePromptActions("codex"));
    await act(async () => result.current.reload());
    await act(async () => result.current.deletePrompt("prompt-1"));
    expect(promptsApiMock.deletePrompt).not.toHaveBeenCalled();
  });

  it("ignores duplicate toggles while one is pending", async () => {
    let resolveEnable: (() => void) | undefined;
    promptsApiMock.enablePrompt.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveEnable = resolve;
        }),
    );
    const { result } = renderHook(() => usePromptActions("pi"));
    await act(async () => result.current.reload());

    let firstToggle: Promise<void>;
    act(() => {
      firstToggle = result.current.toggleEnabled("prompt-1", true);
    });
    await act(async () => {
      await result.current.toggleEnabled("prompt-1", false);
    });
    expect(promptsApiMock.enablePrompt).toHaveBeenCalledTimes(1);
    expect(promptsApiMock.upsertPrompt).not.toHaveBeenCalled();

    await act(async () => {
      resolveEnable?.();
      await firstToggle!;
    });
  });
});
