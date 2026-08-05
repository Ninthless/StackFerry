import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePromptActions } from "@/hooks/usePromptActions";

const promptsApiMock = vi.hoisted(() => ({
  getPrompts: vi.fn(),
  upsertPrompt: vi.fn(),
  deletePrompt: vi.fn(),
  enablePrompt: vi.fn(),
  importFromFile: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ promptsApi: promptsApiMock }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const prompt = {
  id: "prompt-1",
  name: "Prompt",
  content: "Content",
  enabled: true,
};

describe("usePromptActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    promptsApiMock.getPrompts.mockResolvedValue({ "prompt-1": prompt });
    promptsApiMock.upsertPrompt.mockResolvedValue(undefined);
    promptsApiMock.deletePrompt.mockResolvedValue(undefined);
    promptsApiMock.enablePrompt.mockResolvedValue(undefined);
    promptsApiMock.importFromFile.mockResolvedValue("imported");
  });

  it("routes every operation through the Prompt application", async () => {
    const { result } = renderHook(() => usePromptActions("pi"));

    await act(async () => result.current.reload());
    await act(async () => result.current.savePrompt("prompt-1", prompt));
    await act(async () => result.current.deletePrompt("prompt-1"));
    await act(async () => result.current.enablePrompt("prompt-1"));
    await act(async () => result.current.toggleEnabled("prompt-1", false));
    await act(async () => result.current.importFromFile());

    expect(promptsApiMock.getPrompts).toHaveBeenCalledWith("pi");
    expect(promptsApiMock.upsertPrompt).toHaveBeenCalledWith(
      "pi",
      "prompt-1",
      expect.any(Object),
    );
    expect(promptsApiMock.deletePrompt).toHaveBeenCalledWith("pi", "prompt-1");
    expect(promptsApiMock.enablePrompt).toHaveBeenCalledWith("pi", "prompt-1");
    expect(promptsApiMock.importFromFile).toHaveBeenCalledWith("pi");
  });
});
