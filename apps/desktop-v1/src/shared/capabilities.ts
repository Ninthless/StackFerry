import { z } from "zod";

export const agentIds = [
  "claude",
  "claude-desktop",
  "codex",
  "gemini",
  "grokbuild",
  "cursor",
  "opencode",
  "openclaw",
  "hermes",
  "pi",
] as const;

export const agentIdSchema = z.enum(agentIds);
export const capabilityIdSchema = z.enum([
  "providers",
  "profiles",
  "mcp",
  "skills",
  "prompts",
  "sessions",
  "extensions",
  "routing",
]);
export const supportLevelSchema = z.enum([
  "core",
  "managed",
  "import-only",
  "unsupported",
]);

export type AgentId = z.infer<typeof agentIdSchema>;
export type CapabilityId = z.infer<typeof capabilityIdSchema>;
export type SupportLevel = z.infer<typeof supportLevelSchema>;

export interface AgentDefinition {
  id: AgentId;
  name: string;
  capabilities: Record<CapabilityId, SupportLevel>;
}

const capabilities = (
  values: Partial<Record<CapabilityId, SupportLevel>>,
): Record<CapabilityId, SupportLevel> => ({
  providers: "unsupported",
  profiles: "unsupported",
  mcp: "unsupported",
  skills: "unsupported",
  prompts: "unsupported",
  sessions: "unsupported",
  extensions: "unsupported",
  routing: "unsupported",
  ...values,
});

export const agentRegistry = [
  {
    id: "claude",
    name: "Claude Code",
    capabilities: capabilities({
      providers: "core",
      profiles: "managed",
      mcp: "managed",
      skills: "managed",
      prompts: "managed",
      sessions: "import-only",
      routing: "core",
    }),
  },
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    capabilities: capabilities({}),
  },
  {
    id: "codex",
    name: "Codex",
    capabilities: capabilities({
      providers: "core",
      profiles: "managed",
      mcp: "managed",
      skills: "managed",
      prompts: "managed",
      sessions: "import-only",
      routing: "core",
    }),
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    capabilities: capabilities({
      providers: "import-only",
      mcp: "import-only",
      skills: "import-only",
      prompts: "import-only",
      sessions: "import-only",
      routing: "import-only",
    }),
  },
  {
    id: "grokbuild",
    name: "Grok Build",
    capabilities: capabilities({
      providers: "import-only",
      mcp: "import-only",
      skills: "import-only",
      sessions: "import-only",
      routing: "import-only",
    }),
  },
  {
    id: "cursor",
    name: "Cursor",
    capabilities: capabilities({
      mcp: "import-only",
    }),
  },
  {
    id: "opencode",
    name: "OpenCode",
    capabilities: capabilities({
      providers: "import-only",
      mcp: "import-only",
      skills: "import-only",
      sessions: "import-only",
      routing: "import-only",
    }),
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    capabilities: capabilities({
      providers: "import-only",
      skills: "import-only",
      sessions: "import-only",
      routing: "import-only",
    }),
  },
  {
    id: "hermes",
    name: "Hermes",
    capabilities: capabilities({
      providers: "import-only",
      mcp: "import-only",
      skills: "import-only",
      sessions: "import-only",
      routing: "import-only",
    }),
  },
  {
    id: "pi",
    name: "Pi",
    capabilities: capabilities({
      providers: "import-only",
      mcp: "import-only",
      skills: "import-only",
      prompts: "import-only",
      sessions: "import-only",
      extensions: "import-only",
      routing: "import-only",
    }),
  },
] as const satisfies readonly AgentDefinition[];

export function getAgentDefinition(id: AgentId): AgentDefinition {
  const definition = agentRegistry.find((agent) => agent.id === id);
  if (!definition) {
    throw new Error(`Unknown agent: ${id}`);
  }
  return definition;
}
