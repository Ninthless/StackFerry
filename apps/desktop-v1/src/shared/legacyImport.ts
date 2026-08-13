import { z } from "zod";
import { agentIdSchema } from "./capabilities";

export const legacyAssetKindSchema = z.enum([
  "provider",
  "mcp",
  "prompt",
  "skill",
  "skill-repository",
]);

export const legacyCandidateSchema = z.object({
  id: z.string().min(1),
  kind: legacyAssetKindSchema,
  name: z.string().min(1),
  sourcePath: z.string().min(1),
  sourceFingerprint: z.string().length(64),
  sourceKey: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  warnings: z.array(z.string()),
  selected: z.boolean(),
});

export const legacyScanSchema = z.object({
  scanId: z.string().uuid(),
  root: z.string().min(1),
  databasePath: z.string().nullable(),
  scannedAt: z.string().datetime(),
  candidates: z.array(legacyCandidateSchema),
  errors: z.array(z.object({ source: z.string(), message: z.string() })),
});

export const legacyImportPreviewSchema = z.object({
  scanId: z.string().uuid(),
  selectedIds: z.array(z.string()),
  items: z.array(
    z.object({
      candidateId: z.string(),
      action: z.enum(["create", "update", "skip", "conflict"]),
      targetId: z.string(),
      reason: z.string(),
    }),
  ),
});

export const legacyImportResultSchema = z.object({
  scanId: z.string().uuid(),
  imported: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  conflicts: z.number().int().nonnegative(),
});

export type LegacyCandidate = z.infer<typeof legacyCandidateSchema>;
export type LegacyScan = z.infer<typeof legacyScanSchema>;
export type LegacyImportPreview = z.infer<typeof legacyImportPreviewSchema>;
export type LegacyImportResult = z.infer<typeof legacyImportResultSchema>;
export type LegacyAssetKind = z.infer<typeof legacyAssetKindSchema>;
export type LegacyAgentId = z.infer<typeof agentIdSchema>;
