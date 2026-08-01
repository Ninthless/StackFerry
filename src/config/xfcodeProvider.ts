export const XFCODE_PROVIDER = {
  name: "XFcode API",
  icon: "xfcode",
  providerKey: "xfcode",
  websiteUrl: "https://www.orangecc.cc/home",
  apiKeyUrl: "https://www.orangecc.cc/home",
  apiBaseUrl: "https://api.orangecc.cc",
  openAiBaseUrl: "https://api.orangecc.cc/v1",
  models: {
    claudeHaiku: "claude-haiku-4-5-20251001",
    claudeSonnet: "claude-sonnet-5",
    claudeOpus: "claude-opus-5",
    openAi: "gpt-5.6-sol",
    gemini: "gemini-3.6-flash",
  },
} as const;
