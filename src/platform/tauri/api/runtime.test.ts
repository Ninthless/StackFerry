import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getVersion: vi.fn(),
  listen: vi.fn(),
  homeDir: vi.fn(),
  join: vi.fn(),
  getCurrentWindow: vi.fn(),
  writeErrorLog: vi.fn(),
  check: vi.fn(),
  isTauri: vi.fn(),
  mockIPC: vi.fn(),
  mockWindows: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({ getVersion: mocks.getVersion }));
vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));
vi.mock("@tauri-apps/api/path", () => ({
  homeDir: mocks.homeDir,
  join: mocks.join,
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: mocks.getCurrentWindow,
}));
vi.mock("@tauri-apps/plugin-log", () => ({ error: mocks.writeErrorLog }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: mocks.isTauri }));
vi.mock("@tauri-apps/api/mocks", () => ({
  mockIPC: mocks.mockIPC,
  mockWindows: mocks.mockWindows,
}));

import { runtimeApi } from "./runtime";

describe("runtimeApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards event payloads through the capability adapter", async () => {
    const unlisten = vi.fn();
    mocks.listen.mockImplementation(
      async (
        _eventName: string,
        handler: (event: { payload: unknown }) => void,
      ) => {
        handler({ payload: { id: "event-1" } });
        return unlisten;
      },
    );
    const handler = vi.fn();

    await expect(runtimeApi.listen("example", handler)).resolves.toBe(unlisten);
    expect(handler).toHaveBeenCalledWith({ id: "event-1" });
  });

  it("installs browser preview mocks behind the platform boundary", () => {
    const handler = vi.fn();

    runtimeApi.installPreviewMocks(handler);

    expect(mocks.mockWindows).toHaveBeenCalledWith("main");
    expect(mocks.mockIPC).toHaveBeenCalledWith(handler, {
      shouldMockEvents: true,
    });
  });
});
