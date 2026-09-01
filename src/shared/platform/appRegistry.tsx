import type { ReactNode } from "react";
import type { AppId } from "@/platform/tauri/api/types";
import {
  ClaudeIcon,
  CodexIcon,
  GeminiIcon,
  OpenClawIcon,
  PiIcon,
} from "@/shared/ui/icons/BrandIcons";
import { ProviderIcon } from "@/shared/ui/ProviderIcon";

export interface AppConfig {
  label: string;
  icon: ReactNode;
  badgeClass: string;
}

export const APP_IDS: AppId[] = [
  "claude",
  "claude-desktop",
  "codex",
  "pi",
  "gemini",
  "grokbuild",
  "opencode",
  "openclaw",
  "hermes",
];

export type AppCapability =
  | "providers"
  | "mcp"
  | "skills"
  | "prompts"
  | "runtimeEnvironments";

const CAPABILITIES: Record<AppId, readonly AppCapability[]> = {
  claude: ["providers", "mcp", "skills", "prompts", "runtimeEnvironments"],
  "claude-desktop": ["providers"],
  codex: ["providers", "mcp", "skills", "prompts", "runtimeEnvironments"],
  pi: ["providers", "mcp", "skills", "prompts"],
  gemini: ["providers", "mcp", "skills", "prompts"],
  grokbuild: ["providers", "mcp", "skills", "prompts"],
  opencode: ["providers", "mcp", "skills", "prompts"],
  openclaw: ["providers"],
  hermes: ["providers", "mcp", "skills", "prompts"],
};

export function supportsCapability(
  app: AppId,
  capability: AppCapability,
): boolean {
  return CAPABILITIES[app].includes(capability);
}

export const PROMPT_APP_IDS = APP_IDS.filter((app) =>
  supportsCapability(app, "prompts"),
);

export const SKILLS_APP_IDS = APP_IDS.filter((app) =>
  supportsCapability(app, "skills"),
);

export const MCP_APP_IDS = APP_IDS.filter((app) =>
  supportsCapability(app, "mcp"),
);

const APP_BADGE_CLASS =
  "border border-border bg-muted text-foreground hover:bg-accent gap-1.5";

export const APP_ICON_MAP: Record<AppId, AppConfig> = {
  claude: {
    label: "Claude",
    icon: <ClaudeIcon size={14} />,
    badgeClass: APP_BADGE_CLASS,
  },
  "claude-desktop": {
    label: "Claude Desktop",
    icon: <ClaudeIcon size={14} />,
    badgeClass: APP_BADGE_CLASS,
  },
  codex: {
    label: "Codex",
    icon: <CodexIcon size={14} />,
    badgeClass: APP_BADGE_CLASS,
  },
  pi: {
    label: "Pi",
    icon: <PiIcon size={14} />,
    badgeClass: APP_BADGE_CLASS,
  },
  gemini: {
    label: "Gemini",
    icon: <GeminiIcon size={14} />,
    badgeClass: APP_BADGE_CLASS,
  },
  grokbuild: {
    label: "Grok Build",
    icon: (
      <ProviderIcon
        icon="grok"
        name="Grok Build"
        size={14}
        showFallback={false}
      />
    ),
    badgeClass: APP_BADGE_CLASS,
  },
  opencode: {
    label: "OpenCode",
    icon: (
      <ProviderIcon
        icon="opencode"
        name="OpenCode"
        size={14}
        showFallback={false}
      />
    ),
    badgeClass: APP_BADGE_CLASS,
  },
  openclaw: {
    label: "OpenClaw",
    icon: <OpenClawIcon size={14} />,
    badgeClass: APP_BADGE_CLASS,
  },
  hermes: {
    label: "Hermes",
    icon: (
      <ProviderIcon
        icon="hermes"
        name="Hermes"
        size={14}
        showFallback={false}
      />
    ),
    badgeClass: APP_BADGE_CLASS,
  },
};
