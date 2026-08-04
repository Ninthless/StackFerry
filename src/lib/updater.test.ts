import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_VERSION } from "./appVersion";
import { checkForUpdate, getCurrentVersion } from "./updater";

const { checkMock, getVersionMock } = vi.hoisted(() => ({
  checkMock: vi.fn(),
  getVersionMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: getVersionMock,
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: checkMock,
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
    checkMock.mockResolvedValue({
      version: "3.20.0",
      body: "Release notes",
      date: "2026-07-30T00:00:00Z",
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
    });
  });

  it("reports updater failures", async () => {
    checkMock.mockRejectedValue(new Error("updater unavailable"));

    await expect(checkForUpdate()).rejects.toThrow("updater unavailable");
  });
});

describe("getCurrentVersion", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the desktop runtime version", async () => {
    getVersionMock.mockResolvedValue("0.1.2");

    await expect(getCurrentVersion()).resolves.toBe("0.1.2");
  });

  it("falls back to the build version outside Tauri", async () => {
    getVersionMock.mockRejectedValue(new Error("Tauri unavailable"));

    await expect(getCurrentVersion()).resolves.toBe(APP_VERSION);
  });
});
