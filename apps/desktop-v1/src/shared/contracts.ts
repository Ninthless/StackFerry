import { z } from "zod";
import {
  agentIdSchema,
  supportLevelSchema,
  type AgentId,
} from "./capabilities";

export const agentStatusSchema = z.object({
  id: agentIdSchema,
  name: z.string().min(1),
  installed: z.boolean(),
  configPath: z.string().nullable(),
  version: z.string().nullable().default(null),
  health: z.enum(["healthy", "degraded", "unavailable"]),
  capabilities: z.record(z.string(), supportLevelSchema),
});

export const mcpTransportSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("stdio"),
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    cwd: z.string().nullable().default(null),
    env: z.record(z.string(), z.string()).default({}),
  }),
  z.object({
    type: z.enum(["http", "sse"]),
    url: z.string().url(),
    headers: z.record(z.string(), z.string()).default({}),
  }),
]);

export const mcpServerSchema = z.object({
  id: z.string().min(1),
  resourceId: z.string().min(1),
  name: z.string().min(1),
  sourceAgent: agentIdSchema,
  ownership: z.enum(["managed", "discovered", "agent-owned"]),
  transport: mcpTransportSchema,
});

export const promptAssetSchema = z.object({
  resourceId: z.string().min(1),
  sourceAgent: z.enum(["claude", "codex"]),
  scope: z.enum(["user", "project"]),
  path: z.string().min(1),
  content: z.string(),
  exists: z.boolean(),
  ownership: z.enum(["managed", "discovered"]),
});

export const workspaceSnapshotSchema = z.object({
  agents: z.array(agentStatusSchema),
  mcpServers: z.array(mcpServerSchema),
  prompts: z.array(promptAssetSchema).default([]),
  scannedAt: z.string().datetime(),
});

export const deploymentPreviewSchema = z.object({
  id: z.string().uuid(),
  agentId: agentIdSchema,
  capability: z.enum(["providers", "profiles", "mcp", "skills", "prompts"]),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  changes: z.array(
    z.object({
      path: z.string().min(1),
      beforeHash: z.string().min(1),
      before: z.string(),
      after: z.string(),
    }),
  ),
});

export const deploymentResultSchema = z.object({
  deploymentId: z.string().uuid(),
  previewId: z.string().uuid(),
  status: z.enum(["applied", "rolled-back"]),
  appliedAt: z.string().datetime(),
});

export const desktopApiSchema = z.object({
  getWorkspace: z.function({
    input: [],
    output: z.promise(workspaceSnapshotSchema),
  }),
  refreshWorkspace: z.function({
    input: [],
    output: z.promise(workspaceSnapshotSchema),
  }),
  previewMcpDeployment: z.function({
    input: [z.array(mcpServerSchema)],
    output: z.promise(deploymentPreviewSchema),
  }),
  previewPromptDeployment: z.function({
    input: [promptAssetSchema],
    output: z.promise(deploymentPreviewSchema),
  }),
  applyDeployment: z.function({
    input: [z.string().uuid()],
    output: z.promise(deploymentResultSchema),
  }),
});

export type { AgentId };
export type AgentStatus = z.infer<typeof agentStatusSchema>;
export type McpServer = z.infer<typeof mcpServerSchema>;
export type PromptAsset = z.infer<typeof promptAssetSchema>;
export type WorkspaceSnapshot = z.infer<typeof workspaceSnapshotSchema>;
export type DeploymentPreview = z.infer<typeof deploymentPreviewSchema>;
export type DeploymentResult = z.infer<typeof deploymentResultSchema>;
export type DesktopApi = z.infer<typeof desktopApiSchema>;
