import { describe, expect, it } from "vitest";
import {
  PI_USER_AGENT,
  piProviderPresets,
  withPiDefaultHeaders,
} from "@/features/providers/config/piProviderPresets";

describe("Pi provider presets", () => {
  it("provides valid custom-provider contracts", () => {
    expect(piProviderPresets.length).toBeGreaterThan(4);

    for (const preset of piProviderPresets) {
      expect(preset.providerKey).toMatch(/^[a-z0-9][a-z0-9._-]*$/);
      expect(preset.settingsConfig.baseUrl).toMatch(/^https?:\/\//);
      expect(preset.settingsConfig.models.length).toBeGreaterThan(0);
      expect(preset.settingsConfig.defaultModel).toBe(
        preset.settingsConfig.models[0].id,
      );
      expect(preset.settingsConfig.headers?.["User-Agent"]).toBe(PI_USER_AGENT);
    }
  });

  it("keeps provider keys unique", () => {
    const keys = piProviderPresets.map((preset) => preset.providerKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("preserves explicitly configured user agents", () => {
    expect(withPiDefaultHeaders({ "user-agent": "CustomClient/1.0" })).toEqual({
      "user-agent": "CustomClient/1.0",
    });
  });

  it("includes local provider presets from the Pi contract", () => {
    const ollama = piProviderPresets.find(
      (preset) => preset.providerKey === "ollama",
    );
    const lmStudio = piProviderPresets.find(
      (preset) => preset.providerKey === "lm-studio",
    );

    expect(ollama?.settingsConfig).toMatchObject({
      baseUrl: "http://localhost:11434/v1",
      api: "openai-completions",
      apiKey: "ollama",
      authHeader: false,
    });
    expect(lmStudio?.settingsConfig).toMatchObject({
      baseUrl: "http://localhost:1234/v1",
      api: "openai-completions",
      apiKey: "lm-studio",
      authHeader: false,
    });
  });
});
