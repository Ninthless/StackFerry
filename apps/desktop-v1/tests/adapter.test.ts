import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ClaudeAdapter } from "../src/main/agents/claude";
import { CodexAdapter } from "../src/main/agents/codex";
import {
  assertTrustedPath,
  createProjectTrust,
} from "../src/main/agents/fileTransaction";
import type { McpServer } from "../src/shared/contracts";

const temporaryDirectories: string[] = [];
const fixtureDirectory = path.resolve("tests", "fixtures", "codex");

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("agent adapter transactions", () => {
  it("plans, applies, verifies, and rolls back a byte-preserving Codex edit", async () => {
    const directory = await createDirectory();
    const configPath = path.join(directory, "config.toml");
    const source = await readFile(path.join(fixtureDirectory, "config.toml"), "utf8");
    const expected = await readFile(
      path.join(fixtureDirectory, "expected.toml"),
      "utf8",
    );
    await writeFile(configPath, source);
    const adapter = new CodexAdapter(configPath);
    const plan = await adapter.planChanges(servers());

    expect(plan.changes[0].before).toBe(source);
    expect(plan.changes[0].after).toBe(expected);
    const applied = await adapter.applyAtomically(plan);
    await adapter.verify(applied);
    expect(await readFile(configPath, "utf8")).toBe(expected);
    await adapter.rollback(applied);
    expect(await readFile(configPath, "utf8")).toBe(source);
  });

  it("aborts when the live configuration changed after preview", async () => {
    const directory = await createDirectory();
    const configPath = path.join(directory, "config.toml");
    await writeFile(configPath, 'model = "gpt-5.6"\n');
    const adapter = new CodexAdapter(configPath);
    const plan = await adapter.planChanges(servers());
    await writeFile(configPath, 'model = "changed-externally"\n');

    expect(await captureError(() => adapter.applyAtomically(plan))).toContain(
      "changed after preview",
    );
    expect(await readFile(configPath, "utf8")).toBe(
      'model = "changed-externally"\n',
    );
  });

  it("preserves Claude JSONC while replacing user MCP servers", async () => {
    const directory = await createDirectory();
    const configPath = path.join(directory, ".claude.json");
    const source = `{
  // owned by Claude Code
  "theme": "dark",
  "mcpServers": {
    "old": { "command": "old" }
  }
}
`;
    await writeFile(configPath, source);
    const adapter = new ClaudeAdapter(configPath);
    const desired = claudeServers();
    const plan = await adapter.planChanges(desired);

    expect(plan.changes[0].after).toContain("// owned by Claude Code");
    expect(plan.changes[0].after).toContain('"theme": "dark"');
    const applied = await adapter.applyAtomically(plan);
    await adapter.verify(applied);
    expect(await adapter.readMcpServers()).toEqual(
      desired.map((server) => ({
        ...server,
        resourceId: `claude:user:${server.id}`,
        ownership: "discovered",
      })),
    );
    await adapter.rollback(applied);
    expect(await readFile(configPath, "utf8")).toBe(source);
  });

  it("creates and rolls back a trusted Claude project MCP file", async () => {
    const projectRoot = await createDirectory();
    const configPath = path.join(projectRoot, ".mcp.json");
    const trust = await createProjectTrust(projectRoot);
    const context = { scope: "project" as const, projectRoot, trust };
    const adapter = new ClaudeAdapter(path.join(projectRoot, ".claude.json"));
    const plan = await adapter.planChanges(claudeServers(), context);

    const applied = await adapter.applyAtomically(plan);
    await adapter.verify(applied);
    expect(
      await adapter.readMcpServers(context),
    ).toHaveLength(2);
    await adapter.rollback(applied);
    expect(
      await readFile(configPath, "utf8").catch(
        (error: NodeJS.ErrnoException) => error.code,
      ),
    ).toBe("ENOENT");
  });

  it("requires explicit trust for Claude project MCP", async () => {
    const projectRoot = await createDirectory();
    const adapter = new ClaudeAdapter(path.join(projectRoot, ".claude.json"));
    expect(
      await captureError(() =>
        adapter.planChanges(claudeServers(), {
          scope: "project",
          projectRoot,
        }),
      ),
    ).toContain("explicit trust");
  });

  it("creates and rolls back trusted Codex project MCP configuration", async () => {
    const projectRoot = await createDirectory();
    const trust = await createProjectTrust(projectRoot);
    const context = { scope: "project" as const, projectRoot, trust };
    const adapter = new CodexAdapter(path.join(projectRoot, "user.toml"));
    const plan = await adapter.planChanges(servers(), context);
    const projectConfig = path.join(projectRoot, ".codex", "config.toml");

    const applied = await adapter.applyAtomically(plan);
    await adapter.verify(applied);
    expect(await readFile(projectConfig, "utf8")).toContain(
      "[mcp_servers.context7]",
    );
    expect(await adapter.readMcpServers(context)).toHaveLength(2);
    await adapter.rollback(applied);
    expect(
      await readFile(projectConfig, "utf8").catch(
        (error: NodeJS.ErrnoException) => error.code,
      ),
    ).toBe("ENOENT");
  });

  it("plans, applies, verifies, and rolls back Claude and Codex prompts", async () => {
    const directory = await createDirectory();
    const claudeConfig = path.join(directory, ".claude.json");
    const codexConfig = path.join(directory, "config.toml");
    await writeFile(claudeConfig, "{}");
    await writeFile(codexConfig, "");
    const claude = new ClaudeAdapter(
      claudeConfig,
      undefined,
      path.join(directory, ".claude", "CLAUDE.md"),
    );
    const codex = new CodexAdapter(
      codexConfig,
      path.join(directory, ".codex", "AGENTS.md"),
    );

    for (const [adapter, sourceAgent, promptPath] of [
      [claude, "claude", path.join(directory, ".claude", "CLAUDE.md")],
      [codex, "codex", path.join(directory, ".codex", "AGENTS.md")],
    ] as const) {
      const current = await adapter.readPrompt();
      expect(current.exists).toBe(false);
      const plan = await adapter.planPromptChange({
        ...current,
        sourceAgent,
        content: "# Managed instructions\n",
        ownership: "managed",
      });
      const applied = await adapter.applyAtomically(plan);
      await adapter.verify(applied);
      expect(await readFile(promptPath, "utf8")).toBe("# Managed instructions\n");
      await adapter.rollback(applied);
      expect(
        await readFile(promptPath, "utf8").catch(
          (error: NodeJS.ErrnoException) => error.code,
        ),
      ).toBe("ENOENT");
    }
  });

  it("requires matching trust and rejects project path escapes", async () => {
    const projectRoot = await createDirectory();
    const configDirectory = path.join(projectRoot, ".codex");
    await mkdir(configDirectory);
    const configPath = path.join(configDirectory, "config.toml");
    await writeFile(configPath, "");
    const trust = await createProjectTrust(projectRoot);

    await assertTrustedPath(configPath, {
        scope: "project",
        projectRoot,
        trust,
      });
    expect(
      await captureError(() =>
        assertTrustedPath(path.join(path.dirname(projectRoot), "config.toml"), {
        scope: "project",
        projectRoot,
        trust,
        }),
      ),
    ).toContain("escapes");
  });

  it.runIf(process.platform !== "win32")(
    "rejects a project configuration symlink",
    async () => {
      const projectRoot = await createDirectory();
      const targetPath = path.join(projectRoot, "target.toml");
      const configPath = path.join(projectRoot, "config.toml");
      await writeFile(targetPath, "");
      await symlink(targetPath, configPath);
      const trust = await createProjectTrust(projectRoot);
      expect(
        await captureError(() =>
          assertTrustedPath(configPath, {
          scope: "project",
          projectRoot,
          trust,
          }),
        ),
      ).toContain("symbolic link");
    },
  );
});

