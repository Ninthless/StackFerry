import type { WorkspaceSnapshot } from "../shared/contracts";
import {
  deploymentPreviewSchema,
  deploymentResultSchema,
  mcpServerSchema,
  promptAssetSchema,
  workspaceSnapshotSchema,
} from "../shared/contracts";
import type { SupportLevel } from "../shared/capabilities";
import type { AgentAdapter } from "./agents/types";
import type { WorkspaceDatabase } from "./database";
import type {
  DeploymentPreview,
  DeploymentResult,
} from "../shared/contracts";

export class WorkspaceService {
  constructor(
    private readonly adapters: AgentAdapter[],
    private readonly database: WorkspaceDatabase,
  ) {}

  async getWorkspace(): Promise<WorkspaceSnapshot> {
    const agents = await Promise.all(
      this.adapters.map((adapter) => adapter.detect()),
    );
    return workspaceSnapshotSchema.parse({
      agents,
      mcpServers: this.database.listMcpServers(),
      prompts: await this.readUserPrompts(agents),
      scannedAt: new Date().toISOString(),
    });
  }

  async refreshWorkspace(): Promise<WorkspaceSnapshot> {
    const agents = await Promise.all(
      this.adapters.map((adapter) => adapter.detect()),
    );
    const discovered = (
      await Promise.all(
        this.adapters.map(async (adapter) => {
          const status = agents.find((agent) => agent.id === adapter.id);
          if (!status?.installed || !canInspect(status.capabilities.mcp)) {
            return [];
          }
          return adapter.readMcpServers({ scope: "user" });
        }),
      )
    ).flat();

    this.database.replaceDiscoveredMcpServers(discovered);
    return workspaceSnapshotSchema.parse({
      agents,
      mcpServers: this.database.listMcpServers(),
      prompts: await this.readUserPrompts(agents),
      scannedAt: new Date().toISOString(),
    });
  }

  async previewPromptDeployment(
    input: unknown,
  ): Promise<DeploymentPreview> {
    const desired = promptAssetSchema.parse(input);
    const adapter = this.adapters.find((item) => item.id === desired.sourceAgent);
    if (!adapter) {
      throw new Error(`${desired.sourceAgent} adapter is unavailable`);
    }
    const plan = await adapter.planPromptChange(desired, { scope: "user" });
    return deploymentPreviewSchema.parse(
      this.database.savePreview(
        plan,
        "prompts",
        new Date(Date.now() + 10 * 60_000).toISOString(),
      ),
    );
  }

  async previewMcpDeployment(
    servers: unknown,
    agentId: "claude" | "codex" = "codex",
    context: import("./agents/types").AdapterContext = { scope: "user" },
  ): Promise<DeploymentPreview> {
    const desired = mcpServerSchema.array().parse(servers);
    const adapter = this.adapters.find((item) => item.id === agentId);
    if (!adapter) {
      throw new Error(`${agentId} adapter is unavailable`);
    }
    const plan = await adapter.planChanges(desired, context);
    return deploymentPreviewSchema.parse(
      this.database.savePreview(
        plan,
        "mcp",
        new Date(Date.now() + 10 * 60_000).toISOString(),
      ),
    );
  }

  async applyDeployment(previewId: string): Promise<DeploymentResult> {
    const plan = this.database.loadPreview(previewId);
    const adapter = this.adapters.find((item) => item.id === plan.agentId);
    if (!adapter) {
      throw new Error(`Adapter unavailable: ${plan.agentId}`);
    }
    const applied = await adapter.applyAtomically(plan);
    try {
      await adapter.verify(applied);
      return deploymentResultSchema.parse(
        this.database.saveAppliedDeployment(previewId, applied),
      );
    } catch (error) {
      await adapter.rollback(applied);
      throw error;
    }
  }

  private async readUserPrompts(
    agents: WorkspaceSnapshot["agents"],
  ): Promise<WorkspaceSnapshot["prompts"]> {
    const managedIds = new Set(["claude", "codex"]);
    return (
      await Promise.all(
        this.adapters.map(async (adapter) => {
          const status = agents.find((agent) => agent.id === adapter.id);
          if (!status?.installed || !managedIds.has(adapter.id)) {
            return [];
          }
          try {
            return [await adapter.readPrompt({ scope: "user" })];
          } catch {
            return [];
          }
        }),
      )
    ).flat();
  }
}

function canInspect(level: SupportLevel | undefined): boolean {
  return level !== undefined && level !== "unsupported";
}
