import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "smol-toml";
import type { AgentStatus, McpServer, PromptAsset } from "../../shared/contracts";
import { mcpServerSchema } from "../../shared/contracts";
import { getAgentDefinition } from "../../shared/capabilities";
import { homePath } from "./paths";
import type { AgentAdapter } from "./types";
import type {
  AdapterChangePlan,
  AdapterContext,
  AgentConfigSnapshot,
  AppliedChange,
} from "./types";
import {
  applyFilePlan,
  assertTrustedPath,
  createPlan,
  hashSource,
  rollbackFilePlan,
  verifyFilePlan,
} from "./fileTransaction";

type TomlRecord = Record<string, unknown>;

export class CodexAdapter implements AgentAdapter {
  readonly id = "codex" as const;
  readonly configPath: string;

  constructor(
    configPath = homePath(".codex", "config.toml"),
    readonly userPromptPath = homePath(".codex", "AGENTS.md"),
  ) {
    this.configPath = configPath;
  }

  async detect(): Promise<AgentStatus> {
    const installed = await readFile(this.configPath, "utf8")
      .then(() => true)
      .catch(() => false);

    return {
      id: this.id,
      name: "Codex",
      installed,
      configPath: installed ? this.configPath : null,
      version: null,
      health: installed ? "healthy" : "unavailable",
      capabilities: getAgentDefinition(this.id).capabilities,
    };
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

    const document = parse(source) as TomlRecord;
    const table = asRecord(document.mcp_servers);
    if (!table) {
      return [];
    }

    return Object.entries(table).flatMap(([id, value]) => {
      const entry = asRecord(value);
      if (!entry || isAgentOwnedRuntime(id, entry)) {
        return [];
      }

      const transport =
        typeof entry.url === "string"
          ? {
              type: normalizeRemoteType(entry.type),
              url: entry.url,
              headers: stringRecord(entry.http_headers ?? entry.headers),
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
      throw new Error("Codex prompt does not match the deployment target");
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

  async inspectVersion(): Promise<string | null> {
    return null;
  }

  async read(context: AdapterContext = { scope: "user" }): Promise<AgentConfigSnapshot[]> {
    const configPath = this.pathFor(context);
    await assertTrustedPath(configPath, context);
    const source = await readFile(configPath, "utf8").catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          return "";
        }
        throw error;
      },
    );
    return [
      {
        agentId: this.id,
        path: configPath,
        source,
        hash: hashSource(source),
      },
    ];
  }

  async planChanges(
    desired: unknown,
    context: AdapterContext = { scope: "user" },
  ): Promise<AdapterChangePlan> {
    const servers = desiredServers(desired);
    const [snapshot] = await this.read(context);
    const after = patchMcpServers(snapshot.source, servers);
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
      throw new Error(`Cannot apply ${plan.agentId} plan with Codex adapter`);
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
      return this.configPath;
    }
    if (!context.projectRoot) {
      throw new Error("Codex project MCP requires a selected project");
    }
    return path.join(context.projectRoot, ".codex", "config.toml");
  }

  private promptPathFor(context: AdapterContext): string {
    if (context.scope === "user") {
      return this.userPromptPath;
    }
    if (!context.projectRoot) {
      throw new Error("Codex project prompt requires a selected project");
    }
    return path.join(context.projectRoot, "AGENTS.md");
  }
}

function asRecord(value: unknown): TomlRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as TomlRecord)
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

function normalizeRemoteType(value: unknown): "http" | "sse" {
  return value === "sse" ? "sse" : "http";
}

export function isAgentOwnedRuntime(
  id: string,
  entry: TomlRecord,
): boolean {
  const command =
    typeof entry.command === "string"
      ? entry.command.replaceAll("\\", "/").toLowerCase()
      : "";
  const env = asRecord(entry.env);
  const runtimeCommand =
    command.includes("/codex/runtimes/") &&
    (command.endsWith("/node_repl") || command.endsWith("/node_repl.exe"));
  const runtimeEnvironment =
    env?.NODE_REPL_NODE_PATH !== undefined ||
    env?.NODE_REPL_NODE_MODULE_DIRS !== undefined ||
    env?.SKY_CUA_NATIVE_PIPE !== undefined;

  return runtimeCommand || (id.toLowerCase() === "node_repl" && runtimeEnvironment);
}

function desiredServers(value: unknown): McpServer[] {
  if (!Array.isArray(value)) {
    throw new Error("Codex MCP changes require an array of servers");
  }
  return value.map((server) => {
    const parsed = mcpServerSchema.parse(server);
    if (parsed.sourceAgent !== "codex") {
      throw new Error("Codex plan contains a server owned by another agent");
    }
    return parsed;
  });
}

function patchMcpServers(source: string, servers: McpServer[]): string {
  const lines = source.split(/\r?\n/);
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const ranges: Array<{ start: number; end: number }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\[mcp_servers(?:\.|])/.test(lines[index].trim())) {
      continue;
    }
    const start = index;
    index += 1;
    while (index < lines.length && !/^\[.+]$/.test(lines[index].trim())) {
      index += 1;
    }
    ranges.push({ start, end: index });
    index -= 1;
  }
  const first = ranges.at(0)?.start ?? lines.length;
  for (const range of [...ranges].reverse()) {
    lines.splice(range.start, range.end - range.start);
  }
  const rendered = servers.flatMap(renderMcpServer);
  if (rendered.length > 0) {
    if (first > 0 && lines[first - 1]?.trim()) {
      rendered.unshift("");
    }
    lines.splice(first, 0, ...rendered);
  }
  return lines.join(newline);
}

function renderMcpServer(server: McpServer): string[] {
  const header = `[mcp_servers.${quoteTomlKey(server.id)}]`;
  if (server.transport.type === "stdio") {
    const lines = [
      header,
      `command = ${quoteToml(server.transport.command)}`,
    ];
    if (server.transport.args.length > 0) {
      lines.push(
        `args = [${server.transport.args.map(quoteToml).join(", ")}]`,
      );
    }
    if (Object.keys(server.transport.env).length > 0) {
      lines.push(
        `env = { ${Object.entries(server.transport.env)
          .map(([key, value]) => `${quoteTomlKey(key)} = ${quoteToml(value)}`)
          .join(", ")} }`,
      );
    }
    if (server.transport.cwd) {
      lines.push(`cwd = ${quoteToml(server.transport.cwd)}`);
    }
    return [...lines, ""];
  }
  return [
    header,
    `type = ${quoteToml(server.transport.type)}`,
    `url = ${quoteToml(server.transport.url)}`,
    ...(Object.keys(server.transport.headers).length === 0
      ? []
      : [
          `http_headers = { ${Object.entries(server.transport.headers)
            .map(([key, value]) => `${quoteTomlKey(key)} = ${quoteToml(value)}`)
            .join(", ")} }`,
        ]),
    "",
  ];
}

function quoteToml(value: string): string {
  return JSON.stringify(value);
}

function quoteTomlKey(value: string): string {
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : quoteToml(value);
}
