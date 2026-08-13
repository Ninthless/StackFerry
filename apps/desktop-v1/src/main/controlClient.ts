import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  MessageChannelMain,
  utilityProcess,
  type MessagePortMain,
  type UtilityProcess,
} from "electron";
import {
  controlProtocolVersion,
  controlResponseSchema,
  type ControlRequest,
} from "../shared/control";
import { DesktopApiError } from "../shared/errors";
import type { WorkspaceSnapshot } from "../shared/contracts";
import type {
  DeploymentPreview,
  DeploymentResult,
  McpServer,
  PromptAsset,
} from "../shared/contracts";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export class ControlClient {
  private readonly child: UtilityProcess;
  private readonly port: MessagePortMain;
  private readonly pending = new Map<string, PendingRequest>();

  constructor(databasePath: string, backupDirectory: string) {
    const channel = new MessageChannelMain();
    this.port = channel.port1;
    this.child = utilityProcess.fork(path.join(__dirname, "control.js"), [], {
      serviceName: "StackFerry Control",
    });
    this.child.postMessage(
      { databasePath, backupDirectory },
      [channel.port2],
    );
    this.port.on("message", ({ data }) => this.handleResponse(data));
    this.port.start();
    this.child.once("exit", (code) => {
      this.rejectPending(
        new Error(`Control process exited unexpectedly with code ${code}`),
      );
    });
  }

  getWorkspace(): Promise<WorkspaceSnapshot> {
    return this.request("workspace.get") as Promise<WorkspaceSnapshot>;
  }

  refreshWorkspace(): Promise<WorkspaceSnapshot> {
    return this.request("workspace.refresh") as Promise<WorkspaceSnapshot>;
  }

  backupDatabase(): Promise<string | null> {
    return this.request("database.backup") as Promise<string | null>;
  }

  previewMcpDeployment(
    servers: McpServer[],
    agentId: "claude" | "codex" = "codex",
  ): Promise<DeploymentPreview> {
    return this.request(
      "deployment.preview-mcp",
      { agentId, servers, context: { scope: "user" } },
    ) as Promise<DeploymentPreview>;
  }

  previewPromptDeployment(prompt: PromptAsset): Promise<DeploymentPreview> {
    return this.request(
      "deployment.preview-prompt",
      prompt,
    ) as Promise<DeploymentPreview>;
  }

  applyDeployment(previewId: string): Promise<DeploymentResult> {
    return this.request(
      "deployment.apply",
      previewId,
    ) as Promise<DeploymentResult>;
  }

  close(): void {
    this.port.close();
    this.child.kill();
    this.rejectPending(new Error("Control process closed"));
  }

  private request(
    method: ControlRequest["method"],
    input?: unknown,
  ): Promise<unknown> {
    const id = randomUUID();
    const request: ControlRequest = {
      version: controlProtocolVersion,
      id,
      method,
      input,
    };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Control request timed out: ${method}`));
      }, 30_000);
      this.pending.set(id, { resolve, reject, timeout });
      this.port.postMessage(request);
    });
  }

  private handleResponse(value: unknown): void {
    const response = controlResponseSchema.parse(value);
    const pending = this.pending.get(response.id);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timeout);
    this.pending.delete(response.id);
    if (response.ok) {
      pending.resolve(response.data);
    } else {
      pending.reject(new DesktopApiError(response.error));
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
