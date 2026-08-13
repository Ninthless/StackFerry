import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CodexAdapter,
  isAgentOwnedRuntime,
} from "../src/main/agents/codex";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("CodexAdapter", () => {
  it("reads user MCP servers and skips Codex-owned runtimes", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "sf-v1-codex-"));
    temporaryDirectories.push(directory);
    const configPath = path.join(directory, "config.toml");
    await writeFile(
      configPath,
      `
[mcp_servers.node_repl]
type = "stdio"
command = 'C:\\Users\\user\\AppData\\Local\\OpenAI\\Codex\\runtimes\\cua_node\\hash\\bin\\node_repl.exe'

[mcp_servers.context7]
type = "http"
url = "https://mcp.context7.com/mcp"

[mcp_servers.local]
type = "stdio"
command = "npx"
args = ["-y", "@example/mcp"]
`,
      "utf8",
    );

    const adapter = new CodexAdapter(configPath);
    const servers = await adapter.readMcpServers();

    expect(servers.map((server) => server.id)).toEqual(["context7", "local"]);
    expect(servers.every((server) => server.ownership === "discovered")).toBe(
      true,
    );
  });

  it("does not classify a same-name user server as agent owned", () => {
    expect(
      isAgentOwnedRuntime("node_repl", {
        type: "stdio",
        command: "node",
        args: ["user-repl.js"],
      }),
    ).toBe(false);
  });
});
