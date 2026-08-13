import { access } from "node:fs/promises";
import type {
  AgentId,
  AgentStatus,
  McpServer,
  PromptAsset,
} from "../../shared/contracts";
import type { AgentAdapter } from "./types";
import type {
  AdapterChangePlan,
  AdapterContext,
  AgentConfigSnapshot,
  AppliedChange,
} from "./types";

interface StaticAgentOptions {
  id: AgentId;
  name: string;
  configPath: string;
  capabilities: AgentStatus["capabilities"];
}

export class StaticAgentAdapter implements AgentAdapter {
  readonly id: AgentId;
  private readonly options: StaticAgentOptions;

  constructor(options: StaticAgentOptions) {
    this.id = options.id;
    this.options = options;
  }

  async detect(): Promise<AgentStatus> {
    const installed = await access(this.options.configPath)
      .then(() => true)
      .catch(() => false);

    return {
      id: this.id,
      name: this.options.name,
      installed,
      configPath: installed ? this.options.configPath : null,
      version: null,
      health: installed ? "healthy" : "unavailable",
      capabilities: this.options.capabilities,
    };
  }

  async readMcpServers(): Promise<McpServer[]> {
    return [];
  }

  async readPrompt(): Promise<PromptAsset> {
    throw new Error(`${this.options.name} prompts are not managed`);
  }

  async planPromptChange(): Promise<AdapterChangePlan> {
    throw new Error(`${this.options.name} prompts are not managed`);
  }

  async inspectVersion(): Promise<string | null> {
    return null;
  }

  async read(_context?: AdapterContext): Promise<AgentConfigSnapshot[]> {
    return [];
  }

  async planChanges(
    _desired: unknown,
    _context?: AdapterContext,
  ): Promise<AdapterChangePlan> {
    throw new Error(`${this.options.name} configuration is not managed yet`);
  }

  async applyAtomically(_plan: AdapterChangePlan): Promise<AppliedChange> {
    throw new Error(`${this.options.name} configuration is not managed yet`);
  }

  async verify(_applied: AppliedChange): Promise<void> {
    throw new Error(`${this.options.name} configuration is not managed yet`);
  }

  async rollback(_applied: AppliedChange): Promise<void> {
    throw new Error(`${this.options.name} configuration is not managed yet`);
  }
}
