import { describe, expect, it } from "vitest";
import { codexProviderPresets } from "./codexProviderPresets";
import {
  XFCODE_PROVIDER,
  upgradeLegacyXfcodeCodexCatalog,
} from "./xfcodeProvider";

describe("XFcode Codex configuration", () => {
  it("expands the untouched legacy single-model catalog", () => {
    const models = upgradeLegacyXfcodeCodexCatalog(
      [{ model: "gpt-5.6-sol" }],
      `${XFCODE_PROVIDER.openAiBaseUrl}/`,
    );

    expect(models).toEqual(XFCODE_PROVIDER.codexModels);
    expect(models).toHaveLength(11);
  });

  it("preserves an explicitly customized single-model catalog", () => {
    const models = [{ model: "gpt-5.6-sol", displayName: "Only Sol" }];

    expect(
      upgradeLegacyXfcodeCodexCatalog(models, XFCODE_PROVIDER.openAiBaseUrl),
    ).toBe(models);
  });

  it("publishes every XFcode text model in the preset", () => {
    const preset = codexProviderPresets.find(
      (item) => item.name === XFCODE_PROVIDER.name,
    );

    expect(preset?.modelCatalog?.map((item) => item.model)).toEqual(
      XFCODE_PROVIDER.codexModels.map((item) => item.model),
    );
    expect(
      preset?.modelCatalog?.some((item) => item.model.startsWith("gpt-image")),
    ).toBe(false);
    expect(preset?.config).toContain('model_reasoning_effort = "low"');
  });
});

describe("Codex third-party presets", () => {
  it("use live search and custom actor authentication", () => {
    const presets = codexProviderPresets.filter((preset) => !preset.isOfficial);

    expect(presets.length).toBeGreaterThan(0);
    for (const preset of presets) {
      expect(preset.config).toContain('web_search = "live"');
      expect(preset.config).toContain("requires_openai_auth = false");
      expect(preset.config).toContain(
        'http_headers = { "x-openai-actor-authorization" = "custom" }',
      );
    }
  });
});
