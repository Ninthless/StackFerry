import { readFile } from "node:fs/promises";
import path from "node:path";
import { applyEdits, modify, parse } from "jsonc-parser";
import { getAgentDefinition } from "../../shared/capabilities";
import {
  mcpServerSchema,
  type AgentStatus,
  type McpServer,
  type PromptAsset,
} from "../../shared/contracts";
import {
  applyFilePlan,
  assertTrustedPath,
  createPlan,
  hashSource,
  rollbackFilePlan,
  verifyFilePlan,
} from "./fileTransaction";
import { homePath } from "./paths";
import type {
  AdapterChangePlan,
  AdapterContext,
  AgentAdapter,
  AgentConfigSnapshot,
  AppliedChange,
} from "./types";

type JsonRecord = Record<string, unknown>;

export class ClaudeAdapter implements AgentAdapter {
  readonly id = "claude" as const;

  constructor(
    readonly userConfigPath = homePath(".claude.json"),
    readonly projectRoot?: string,
    readonly userPromptPath = homePath(".claude", "CLAUDE.md"),
  ) {}

  async detect(): Promise<AgentStatus> {
    const installed = await readFile(this.userConfigPath, "utf8")
      .then(() => true)
      .catch(() => false);
    return {
      id: this.id,
      name: "Claude Code",
      installed,
      configPath: installed ? this.userConfigPath : null,
      version: null,
      health: installed ? "healthy" : "unavailable",
      capabilities: getAgentDefinition(this.id).capabilities,
    };
  }

  async inspectVersion(): Promise<string | null> {
    return null;
  }

  async read(context: AdapterContext = { scope: "user" }): Promise<AgentConfigSnapshot[]> {
    const configPath = this.pathFor(context);
    if (context.scope === "project") {
      await assertTrustedPath(configPath, context);
    }
    const source = await readFile(configPath, "utf8");
    return [
      {
        agentId: this.id,
        path: configPath,
        source,
        hash: hashSource(source),
      },
    ];
  }

  async readMcpServers(
    context: AdapterContext = { scope: "user" },
  ): Promise<McpServer[]> {
    const configPath = this.pathFor(context);
    if (context.scope === "project") {
      await assertTrustedPath(configPath, context);
    }
    const source = await readFile(configPath, "utf8").catch(() => "");
    if (!source.trim()) {
      return [];
    }
    const document = asRecord(parse(source));
    const table = asRecord(document?.mcpServers);
    if (!table) {
      return [];
    }
    return Object.entries(table).flatMap(([id, value]) => {
      const entry = asRecord(value);
      if (!entry) {
        return [];
      }
      const transport =
        typeof entry.url === "string"
          ? {
              type: entry.type === "sse" ? ("sse" as const) : ("http" as const),
              url: entry.url,
              headers: stringRecord(entry.headers),
            }
          : typeof entry.command === "string"
            ? {
                type: "stdio" as const,
                command: entry.command,
                args: stringArray(entry.args),
                cwd: typeof entry.cwd === "string" ? entry.cwd : null,
                env: stringRecord(entry.env),
              }
            : null;
      if (!transport) {
        return [];
      }
      const parsed = mcpServerSchema.safeParse({
        id,
        resourceId: `${this.id}:${context.scope}:${id}`,
        name: id,
        sourceAgent: this.id,
        ownership: "discovered",
        transport,
      });
      return parsed.success ? [parsed.data] : [];
    });
  }

