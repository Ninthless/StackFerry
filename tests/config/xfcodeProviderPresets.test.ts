import { describe, expect, it } from "vitest";
import { providerPresets } from "@/config/claudeProviderPresets";
import { claudeDesktopProviderPresets } from "@/config/claudeDesktopProviderPresets";
import { codexProviderPresets } from "@/config/codexProviderPresets";
import { geminiProviderPresets } from "@/config/geminiProviderPresets";
import { grokBuildProviderPresets } from "@/config/grokBuildProviderPresets";
import { hermesProviderPresets } from "@/config/hermesProviderPresets";
import { openclawProviderPresets } from "@/config/openclawProviderPresets";
import { opencodeProviderPresets } from "@/config/opencodeProviderPresets";
import { piProviderPresets } from "@/config/piProviderPresets";
import { XFCODE_PROVIDER } from "@/config/xfcodeProvider";
import { hasIcon } from "@/icons/extracted";
import {
  extractCodexBaseUrl,
  extractCodexModelName,
} from "@/utils/providerConfigUtils";

const findPreset = <T extends { name: string; icon?: string }>(
  presets: T[],
): T => {
  const preset = presets.find((item) => item.name === XFCODE_PROVIDER.name);
  expect(preset).toBeDefined();
  expect(preset?.icon).toBe(XFCODE_PROVIDER.icon);
  return preset as T;
};

describe("XFcode provider presets", () => {
  it("uses the verified public provider contract", () => {
    expect(XFCODE_PROVIDER).toMatchObject({
      name: "XFcode API",
      icon: "xfcode",
      websiteUrl: "https://www.orangecc.cc/home",
      apiKeyUrl: "https://www.orangecc.cc/home",
      apiBaseUrl: "https://api.orangecc.cc",
      openAiBaseUrl: "https://api.orangecc.cc/v1",
    });
    expect(hasIcon(XFCODE_PROVIDER.icon)).toBe(true);
  });

  it("configures every independently maintained application", () => {
    const claude = findPreset(providerPresets);
    const claudeEnv = (claude.settingsConfig as { env: Record<string, string> })
      .env;
    expect(claudeEnv).toMatchObject({
      ANTHROPIC_BASE_URL: XFCODE_PROVIDER.apiBaseUrl,
      ANTHROPIC_AUTH_TOKEN: "",
      ANTHROPIC_MODEL: XFCODE_PROVIDER.models.claudeSonnet,
    });

    const claudeDesktop = findPreset(claudeDesktopProviderPresets);
    expect(claudeDesktop).toMatchObject({
      baseUrl: XFCODE_PROVIDER.apiBaseUrl,
      mode: "direct",
      apiFormat: "anthropic",
    });

    const codex = findPreset(codexProviderPresets);
    expect(codex.auth).toEqual({ OPENAI_API_KEY: "" });
    expect(extractCodexBaseUrl(codex.config)).toBe(
      XFCODE_PROVIDER.openAiBaseUrl,
    );
    expect(extractCodexModelName(codex.config)).toBe(
      XFCODE_PROVIDER.models.openAi,
    );
    expect(codex.apiFormat).toBe("openai_responses");

    const gemini = findPreset(geminiProviderPresets);
    expect(gemini).toMatchObject({
      baseURL: XFCODE_PROVIDER.apiBaseUrl,
      model: XFCODE_PROVIDER.models.gemini,
    });

    const grokBuild = findPreset(grokBuildProviderPresets);
    expect(grokBuild.auth).toEqual({ OPENAI_API_KEY: "" });
    expect(extractCodexBaseUrl(grokBuild.config)).toBe(
      XFCODE_PROVIDER.openAiBaseUrl,
    );
    expect(grokBuild.apiFormat).toBe("openai_responses");

    const opencode = findPreset(opencodeProviderPresets);
    expect(opencode.settingsConfig).toMatchObject({
      npm: "@ai-sdk/openai-compatible",
      options: { baseURL: XFCODE_PROVIDER.openAiBaseUrl, apiKey: "" },
    });
    expect(opencode.settingsConfig.models).toHaveProperty(
      XFCODE_PROVIDER.models.openAi,
    );

    const openclaw = findPreset(openclawProviderPresets);
    expect(openclaw.settingsConfig).toMatchObject({
      baseUrl: XFCODE_PROVIDER.openAiBaseUrl,
      apiKey: "",
      api: "openai-responses",
    });

    const hermes = findPreset(hermesProviderPresets);
    expect(hermes.settingsConfig).toMatchObject({
      name: XFCODE_PROVIDER.providerKey,
      base_url: XFCODE_PROVIDER.openAiBaseUrl,
      api_key: "",
      api_mode: "codex_responses",
    });
  });

  it("derives a Pi preset from the OpenCode contract", () => {
    const pi = piProviderPresets.find(
      (preset) => preset.providerKey === "xfcode-api",
    );

    expect(pi).toBeDefined();
    expect(pi?.icon).toBe(XFCODE_PROVIDER.icon);
    expect(pi?.settingsConfig).toMatchObject({
      baseUrl: XFCODE_PROVIDER.openAiBaseUrl,
      api: "openai-completions",
      apiKey: "",
      authHeader: true,
      defaultModel: XFCODE_PROVIDER.models.openAi,
    });
  });
});
