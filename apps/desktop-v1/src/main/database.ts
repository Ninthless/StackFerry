import type { McpServer } from "../shared/contracts";
import { mcpServerSchema } from "../shared/contracts";
import { DatabaseConnection, type DatabaseOptions } from "./database/connection";
import type { AdapterChangePlan, AppliedChange } from "./agents/types";
import { randomUUID } from "node:crypto";
import type {
  DeploymentPreview,
  DeploymentResult,
} from "../shared/contracts";
import type { RequestLog } from "../proxy/routing";

export class WorkspaceDatabase {
  readonly connection: DatabaseConnection;

  constructor(path: string, options: DatabaseOptions = {}) {
    this.connection = new DatabaseConnection(path, options);
  }

  replaceDiscoveredMcpServers(servers: McpServer[]): void {
    const database = this.connection.database;
    const transaction = database.transaction(() => {
      database
        .prepare("DELETE FROM assets WHERE kind = ? AND ownership = ?")
        .run("mcp", "discovered");
      const insert = database.prepare(
        `INSERT OR REPLACE INTO assets
          (id, kind, name, ownership, payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      const now = new Date().toISOString();
      for (const server of servers) {
        insert.run(
          server.resourceId,
          "mcp",
          server.name,
          server.ownership,
          JSON.stringify(server),
          now,
          now,
        );
      }
    });
    transaction();
  }

  listMcpServers(): McpServer[] {
    const rows = this.connection.database
      .prepare("SELECT payload FROM assets WHERE kind = ? ORDER BY name, id")
      .all("mcp") as Array<{ payload: string }>;

    return rows.flatMap(({ payload }) => {
      const parsed = mcpServerSchema.safeParse(JSON.parse(payload));
      return parsed.success ? [parsed.data] : [];
    });
  }

  close(): void {
    this.connection.close();
  }

  backup(): string | null {
    return this.connection.backup();
  }

  savePreview(
    plan: AdapterChangePlan,
    capability: string,
    expiresAt: string,
  ): DeploymentPreview {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.connection.database
      .prepare(
        `INSERT INTO assets
          (id, kind, name, ownership, payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        capability,
        `${plan.agentId} ${capability} deployment`,
        "managed",
        JSON.stringify(plan),
        now,
        now,
      );
    this.connection.database
      .prepare(
        `INSERT INTO operations
          (id, kind, status, payload, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        `deployment.preview.${capability}`,
        "preview",
        JSON.stringify(plan),
        now,
      );
    return {
      id,
      agentId: plan.agentId,
      capability: capability as DeploymentPreview["capability"],
      createdAt: now,
      expiresAt,
      changes: plan.changes.map((change) => ({
        path: change.path,
        beforeHash: change.beforeHash,
        before: change.before,
        after: change.after,
      })),
    };
  }

  loadPreview(id: string): AdapterChangePlan {
    const row = this.connection.database
      .prepare("SELECT payload FROM operations WHERE id = ? AND status = ?")
      .get(id, "preview") as { payload: string } | undefined;
    if (!row) {
      throw new Error(`Deployment preview not found: ${id}`);
    }
    return JSON.parse(row.payload) as AdapterChangePlan;
  }

  saveAppliedDeployment(
    previewId: string,
    applied: AppliedChange,
  ): DeploymentResult {
    const deploymentId = randomUUID();
    const appliedAt = new Date().toISOString();
    const transaction = this.connection.database.transaction(() => {
      this.connection.database
        .prepare(
          "UPDATE operations SET status = ?, completed_at = ? WHERE id = ?",
        )
        .run("applied", appliedAt, previewId);
      this.connection.database
        .prepare(
          `INSERT INTO deployments
            (id, asset_id, agent_id, status, revision, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          deploymentId,
          previewId,
          applied.plan.agentId,
          "applied",
          1,
          appliedAt,
        );
    });
    transaction();
    return {
      deploymentId,
      previewId,
      status: "applied",
      appliedAt,
    };
  }

  saveRequestLog(log: RequestLog): void {
    this.connection.database
      .prepare(
        `INSERT OR REPLACE INTO request_logs
          (request_id, request_model, final_model, final_target_id, duration_ms,
           ttft_ms, status_code, error_message, attempts, usage,
           thinking_source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        log.requestId,
        log.requestModel,
        log.finalModel,
        log.finalTargetId,
        log.durationMs,
        log.ttftMs,
        log.statusCode,
        log.errorMessage,
        JSON.stringify(log.attempts),
        JSON.stringify(log.usage),
        log.thinkingSource,
        new Date().toISOString(),
      );
  }
}
