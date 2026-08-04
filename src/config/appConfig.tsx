import React from "react";
import type { AppId } from "@/lib/api/types";
import {
  ClaudeIcon,
  CodexIcon,
  GeminiIcon,
  OpenClawIcon,
  PiIcon,
} from "@/components/BrandIcons";
import { ProviderIcon } from "@/components/ProviderIcon";

export interface AppConfig {
  label: string;
  icon: React.ReactNode;
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

export const PROMPT_APP_IDS: AppId[] = APP_IDS.filter(
  (app) => app !== "claude-desktop",
);

/** App IDs shown in Skills panels (excludes OpenClaw — it doesn't support Skills) */
export const SKILLS_APP_IDS: AppId[] = [
  "claude",
  "codex",
  "pi",
  "gemini",
  "grokbuild",
  "opencode",
  "hermes",
];

/** App IDs shown in MCP panels (excludes OpenClaw) */
export const MCP_APP_IDS: AppId[] = [
  "claude",
  "codex",
  "pi",
  "gemini",
  "grokbuild",
  "opencode",
  "hermes",
];

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
