import { z } from "zod";
import { appErrorSchema } from "./errors";
import { workspaceSnapshotSchema } from "./contracts";
import {
  deploymentPreviewSchema,
  deploymentResultSchema,
  mcpServerSchema,
  promptAssetSchema,
} from "./contracts";

export const controlProtocolVersion = 1;

export const controlRequestSchema = z.object({
  version: z.literal(controlProtocolVersion),
  id: z.string().uuid(),
  method: z.enum([
    "workspace.get",
    "workspace.refresh",
    "database.backup",
    "deployment.preview-mcp",
    "deployment.preview-prompt",
    "deployment.apply",
  ]),
  input: z.unknown().optional(),
});

export const controlResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    version: z.literal(controlProtocolVersion),
    id: z.string().uuid(),
    ok: z.literal(true),
    data: z.union([
      workspaceSnapshotSchema,
      z.string().nullable(),
      deploymentPreviewSchema,
      deploymentResultSchema,
    ]),
  }),
  z.object({
    version: z.literal(controlProtocolVersion),
    id: z.string().uuid(),
    ok: z.literal(false),
    error: appErrorSchema,
  }),
]);

export type ControlRequest = z.infer<typeof controlRequestSchema>;
export type ControlResponse = z.infer<typeof controlResponseSchema>;

export const adapterContextSchema = z.object({
  scope: z.enum(["user", "project"]),
  projectRoot: z.string().min(1).optional(),
  trust: z
    .object({
      projectRoot: z.string().min(1),
      canonicalRoot: z.string().min(1),
      grantedAt: z.string().datetime(),
    })
    .optional(),
});
export const previewMcpInputSchema = z.object({
  agentId: z.enum(["claude", "codex"]),
  servers: z.array(mcpServerSchema),
  context: adapterContextSchema.default({ scope: "user" }),
});
export const applyDeploymentInputSchema = z.string().uuid();
export const previewPromptInputSchema = promptAssetSchema;
