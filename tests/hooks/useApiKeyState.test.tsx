import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useApiKeyState } from "@/components/providers/forms/hooks/useApiKeyState";

describe("useApiKeyState", () => {
  it("shows and creates Claude API key for uncategorized edit providers", () => {
    const onConfigChange = vi.fn();
    const initialConfig = JSON.stringify({ env: {} }, null, 2);

    const { result } = renderHook(() =>
      useApiKeyState({
        initialConfig,
        onConfigChange,
        selectedPresetId: null,
        category: undefined,
        appType: "claude",
      }),
    );

    expect(result.current.showApiKey(initialConfig, true)).toBe(true);

    act(() => {
      result.current.handleApiKeyChange("sk-test");
    });

    const updated = JSON.parse(onConfigChange.mock.calls.at(-1)?.[0]);
    expect(updated.env.ANTHROPIC_AUTH_TOKEN).toBe("sk-test");
  });

  it("keeps official and cloud provider edit behavior conservative", () => {
    const initialConfig = JSON.stringify({ env: {} }, null, 2);
    const officialConfigChange = vi.fn();

    const official = renderHook(() =>
      useApiKeyState({
        initialConfig,
        onConfigChange: officialConfigChange,
        selectedPresetId: null,
        category: "official",
        appType: "claude",
      }),
    );
    expect(official.result.current.showApiKey(initialConfig, true)).toBe(false);
    act(() => {
      official.result.current.handleApiKeyChange("sk-official");
    });
    expect(officialConfigChange).not.toHaveBeenCalled();

    const cloudProviderConfigChange = vi.fn();
    const cloudProvider = renderHook(() =>
      useApiKeyState({
        initialConfig,
        onConfigChange: cloudProviderConfigChange,
        selectedPresetId: null,
        category: "cloud_provider",
        appType: "claude",
      }),
    );
    expect(cloudProvider.result.current.showApiKey(initialConfig, true)).toBe(
      false,
    );
    act(() => {
      cloudProvider.result.current.handleApiKeyChange("sk-cloud");
    });
    expect(cloudProviderConfigChange).not.toHaveBeenCalled();
  });

  it("uses the selected Claude API key field", () => {
    const onConfigChange = vi.fn();
    const initialConfig = JSON.stringify({
      env: {
        ANTHROPIC_AUTH_TOKEN: "old-token",
        ANTHROPIC_API_KEY: "selected-key",
      },
    });

    const { result } = renderHook(() =>
      useApiKeyState({
        initialConfig,
        onConfigChange,
        selectedPresetId: "custom",
        appType: "claude",
        apiKeyField: "ANTHROPIC_API_KEY",
      }),
    );

    expect(result.current.apiKey).toBe("selected-key");

    act(() => {
      result.current.handleApiKeyChange("new-key");
    });

    const updated = JSON.parse(onConfigChange.mock.calls.at(-1)?.[0]);
    expect(updated.env).toEqual({ ANTHROPIC_API_KEY: "new-key" });
  });

  it("does not display an unsaved key when env is malformed", () => {
    const onConfigChange = vi.fn();
    const initialConfig = JSON.stringify({ env: "invalid" });

    const { result } = renderHook(() =>
      useApiKeyState({
        initialConfig,
        onConfigChange,
        selectedPresetId: "custom",
        appType: "claude",
      }),
    );

    act(() => {
      result.current.handleApiKeyChange("new-key");
    });

    expect(result.current.apiKey).toBe("");
    expect(onConfigChange).not.toHaveBeenCalled();
  });
});
