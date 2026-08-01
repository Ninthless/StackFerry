import type { PropsWithChildren } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateProvider, useUpdate } from "./UpdateContext";

const { checkForUpdateMock, relaunchAppMock } = vi.hoisted(() => ({
  checkForUpdateMock: vi.fn(),
  relaunchAppMock: vi.fn(),
}));

vi.mock("../lib/updater", () => ({
  checkForUpdate: checkForUpdateMock,
  relaunchApp: relaunchAppMock,
}));

const wrapper = ({ children }: PropsWithChildren) => (
  <UpdateProvider>{children}</UpdateProvider>
);

function availableUpdate(downloadAndInstall: () => Promise<void>) {
  return {
    status: "available" as const,
    info: {
      currentVersion: "0.1.0",
      availableVersion: "0.2.0",
      notes: "Release notes",
      pubDate: "2026-08-02T00:00:00Z",
    },
    update: {
      version: "0.2.0",
      downloadAndInstall,
    },
  };
}

describe("UpdateProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    checkForUpdateMock.mockResolvedValue({ status: "up-to-date" });
    relaunchAppMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("downloads an available update before relaunching", async () => {
    const downloadAndInstall = vi.fn().mockResolvedValue(undefined);
    checkForUpdateMock.mockResolvedValue(availableUpdate(downloadAndInstall));
    const { result } = renderHook(() => useUpdate(), { wrapper });

    await act(async () => {
      await result.current.checkUpdate();
    });
    await act(async () => {
      await result.current.installUpdate();
    });

    expect(downloadAndInstall).toHaveBeenCalledOnce();
    expect(relaunchAppMock).toHaveBeenCalledOnce();
    expect(downloadAndInstall.mock.invocationCallOrder[0]).toBeLessThan(
      relaunchAppMock.mock.invocationCallOrder[0],
    );
    expect(result.current.isInstalling).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("rejects installation when no checked update is pending", async () => {
    const { result } = renderHook(() => useUpdate(), { wrapper });

    await expect(result.current.installUpdate()).rejects.toThrow(
      "No update is ready to install",
    );

    expect(relaunchAppMock).not.toHaveBeenCalled();
  });

  it("does not relaunch after installation fails", async () => {
    const downloadAndInstall = vi
      .fn()
      .mockRejectedValue(new Error("signature rejected"));
    checkForUpdateMock.mockResolvedValue(availableUpdate(downloadAndInstall));
    const { result } = renderHook(() => useUpdate(), { wrapper });

    await act(async () => {
      await result.current.checkUpdate();
    });
    await act(async () => {
      await expect(result.current.installUpdate()).rejects.toThrow(
        "signature rejected",
      );
    });

    expect(relaunchAppMock).not.toHaveBeenCalled();
    expect(result.current.isInstalling).toBe(false);
    expect(result.current.error).toBe("signature rejected");
  });

  it("ignores a duplicate install request while installation is running", async () => {
    let finishDownload = () => {};
    const downloadAndInstall = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishDownload = resolve;
        }),
    );
    checkForUpdateMock.mockResolvedValue(availableUpdate(downloadAndInstall));
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
    expect(downloadAndInstall).toHaveBeenCalledOnce();

    await act(async () => {
      finishDownload();
      await installPromise;
    });
    expect(relaunchAppMock).toHaveBeenCalledOnce();
  });

  it("clears a stale update after a later check fails", async () => {
    const downloadAndInstall = vi.fn().mockResolvedValue(undefined);
    checkForUpdateMock.mockResolvedValueOnce(
      availableUpdate(downloadAndInstall),
    );
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
