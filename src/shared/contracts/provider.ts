export const PROVIDER_TYPES = {
  GITHUB_COPILOT: "github_copilot",
  CODEX_OAUTH: "codex_oauth",
  XAI_OAUTH: "xai_oauth",
} as const;

export const OAUTH_PROVIDER_TYPES: readonly string[] = [
  PROVIDER_TYPES.GITHUB_COPILOT,
  PROVIDER_TYPES.CODEX_OAUTH,
  PROVIDER_TYPES.XAI_OAUTH,
];

export function isOAuthProviderType(
  providerType: string | null | undefined,
): boolean {
  return providerType != null && OAUTH_PROVIDER_TYPES.includes(providerType);
}

export const TEMPLATE_TYPES = {
  CUSTOM: "custom",
  GENERAL: "general",
  NEW_API: "newapi",
  GITHUB_COPILOT: "github_copilot",
  TOKEN_PLAN: "token_plan",
  BALANCE: "balance",
  OFFICIAL_SUBSCRIPTION: "official_subscription",
} as const;

export type TemplateType = (typeof TEMPLATE_TYPES)[keyof typeof TEMPLATE_TYPES];
