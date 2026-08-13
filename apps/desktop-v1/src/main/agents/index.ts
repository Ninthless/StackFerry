import { getAgentDefinition } from "../../shared/capabilities";
import { CodexAdapter } from "./codex";
import { ClaudeAdapter } from "./claude";
import { homePath } from "./paths";
import { StaticAgentAdapter } from "./staticAgent";
import type { AgentAdapter } from "./types";

export function createAgentAdapters(): AgentAdapter[] {
  return [
    new CodexAdapter(),
    new ClaudeAdapter(),
    new StaticAgentAdapter({
      id: "gemini",
      name: "Gemini CLI",
      configPath: homePath(".gemini"),
      capabilities: getAgentDefinition("gemini").capabilities,
    }),
    new StaticAgentAdapter({
      id: "cursor",
      name: "Cursor",
      configPath: homePath(".cursor"),
      capabilities: getAgentDefinition("cursor").capabilities,
    }),
    new StaticAgentAdapter({
      id: "opencode",
      name: "OpenCode",
      configPath: homePath(".config", "opencode"),
      capabilities: getAgentDefinition("opencode").capabilities,
    }),
    new StaticAgentAdapter({
      id: "hermes",
      name: "Hermes",
      configPath: homePath(".hermes"),
      capabilities: getAgentDefinition("hermes").capabilities,
    }),
    new StaticAgentAdapter({
      id: "pi",
      name: "Pi",
      configPath: homePath(".pi"),
      capabilities: getAgentDefinition("pi").capabilities,
    }),
  ];
}
