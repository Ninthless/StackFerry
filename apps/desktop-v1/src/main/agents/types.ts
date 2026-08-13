import type {
  AgentId,
  AgentStatus,
  McpServer,
  PromptAsset,
} from "../../shared/contracts";
import type { CapabilityId } from "../../shared/capabilities";

export interface AdapterContext {
  scope: "user" | "project";
  projectRoot?: string;
  trust?: ProjectTrust;
}

export interface ProjectTrust {
  projectRoot: string;
  grantedAt: string;
  canonicalRoot: string;
}

export interface AgentConfigSnapshot {
  agentId: AgentId;
  path: string;
  source: string;
  hash: string;
}

export interface PlannedFileChange {
  path: string;
  beforeHash: string;
  before: string;
  after: string;
  capability: CapabilityId;
}

export interface AdapterChangePlan {
  agentId: AgentId;
  createdAt: string;
  changes: PlannedFileChange[];
}

export interface AppliedChange {
  plan: AdapterChangePlan;
  backups: Array<{ path: string; backupPath: string | null }>;
}

export interface AgentAdapter {
  readonly id: AgentId;
  detect(): Promise<AgentStatus>;
  inspectVersion(): Promise<string | null>;
  read(context?: AdapterContext): Promise<AgentConfigSnapshot[]>;
  readMcpServers(context?: AdapterContext): Promise<McpServer[]>;
  readPrompt(context?: AdapterContext): Promise<PromptAsset>;
  planPromptChange(
    desired: PromptAsset,
    context?: AdapterContext,
  ): Promise<AdapterChangePlan>;
  planChanges(
    desired: unknown,
    context?: AdapterContext,
  ): Promise<AdapterChangePlan>;
  applyAtomically(plan: AdapterChangePlan): Promise<AppliedChange>;
  verify(applied: AppliedChange): Promise<void>;
  rollback(applied: AppliedChange): Promise<void>;
}
