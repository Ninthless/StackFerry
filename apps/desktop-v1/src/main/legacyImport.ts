import { createHash, randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import {
  legacyCandidateSchema,
  legacyImportPreviewSchema,
  legacyImportResultSchema,
  legacyScanSchema,
  type LegacyAssetKind,
  type LegacyCandidate,
  type LegacyImportPreview,
  type LegacyImportResult,
  type LegacyScan,
} from "../shared/legacyImport";
import type { DatabaseConnection } from "./database/connection";

const legacyTables = [
  "providers",
  "mcp_servers",
  "prompts",
  "skills",
  "skill_repos",
] as const;

export class LegacyImporter {
  constructor(
    private readonly database: DatabaseConnection,
    private readonly legacyRoot: string,
  ) {}

  async scan(): Promise<LegacyScan> {
    const databasePath = path.join(this.legacyRoot, "stackferry.db");
    const candidates: LegacyCandidate[] = [];
    const errors: LegacyScan["errors"] = [];
    if (await exists(databasePath)) {
      try {
        this.readDatabase(databasePath, candidates);
      } catch (error) {
        errors.push({
          source: databasePath,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const settingsPath = path.join(this.legacyRoot, "settings.json");
    if (await exists(settingsPath)) {
      try {
        const source = await readFile(settingsPath, "utf8");
        candidates.push(
          createCandidate(
            "prompt",
            "legacy-settings",
            settingsPath,
            "settings",
            { settings: JSON.parse(source) as unknown },
            ["Settings are imported as a reviewable asset."],
          ),
        );
      } catch (error) {
        errors.push({
          source: settingsPath,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return legacyScanSchema.parse({
      scanId: randomUUID(),
      root: this.legacyRoot,
      databasePath: (await exists(databasePath)) ? databasePath : null,
      scannedAt: new Date().toISOString(),
      candidates,
      errors,
    });
  }

  preview(scan: LegacyScan, selectedIds: string[]): LegacyImportPreview {
    const selected = new Set(selectedIds);
    const items = scan.candidates
      .filter((candidate) => selected.has(candidate.id))
      .map((candidate) => {
        const targetId = `${candidate.kind}:${candidate.sourceKey}`;
        const existing = this.database.database
          .prepare("SELECT payload FROM assets WHERE id = ?")
          .get(targetId) as { payload: string } | undefined;
        if (!existing) {
          return {
            candidateId: candidate.id,
            action: "create" as const,
            targetId,
            reason: "No 1.0 asset has this source identity.",
          };
        }
        const existingPayload = JSON.parse(existing.payload) as {
          sourceFingerprint?: string;
        };
        return {
          candidateId: candidate.id,
          action:
            existingPayload.sourceFingerprint === candidate.sourceFingerprint
              ? ("skip" as const)
              : ("conflict" as const),
          targetId,
          reason:
            existingPayload.sourceFingerprint === candidate.sourceFingerprint
              ? "Already imported from the same legacy source."
              : "A different 1.0 asset owns this target identity.",
        };
      });
    return legacyImportPreviewSchema.parse({
      scanId: scan.scanId,
      selectedIds,
      items,
    });
  }

  import(
    scan: LegacyScan,
    preview: LegacyImportPreview,
  ): LegacyImportResult {
    if (preview.scanId !== scan.scanId) {
      throw new Error("Legacy import preview does not match the scan");
    }
    const byId = new Map(scan.candidates.map((candidate) => [candidate.id, candidate]));
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let conflicts = 0;
    const transaction = this.database.database.transaction(() => {
      for (const item of preview.items) {
        const candidate = byId.get(item.candidateId);
        if (!candidate) {
          throw new Error(`Legacy candidate not found: ${item.candidateId}`);
        }
        if (item.action === "skip") {
          skipped += 1;
          continue;
        }
        if (item.action === "conflict") {
          conflicts += 1;
          continue;
        }
        const now = new Date().toISOString();
        const payload = JSON.stringify({
          ...candidate.payload,
          sourceFingerprint: candidate.sourceFingerprint,
          sourcePath: candidate.sourcePath,
          sourceKey: candidate.sourceKey,
        });
        this.database.database
          .prepare(
            `INSERT OR REPLACE INTO assets
              (id, kind, name, ownership, payload, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM assets WHERE id = ?), ?), ?)`,
          )
          .run(
            item.targetId,
            candidate.kind,
            candidate.name,
            "managed",
            payload,
            item.targetId,
            now,
            now,
          );
        imported += 1;
      }
    });
    transaction();
    return legacyImportResultSchema.parse({
      scanId: scan.scanId,
      imported,
      updated,
      skipped,
      conflicts,
    });
  }

  private readDatabase(
    databasePath: string,
    candidates: LegacyCandidate[],
  ): void {
    const source = new Database(databasePath, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      const tables = source
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?, ?, ?, ?)",
        )
        .all(...legacyTables) as Array<{ name: string }>;
      for (const { name } of tables) {
        const rows = source
          .prepare(`SELECT * FROM "${name}"`)
          .all() as Array<Record<string, unknown>>;
        for (const [index, row] of rows.entries()) {
          const kind = tableKind(name);
          const sourceKey = sourceKeyFor(kind, row, index);
          const candidate = createCandidate(
            kind,
            sourceKey,
            databasePath,
            `${name}:${sourceKey}`,
            row,
            rowWarning(name, row),
          );
          candidates.push(candidate);
        }
      }
    } finally {
      source.close();
    }
  }
}

function createCandidate(
  kind: LegacyAssetKind,
  name: string,
  sourcePath: string,
  sourceKey: string,
  payload: Record<string, unknown>,
  warnings: string[],
): LegacyCandidate {
  const sourceFingerprint = createHash("sha256")
    .update(JSON.stringify({ kind, sourcePath, sourceKey, payload }))
    .digest("hex");
  return legacyCandidateSchema.parse({
    id: `${kind}:${sourceFingerprint}`,
    kind,
    name,
    sourcePath,
    sourceFingerprint,
    sourceKey,
    payload,
    warnings,
    selected: false,
  });
}

function tableKind(table: string): LegacyAssetKind {
  switch (table) {
    case "providers":
      return "provider";
    case "mcp_servers":
      return "mcp";
    case "prompts":
      return "prompt";
    case "skills":
      return "skill";
    default:
      return "skill-repository";
  }
}

function sourceKeyFor(
  kind: LegacyAssetKind,
  row: Record<string, unknown>,
  index: number,
): string {
  if (kind === "skill-repository") {
    return `${String(row.owner ?? "")}/${String(row.name ?? index)}`;
  }
  return String(row.id ?? row.name ?? index);
}

function rowWarning(table: string, row: Record<string, unknown>): string[] {
  if (table === "providers" && typeof row.settings_config === "string") {
    return ["Provider credentials remain in the imported payload and require review."];
  }
  return [];
}

async function exists(target: string): Promise<boolean> {
  return access(target).then(() => true).catch(() => false);
}
