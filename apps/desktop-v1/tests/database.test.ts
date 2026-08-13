import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { WorkspaceDatabase } from "../src/main/database";
import { restoreDatabaseBackup } from "../src/main/database/connection";

describe("WorkspaceDatabase", () => {
  it("persists and replaces discovered MCP snapshots", () => {
    const database = new WorkspaceDatabase(":memory:");

    database.replaceDiscoveredMcpServers([
      {
        id: "first",
        resourceId: "codex:first",
        name: "First",
        sourceAgent: "codex",
        ownership: "discovered",
        transport: {
          type: "stdio",
          command: "npx",
          args: ["first"],
          cwd: null,
          env: {},
        },
      },
    ]);
    expect(database.listMcpServers().map((server) => server.id)).toEqual([
      "first",
    ]);

    database.replaceDiscoveredMcpServers([
      {
        id: "second",
        resourceId: "codex:second",
        name: "Second",
        sourceAgent: "codex",
        ownership: "discovered",
        transport: {
          type: "http",
          url: "https://example.com/mcp",
          headers: {},
        },
      },
    ]);
    expect(database.listMcpServers().map((server) => server.id)).toEqual([
      "second",
    ]);

    database.close();
  });

  it("backs up and restores a valid database", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "sf-v1-db-"));
    const databasePath = path.join(directory, "stackferry.db");
    const database = new WorkspaceDatabase(databasePath, {
      backupDirectory: path.join(directory, "backups"),
    });
    database.replaceDiscoveredMcpServers([
      {
        id: "first",
        resourceId: "codex:first",
        name: "First",
        sourceAgent: "codex",
        ownership: "discovered",
        transport: {
          type: "http",
          url: "https://example.com/first",
          headers: {},
        },
      },
    ]);
    const backupPath = database.backup();
    database.close();

    expect(backupPath).not.toBeNull();
    restoreDatabaseBackup(databasePath, backupPath!);
    const restored = new WorkspaceDatabase(databasePath);
    expect(restored.listMcpServers().map((server) => server.id)).toEqual([
      "first",
    ]);
    restored.close();
    rmSync(directory, { recursive: true, force: true });
  });
});
