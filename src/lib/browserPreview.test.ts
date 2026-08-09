import { describe, expect, it } from "vitest";
import {
  browserPreviewSettings,
  createBrowserPreviewCommandHandler,
} from "./browserPreview";
import { APP_VERSION } from "./appVersion";

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
    expect(invoke("get_pi_mcp_adapter_status")).toMatchObject({
      state: "uninstalled",
      configuredVersion: null,
      installedVersion: null,
      canInstall: true,
      desiredServerCount: 0,
      projectedServerCount: 0,
    });
    expect(invoke("install_pi_mcp_adapter")).toMatchObject({
      installed: true,
      projected: true,
      status: {
        state: "installed",
        installedVersion: "2.19.0",
      },
    });
    expect(invoke("list_sessions")).toEqual([]);
    expect(invoke("scan_openclaw_config_health")).toEqual([]);
    expect(invoke("get_pi_live_provider_ids")).toEqual([]);
    expect(invoke("get_pi_default_provider")).toBeNull();
    expect(invoke("get_proxy_status")).toMatchObject({ running: false });
    expect(invoke("get_models_dev_sync_config")).toMatchObject({
      config: { autoSyncEnabled: false },
    });
  });

  it("returns Skills IPC contract defaults", () => {
    const invoke = createBrowserPreviewCommandHandler();
    const repo = {
      owner: "example",
      name: "skills",
      branch: "",
      enabled: true,
    };

    expect(invoke("discover_available_skills")).toEqual({
      skills: [],
      failures: [],
    });
    expect(invoke("get_skill_repos")).toEqual([]);
    expect(invoke("add_skill_repo", { repo })).toEqual({
      repo: { ...repo, branch: "main" },
      skillCount: 0,
    });
    expect(
      invoke("add_skill_repo", {
        repo: { ...repo, branch: "develop" },
      }),
    ).toEqual({
      repo: { ...repo, branch: "develop" },
      skillCount: 0,
    });
    expect(
      invoke("remove_skill_repo", { owner: repo.owner, name: repo.name }),
    ).toBe(true);
  });
  it("returns complete settings metadata", () => {
    const invoke = createBrowserPreviewCommandHandler();

    expect(invoke("get_config_dir", { app: "codex" })).toBe(
      "C:\\Preview\\codex",
    );
    expect(invoke("get_app_config_dir_override")).toBeNull();
    expect(invoke("is_portable_mode")).toBe(false);
    expect(invoke("plugin:app|version")).toBe(APP_VERSION);
  });

  it("persists provider CRUD independently for each app", () => {
    const invoke = createBrowserPreviewCommandHandler();
    const piProvider = {
      id: "ollama",
      name: "Ollama",
      settingsConfig: {
        baseUrl: "http://localhost:11434/v1",
        api: "openai-completions",
        models: [{ id: "qwen2.5-coder:7b" }],
      },
    };

    expect(
      invoke("add_provider", {
        app: "pi",
        provider: piProvider,
        addToLive: true,
      }),
    ).toBe(true);
    expect(invoke("get_providers", { app: "pi" })).toEqual({
      ollama: piProvider,
    });
    expect(invoke("get_providers", { app: "codex" })).toEqual({});
    expect(invoke("get_pi_live_provider_ids")).toEqual(["ollama"]);

    const renamedProvider = { ...piProvider, id: "local", name: "Local" };
    expect(
      invoke("update_provider", {
        app: "pi",
        provider: renamedProvider,
        originalId: "ollama",
      }),
    ).toBe(true);
    expect(invoke("get_providers", { app: "pi" })).toEqual({
      local: renamedProvider,
    });

    expect(invoke("switch_provider", { app: "pi", id: "local" })).toEqual({
      warnings: [],
    });
    expect(invoke("get_current_provider", { app: "pi" })).toBe("local");
    expect(invoke("get_pi_default_provider")).toBe("local");

    expect(invoke("delete_provider", { app: "pi", id: "local" })).toBe(true);
    expect(invoke("get_providers", { app: "pi" })).toEqual({});
    expect(invoke("get_current_provider", { app: "pi" })).toBe("");
  });

  it("persists universal providers", () => {
    const invoke = createBrowserPreviewCommandHandler();
    const provider = {
      id: "gateway",
      name: "Gateway",
      providerType: "custom",
      baseUrl: "https://api.example.com",
      apiKey: "secret",
      apps: {
        claude: true,
        "claude-desktop": true,
        codex: true,
        pi: true,
        gemini: true,
        grokbuild: true,
        opencode: true,
        openclaw: true,
        hermes: true,
      },
      models: {},
    };

    expect(invoke("upsert_universal_provider", { provider })).toBe(true);
    expect(invoke("get_universal_provider", { id: "gateway" })).toEqual(
      provider,
    );
    expect(invoke("get_universal_providers")).toEqual({ gateway: provider });
    expect(invoke("sync_universal_provider", { id: "gateway" })).toBe(true);
    expect(invoke("delete_universal_provider", { id: "gateway" })).toBe(true);
    expect(invoke("get_universal_providers")).toEqual({});
  });
});
