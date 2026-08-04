import type { PropsWithChildren } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateProvider, useUpdate } from "./UpdateContext";

const { checkForUpdateMock, installUpdateAndRestartMock } = vi.hoisted(() => ({
  checkForUpdateMock: vi.fn(),
  installUpdateAndRestartMock: vi.fn(),
}));

vi.mock("../lib/updater", () => ({
  checkForUpdate: checkForUpdateMock,
}));

vi.mock("../lib/api/settings", () => ({
  settingsApi: {
    installUpdateAndRestart: installUpdateAndRestartMock,
  },
}));

const wrapper = ({ children }: PropsWithChildren) => (
  <UpdateProvider>{children}</UpdateProvider>
);

function availableUpdate() {
  return {
    status: "available" as const,
    info: {
      currentVersion: "0.1.0",
      availableVersion: "0.2.0",
      notes: "Release notes",
      pubDate: "2026-08-02T00:00:00Z",
    },
  };
}

describe("UpdateProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    checkForUpdateMock.mockResolvedValue({ status: "up-to-date" });
    installUpdateAndRestartMock.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("delegates installation and restart to the backend", async () => {
    checkForUpdateMock.mockResolvedValue(availableUpdate());
    const { result } = renderHook(() => useUpdate(), { wrapper });

    await act(async () => {
      await result.current.checkUpdate();
    });
    await act(async () => {
      await result.current.installUpdate();
    });

    expect(installUpdateAndRestartMock).toHaveBeenCalledOnce();
    expect(result.current.isInstalling).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("rejects installation when no checked update is pending", async () => {
    const { result } = renderHook(() => useUpdate(), { wrapper });

    await expect(result.current.installUpdate()).rejects.toThrow(
      "No update is ready to install",
    );

    expect(installUpdateAndRestartMock).not.toHaveBeenCalled();
  });

  it("surfaces a backend installation failure", async () => {
    installUpdateAndRestartMock.mockRejectedValue(
      new Error("signature rejected"),
    );
    checkForUpdateMock.mockResolvedValue(availableUpdate());
    const { result } = renderHook(() => useUpdate(), { wrapper });

    await act(async () => {
      await result.current.checkUpdate();
    });
    await act(async () => {
      await expect(result.current.installUpdate()).rejects.toThrow(
        "signature rejected",
      );
    });

    expect(installUpdateAndRestartMock).toHaveBeenCalledOnce();
    expect(result.current.isInstalling).toBe(false);
    expect(result.current.error).toBe("signature rejected");
  });

  it("clears the checked update when the backend no longer finds it", async () => {
    installUpdateAndRestartMock.mockResolvedValue(false);
    checkForUpdateMock.mockResolvedValue(availableUpdate());
    const { result } = renderHook(() => useUpdate(), { wrapper });

    await act(async () => {
      await result.current.checkUpdate();
    });
    await act(async () => {
      await result.current.installUpdate();
    });

    expect(result.current.hasUpdate).toBe(false);
    expect(result.current.updateInfo).toBeNull();
    expect(result.current.isInstalling).toBe(false);
  });

  it("ignores a duplicate install request while installation is running", async () => {
    let finishInstall = () => {};
    installUpdateAndRestartMock.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          finishInstall = () => resolve(true);
        }),
    );
    checkForUpdateMock.mockResolvedValue(availableUpdate());
    const { result } = renderHook(() => useUpdate(), { wrapper });

    await act(async () => {
      await result.current.checkUpdate();
    });

    let installPromise: Promise<void> | undefined;
    act(() => {
      installPromise = result.current.installUpdate();
    });
    expect(result.current.isInstalling).toBe(true);

    await act(async () => {
      await result.current.installUpdate();
    });
    expect(installUpdateAndRestartMock).toHaveBeenCalledOnce();

    await act(async () => {
      finishInstall();
      await installPromise;
    });
  });

  it("clears a stale update after a later check fails", async () => {
    checkForUpdateMock.mockResolvedValueOnce(availableUpdate());
    const { result } = renderHook(() => useUpdate(), { wrapper });

    await act(async () => {
      await result.current.checkUpdate();
    });
    expect(result.current.hasUpdate).toBe(true);

    checkForUpdateMock.mockRejectedValueOnce(new Error("network unavailable"));
    await act(async () => {
      await expect(result.current.checkUpdate()).rejects.toThrow(
        "network unavailable",
      );
    });

    expect(result.current.hasUpdate).toBe(false);
    expect(result.current.updateInfo).toBeNull();
    await expect(result.current.installUpdate()).rejects.toThrow(
      "No update is ready to install",
    );
  });
});