async function captureError(operation: () => Promise<unknown>): Promise<string> {
  try {
    await operation();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function createDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sf-v1-adapter-"));
  temporaryDirectories.push(directory);
  return directory;
}

function servers(): McpServer[] {
  return [
    {
      id: "context7",
      resourceId: "codex:context7",
      name: "context7",
      sourceAgent: "codex",
      ownership: "managed",
      transport: {
        type: "http",
        url: "https://mcp.context7.com/mcp",
        headers: {},
      },
    },
    {
      id: "local",
      resourceId: "codex:local",
      name: "local",
      sourceAgent: "codex",
      ownership: "managed",
      transport: {
        type: "stdio",
        command: "npx",
        args: ["-y", "@example/mcp"],
        cwd: null,
        env: {},
      },
    },
  ];
}

function claudeServers(): McpServer[] {
  return [
    {
      id: "local",
      resourceId: "claude:user:local",
      name: "local",
      sourceAgent: "claude",
      ownership: "managed",
      transport: {
        type: "stdio",
        command: "npx",
        args: ["-y", "@example/mcp"],
        cwd: null,
        env: { TOKEN: "secret" },
      },
    },
    {
      id: "remote",
      resourceId: "claude:user:remote",
      name: "remote",
      sourceAgent: "claude",
      ownership: "managed",
      transport: {
        type: "http",
        url: "https://mcp.example.com",
        headers: { Authorization: "Bearer token" },
      },
    },
  ];
}
