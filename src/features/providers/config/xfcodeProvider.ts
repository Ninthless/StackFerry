import type { CodexCatalogModel } from "@/shared/contracts";

const codexModels = [
  { model: "gpt-5.6-sol", displayName: "GPT-5.6 Sol", contextWindow: 272000 },
  {
    model: "gpt-5.6-terra",
    displayName: "GPT-5.6 Terra",
    contextWindow: 272000,
  },
  {
    model: "gpt-5.6-luna",
    displayName: "GPT-5.6 Luna",
    contextWindow: 272000,
  },
  { model: "gpt-5.6", displayName: "GPT-5.6" },
  { model: "gpt-5.5", displayName: "GPT-5.5", contextWindow: 272000 },
  {
    model: "gpt-5.5-openai-compact",
    displayName: "GPT-5.5 Compact",
  },
  { model: "gpt-5.4", displayName: "GPT-5.4", contextWindow: 272000 },
  {
    model: "gpt-5.4-mini",
    displayName: "GPT-5.4 Mini",
    contextWindow: 272000,
  },
  {
    model: "gpt-5.4-openai-compact",
    displayName: "GPT-5.4 Compact",
  },
  {
    model: "gpt-5.3-codex-spark",
    displayName: "GPT-5.3 Codex Spark",
  },
  {
    model: "codex-auto-review",
    displayName: "Codex Auto Review",
    contextWindow: 272000,
  },
] satisfies CodexCatalogModel[];

export const XFCODE_PROVIDER = {
  name: "XFcode API",
  icon: "xfcode",
  providerKey: "xfcode",
  websiteUrl: "https://www.orangecc.cc/home",
  apiKeyUrl: "https://www.orangecc.cc/home",
  apiBaseUrl: "https://api.orangecc.cc",
  openAiBaseUrl: "https://api.orangecc.cc/v1",
  codexModels,
  models: {
    claudeHaiku: "claude-haiku-4-5-20251001",
    claudeSonnet: "claude-sonnet-5",
    claudeOpus: "claude-opus-5",
    openAi: "gpt-5.6-sol",
    gemini: "gemini-3.6-flash",
  },
} as const;

export function upgradeLegacyXfcodeCodexCatalog(
  models: CodexCatalogModel[],
  baseUrl: string | undefined,
): CodexCatalogModel[] {
  const normalizedBaseUrl = (baseUrl ?? "")
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase();
  const xfcodeBaseUrl = XFCODE_PROVIDER.openAiBaseUrl.toLowerCase();
  const onlyModel = models[0];
  const isLegacyCatalog =
    normalizedBaseUrl === xfcodeBaseUrl &&
    models.length === 1 &&
    onlyModel?.model.trim().toLowerCase() === XFCODE_PROVIDER.models.openAi &&
    Object.keys(onlyModel).length === 1;

  return isLegacyCatalog
    ? XFCODE_PROVIDER.codexModels.map((model) => ({ ...model }))
    : models;
}
