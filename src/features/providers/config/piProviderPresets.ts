import type {
  OpenCodeModel,
  PiModelConfig,
  PiProviderApi,
  PiProviderConfig,
  ProviderCategory,
} from "@/shared/contracts";
import { opencodeProviderPresets } from "./opencodeProviderPresets";

export interface PiProviderPreset {
  name: string;
  nameKey?: string;
  providerKey: string;
  websiteUrl: string;
  apiKeyUrl?: string;
  settingsConfig: PiProviderConfig;
  category?: ProviderCategory;
  isPartner?: boolean;
  primePartner?: boolean;
  partnerPromotionKey?: string;
  icon?: string;
  iconColor?: string;
  isCustomTemplate?: boolean;
}

export const PI_USER_AGENT = "StackFerry";

export const withPiDefaultHeaders = (
  headers: Record<string, string> = {},
): Record<string, string> => {
  const hasUserAgent = Object.keys(headers).some(
    (name) => name.toLowerCase() === "user-agent",
  );
  if (hasUserAgent) return { ...headers };
  return { ...headers, "User-Agent": PI_USER_AGENT };
};

const slugifyProviderKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "custom";

const getPiApi = (npm: string): PiProviderApi => {
  if (npm === "@ai-sdk/anthropic") return "anthropic-messages";
  if (npm === "@ai-sdk/google") return "google-generative-ai";
  if (npm === "@ai-sdk/openai") return "openai-responses";
  return "openai-completions";
};

const getInputTypes = (model: OpenCodeModel): string[] => {
  const modalities = model.modalities;
  if (!modalities || typeof modalities !== "object") return ["text"];
  const input = (modalities as { input?: unknown }).input;
  if (!Array.isArray(input)) return ["text"];
  return input.includes("image") ? ["text", "image"] : ["text"];
};

const toPiModel = (id: string, model: OpenCodeModel): PiModelConfig => {
  const piModel: PiModelConfig = {
    id,
    name: model.name || id,
    reasoning: model.reasoning === true,
    input: getInputTypes(model),
  };
  if (model.limit?.context) piModel.contextWindow = model.limit.context;
  if (model.limit?.output) piModel.maxTokens = model.limit.output;
  return piModel;
};

const catalogPresets: PiProviderPreset[] = opencodeProviderPresets.flatMap(
  (preset) => {
    const baseUrl = preset.settingsConfig.options?.baseURL?.trim();
    const models = Object.entries(preset.settingsConfig.models ?? {}).map(
      ([id, model]) => toPiModel(id, model),
    );
    if (!baseUrl || models.length === 0) return [];
    const api = getPiApi(preset.settingsConfig.npm);
    return [
      {
        name: preset.name,
        nameKey: preset.nameKey,
        providerKey: slugifyProviderKey(
          preset.settingsConfig.name || preset.name,
        ),
        websiteUrl: preset.websiteUrl,
        apiKeyUrl: preset.apiKeyUrl,
        settingsConfig: {
          baseUrl,
          api,
          apiKey: "",
          authHeader: api !== "google-generative-ai",
          defaultModel: models[0].id,
          models,
          headers: withPiDefaultHeaders(),
        },
        category: preset.category,
        isPartner: preset.isPartner,
        primePartner: preset.primePartner,
        partnerPromotionKey: preset.partnerPromotionKey,
        icon: preset.icon,
        iconColor: preset.iconColor,
      },
    ];
  },
);

export const piProviderPresets: PiProviderPreset[] = [
  ...catalogPresets,
  {
    name: "Ollama",
    providerKey: "ollama",
    websiteUrl: "https://ollama.com",
    settingsConfig: {
      baseUrl: "http://localhost:11434/v1",
      api: "openai-completions",
      apiKey: "ollama",
      authHeader: false,
      defaultModel: "qwen2.5-coder:7b",
      models: [
        { id: "qwen2.5-coder:7b", name: "Qwen 2.5 Coder 7B" },
        { id: "llama3.1:8b", name: "Llama 3.1 8B" },
      ],
      headers: withPiDefaultHeaders(),
      compat: {
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
      },
    },
    category: "custom",
    icon: "ollama",
  },
  {
    name: "LM Studio",
    providerKey: "lm-studio",
    websiteUrl: "https://lmstudio.ai",
    settingsConfig: {
      baseUrl: "http://localhost:1234/v1",
      api: "openai-completions",
      apiKey: "lm-studio",
      authHeader: false,
      defaultModel: "local-model",
      models: [{ id: "local-model", name: "Local Model" }],
      headers: withPiDefaultHeaders(),
      compat: {
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
      },
    },
    category: "custom",
    icon: "lmstudio",
  },
];
