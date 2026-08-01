import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkForUpdate, relaunchApp } from "./updater";

const { checkMock, getVersionMock, relaunchMock } = vi.hoisted(() => ({
  checkMock: vi.fn(),
  getVersionMock: vi.fn(),
  relaunchMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: getVersionMock,
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: checkMock,
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: relaunchMock,
}));

describe("checkForUpdate", () => {
  beforeEach(() => {
    getVersionMock.mockResolvedValue("3.19.0");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("treats a missing updater release as up to date", async () => {
    checkMock.mockResolvedValue(null);

    await expect(checkForUpdate()).resolves.toEqual({ status: "up-to-date" });
  });

  it("returns release metadata when a newer version exists", async () => {
    const downloadAndInstallMock = vi.fn().mockResolvedValue(undefined);
    checkMock.mockResolvedValue({
      version: "3.20.0",
      body: "Release notes",
      date: "2026-07-30T00:00:00Z",
      downloadAndInstall: downloadAndInstallMock,
    });

    const result = await checkForUpdate();

    expect(result).toMatchObject({
      status: "available",
      info: {
        currentVersion: "3.19.0",
        availableVersion: "3.20.0",
        notes: "Release notes",
        pubDate: "2026-07-30T00:00:00Z",
      },
      update: {
        version: "3.20.0",
        downloadAndInstall: expect.any(Function),
      },
    });
    if (result.status === "available") {
      await result.update.downloadAndInstall();
    }
    expect(downloadAndInstallMock).toHaveBeenCalledOnce();
  });

  it("reports updater failures", async () => {
    checkMock.mockRejectedValue(new Error("updater unavailable"));

    await expect(checkForUpdate()).rejects.toThrow("updater unavailable");
  });
});

describe("relaunchApp", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("relaunches through the Tauri process plugin", async () => {
    relaunchMock.mockResolvedValue(undefined);

    await relaunchApp();

    expect(relaunchMock).toHaveBeenCalledOnce();
  });
});
