import { describe, expect, it } from "vitest";
import {
  browserPreviewSettings,
  createBrowserPreviewCommandHandler,
} from "./browserPreview";

describe("browser preview IPC", () => {
  it("returns complete settings and preserves saves", () => {
    const invoke = createBrowserPreviewCommandHandler();

    expect(invoke("get_settings")).toEqual(browserPreviewSettings);
    expect(
      invoke("save_settings", {
        settings: { ...browserPreviewSettings, language: "en" },
      }),
    ).toBe(true);
    expect(invoke("get_settings")).toMatchObject({ language: "en" });
  });

  it("returns stable empty page data", () => {
    const invoke = createBrowserPreviewCommandHandler();

    expect(invoke("get_prompts", { app: "claude" })).toEqual({});
    expect(invoke("get_mcp_servers")).toEqual({});
    expect(invoke("list_sessions")).toEqual([]);
    expect(invoke("get_proxy_status")).toMatchObject({ running: false });
    expect(invoke("get_models_dev_sync_config")).toMatchObject({
      config: { autoSyncEnabled: false },
    });
  });

  it("returns complete settings metadata", () => {
    const invoke = createBrowserPreviewCommandHandler();

    expect(invoke("get_config_dir", { app: "codex" })).toBe(
      "C:\\Preview\\codex",
    );
    expect(invoke("get_app_config_dir_override")).toBeNull();
    expect(invoke("is_portable_mode")).toBe(false);
  });
});
