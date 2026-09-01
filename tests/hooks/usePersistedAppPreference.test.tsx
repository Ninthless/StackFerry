import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { usePersistedAppPreference } from "@/app/hooks/usePersistedAppPreference";
import type { AppId } from "@/platform/tauri/api/types";

const STORAGE_KEY = "stackferry.test.feature-app";

describe("usePersistedAppPreference", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("loads an allowed stored application", () => {
    window.localStorage.setItem(STORAGE_KEY, "codex");

    const { result } = renderHook(() =>
      usePersistedAppPreference(STORAGE_KEY, ["claude", "codex"]),
    );

    expect(result.current[0]).toBe("codex");
  });

  it("falls back without copying the route application", () => {
    window.localStorage.setItem(STORAGE_KEY, "openclaw");

    const { result } = renderHook(() =>
      usePersistedAppPreference(STORAGE_KEY, ["claude", "codex"]),
    );

    expect(result.current[0]).toBe("claude");
  });

  it("persists allowed changes and rejects unsupported values", () => {
    const availableApps: AppId[] = ["claude", "codex"];
    const { result } = renderHook(() =>
      usePersistedAppPreference(STORAGE_KEY, availableApps),
    );

    act(() => result.current[1]("codex"));
    expect(result.current[0]).toBe("codex");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("codex");

    act(() => result.current[1]("pi"));
    expect(result.current[0]).toBe("codex");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("codex");
  });

  it("reconciles a preference when its application becomes unavailable", async () => {
    const { result, rerender } = renderHook(
      ({ apps }: { apps: AppId[] }) =>
        usePersistedAppPreference(STORAGE_KEY, apps),
      { initialProps: { apps: ["claude", "codex"] } },
    );

    act(() => result.current[1]("codex"));
    rerender({ apps: ["pi"] });

    await waitFor(() => expect(result.current[0]).toBe("pi"));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("pi");
  });
});
