import Database from "better-sqlite3";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DatabaseConnection } from "../src/main/database/connection";
import { LegacyImporter } from "../src/main/legacyImport";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("LegacyImporter", () => {
  it("scans read-only legacy data and imports selected assets idempotently", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "sf-v1-legacy-"));
    directories.push(root);
    const legacyPath = path.join(root, "stackferry.db");
    const legacy = new Database(legacyPath);
    legacy.exec(`
      CREATE TABLE mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        server_config TEXT NOT NULL,
        enabled_codex INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO mcp_servers (id, name, server_config, enabled_codex)
      VALUES ('context7', 'Context7', '{"url":"https://example.com/mcp"}', 1);
    `);
    legacy.close();
    await writeFile(path.join(root, "settings.json"), '{"visibleApps":{"codex":true}}');

    const connection = new DatabaseConnection(":memory:");
    const importer = new LegacyImporter(connection, root);
    const scan = await importer.scan();
    const mcp = scan.candidates.find((candidate) => candidate.kind === "mcp");
    expect(mcp).toBeDefined();

    const preview = importer.preview(scan, [mcp!.id]);
    expect(preview.items[0].action).toBe("create");
    const result = importer.import(scan, preview);
    expect(result.imported).toBe(1);

    const repeated = importer.preview(scan, [mcp!.id]);
    expect(repeated.items[0].action).toBe("skip");
    expect(importer.import(scan, repeated).skipped).toBe(1);
    connection.close();
  });

  it("does not touch the legacy database during scan", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "sf-v1-legacy-"));
    directories.push(root);
    const legacyPath = path.join(root, "stackferry.db");
    const legacy = new Database(legacyPath);
    legacy.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)");
    legacy.prepare("INSERT INTO settings VALUES (?, ?)").run("theme", "dark");
    legacy.close();
    const before = new Database(legacyPath, { readonly: true });
    const beforeJournal = before.pragma("journal_mode", { simple: true });
    before.close();

    const connection = new DatabaseConnection(":memory:");
    await new LegacyImporter(connection, root).scan();
    const after = new Database(legacyPath, { readonly: true });
    expect(after.prepare("SELECT value FROM settings WHERE key = ?").get("theme")).toEqual({
      value: "dark",
    });
    expect(after.pragma("journal_mode", { simple: true })).toBe(beforeJournal);
    after.close();
    connection.close();
  });
});
