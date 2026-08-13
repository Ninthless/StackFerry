import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CodexAdapter } from "../src/main/agents/codex";
import type { AgentAdapter } from "../src/main/agents/types";
import { WorkspaceDatabase } from "../src/main/database";
import { WorkspaceService } from "../src/main/workspace";

describe("WorkspaceService", () => {
  it("scans installed MCP-capable agents and persists the snapshot", async () => {
    const unsupportedMethods = {
      inspectVersion: async () => null,
      read: async () => [],
      readPrompt: async () => {
        throw new Error("not implemented");
      },
      planPromptChange: async () => {
        throw new Error("not implemented");
      },
      planChanges: async () => {
        throw new Error("not implemented");
      },
      applyAtomically: async () => {
        throw new Error("not implemented");
      },
      verify: async () => {
        throw new Error("not implemented");
      },
      rollback: async () => {
        throw new Error("not implemented");
      },
    };
    const adapters: AgentAdapter[] = [
      {
        ...unsupportedMethods,
        id: "codex",
        detect: async () => ({
          id: "codex",
          name: "Codex",
          installed: true,
          configPath: "config.toml",
          version: null,
          health: "healthy",
          capabilities: {
            mcp: "managed",
          },
        }),
        readMcpServers: async () => [
          {
            id: "context7",
            resourceId: "codex:context7",
            name: "context7",
            sourceAgent: "codex",
            ownership: "discovered",
            transport: {
              type: "http",
              url: "https://example.com/mcp",
              headers: {},
            },
          },
        ],
      },
      {
        ...unsupportedMethods,
        id: "gemini",
        detect: async () => ({
          id: "gemini",
          name: "Gemini",
          installed: false,
          configPath: null,
          version: null,
          health: "unavailable",
          capabilities: {
            mcp: "managed",
          },
        }),
        readMcpServers: async () => {
          throw new Error("must not read missing agent");
        },
      },
    ];
    const database = new WorkspaceDatabase(":memory:");
    const service = new WorkspaceService(adapters, database);

    const refreshed = await service.refreshWorkspace();
    const restored = await service.getWorkspace();

    expect(refreshed.mcpServers).toHaveLength(1);
    expect(restored.mcpServers).toEqual(refreshed.mcpServers);
    database.close();
  });

  it("previews and applies a managed MCP deployment", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "sf-v1-control-"));
    const configPath = path.join(directory, "config.toml");
    await writeFile(configPath, 'model = "gpt-5.6"\n');
    const database = new WorkspaceDatabase(":memory:");
    const service = new WorkspaceService(
      [new CodexAdapter(configPath)],
      database,
    );
    const server = {
      id: "context7",
      resourceId: "codex:context7",
      name: "context7",
      sourceAgent: "codex" as const,
      ownership: "managed" as const,
      transport: {
        type: "http" as const,
        url: "https://mcp.context7.com/mcp",
      },
    };

    const preview = await service.previewMcpDeployment([server]);
    expect(await readFile(configPath, "utf8")).toBe('model = "gpt-5.6"\n');
    const result = await service.applyDeployment(preview.id);
    expect(result.status).toBe("applied");
    expect(await readFile(configPath, "utf8")).toContain(
      "[mcp_servers.context7]",
    );

    database.close();
    await rm(directory, { recursive: true, force: true });
  });
});
