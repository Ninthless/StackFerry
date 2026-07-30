import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkForUpdate } from "./updater";

const { getVersionMock } = vi.hoisted(() => ({
  getVersionMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: getVersionMock,
}));

describe("checkForUpdate", () => {
  beforeEach(() => {
    getVersionMock.mockResolvedValue("3.19.0");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("treats a repository without releases as up to date", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    );

    await expect(checkForUpdate()).resolves.toEqual({ status: "up-to-date" });
  });

  it("returns release metadata when a newer version exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          tag_name: "v3.20.0",
          body: "Release notes",
          published_at: "2026-07-30T00:00:00Z",
        }),
      ),
    );

    await expect(checkForUpdate()).resolves.toEqual({
      status: "available",
      info: {
        currentVersion: "3.19.0",
        availableVersion: "3.20.0",
        notes: "Release notes",
        pubDate: "2026-07-30T00:00:00Z",
      },
    });
  });

  it("reports GitHub API failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );

    await expect(checkForUpdate()).rejects.toThrow(
      "GitHub release check failed: HTTP 503",
    );
  });
});