  async readPrompt(
    context: AdapterContext = { scope: "user" },
  ): Promise<PromptAsset> {
    const promptPath = this.promptPathFor(context);
    if (context.scope === "project") {
      await assertTrustedPath(promptPath, context);
    }
    const content = await readFile(promptPath, "utf8").catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          return null;
        }
        throw error;
      },
    );
    return {
      resourceId: `${this.id}:${context.scope}:prompt`,
      sourceAgent: this.id,
      scope: context.scope,
      path: promptPath,
      content: content ?? "",
      exists: content !== null,
      ownership: "discovered",
    };
  }

  async planPromptChange(
    desired: PromptAsset,
    context: AdapterContext = { scope: "user" },
  ): Promise<AdapterChangePlan> {
    if (desired.sourceAgent !== this.id || desired.scope !== context.scope) {
      throw new Error("Claude prompt does not match the deployment target");
    }
    const current = await this.readPrompt(context);
    return createPlan(this.id, [
      {
        path: current.path,
        beforeHash: hashSource(current.content),
        before: current.content,
        after: desired.content,
        capability: "prompts",
      },
    ]);
  }

  async planChanges(
    desired: unknown,
    context: AdapterContext = { scope: "user" },
  ): Promise<AdapterChangePlan> {
    const servers = mcpServerSchema.array().parse(desired).map((server) => {
      if (server.sourceAgent !== this.id) {
        throw new Error("Claude plan contains a server owned by another agent");
      }
      return server;
    });
    const configPath = this.pathFor(context);
    if (context.scope === "project") {
      await assertTrustedPath(configPath, context);
    }
    const source = await readFile(configPath, "utf8").catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          return "";
        }
        throw error;
      },
    );
    const snapshot: AgentConfigSnapshot = {
      agentId: this.id,
      path: configPath,
      source,
      hash: hashSource(source),
    };
    const table = Object.fromEntries(
      servers.map((server) => [server.id, renderServer(server)]),
    );
    const editableSource = snapshot.source.trim() ? snapshot.source : "{}\n";
    const after = applyEdits(
      editableSource,
      modify(editableSource, ["mcpServers"], table, {
        formattingOptions: {
          insertSpaces: true,
          tabSize: 2,
          eol: snapshot.source.includes("\r\n") ? "\r\n" : "\n",
        },
      }),
    );
    return createPlan(this.id, [
      {
        path: snapshot.path,
        beforeHash: snapshot.hash,
        before: snapshot.source,
        after,
        capability: "mcp",
      },
    ]);
  }

  applyAtomically(plan: AdapterChangePlan): Promise<AppliedChange> {
    if (plan.agentId !== this.id) {
      throw new Error(`Cannot apply ${plan.agentId} plan with Claude adapter`);
    }
    return applyFilePlan(plan);
  }

  verify(applied: AppliedChange): Promise<void> {
    return verifyFilePlan(applied);
  }

  rollback(applied: AppliedChange): Promise<void> {
    return rollbackFilePlan(applied);
  }

  private pathFor(context: AdapterContext): string {
    if (context.scope === "user") {
      return this.userConfigPath;
    }
    const projectRoot = context.projectRoot ?? this.projectRoot;
    if (!projectRoot) {
      throw new Error("Claude project MCP requires a selected project");
    }
    return path.join(projectRoot, ".mcp.json");
  }

  private promptPathFor(context: AdapterContext): string {
    if (context.scope === "user") {
      return this.userPromptPath;
    }
    const projectRoot = context.projectRoot ?? this.projectRoot;
    if (!projectRoot) {
      throw new Error("Claude project prompt requires a selected project");
    }
    return path.join(projectRoot, "CLAUDE.md");
  }
}

function renderServer(server: McpServer): JsonRecord {
  if (server.transport.type === "stdio") {
    return {
      command: server.transport.command,
      args: server.transport.args,
      ...(server.transport.cwd ? { cwd: server.transport.cwd } : {}),
      ...(Object.keys(server.transport.env).length > 0
        ? { env: server.transport.env }
        : {}),
    };
  }
  return {
    type: server.transport.type,
    url: server.transport.url,
    ...(Object.keys(server.transport.headers).length > 0
      ? { headers: server.transport.headers }
      : {}),
  };
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function stringRecord(value: unknown): Record<string, string> {
  const record = asRecord(value);
  if (!record) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(record).flatMap(([key, item]) =>
      typeof item === "string" ? [[key, item]] : [],
    ),
  );
}
