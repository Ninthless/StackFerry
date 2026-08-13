import { describe, expect, it } from "vitest";
import {
  agentRegistry,
  capabilityIdSchema,
  getAgentDefinition,
} from "../src/shared/capabilities";
import { DesktopApiError, ipcResultSchema } from "../src/shared/errors";
import { workspaceSnapshotSchema } from "../src/shared/contracts";

describe("desktop contracts", () => {
  it("defines every capability for every registered agent", () => {
    const capabilityIds = capabilityIdSchema.options;
    expect(agentRegistry.map((agent) => agent.id)).toHaveLength(
      new Set(agentRegistry.map((agent) => agent.id)).size,
    );
    for (const agent of agentRegistry) {
      expect(Object.keys(agent.capabilities).sort()).toEqual(
        [...capabilityIds].sort(),
      );
      expect(getAgentDefinition(agent.id)).toBe(agent);
    }
  });

  it("rejects malformed IPC results and preserves stable errors", () => {
    const schema = ipcResultSchema(workspaceSnapshotSchema);
    const error = {
      code: "conflict" as const,
      message: "Configuration changed",
      retryable: true,
      details: { resourceId: "codex:context7" },
    };
    const result = schema.parse({ ok: false, error });
    expect(result).toEqual({ ok: false, error });
    expect(() =>
      schema.parse({ ok: true, data: { agents: [], mcpServers: [] } }),
    ).toThrow();

    const apiError = new DesktopApiError(error);
    expect(apiError.code).toBe("conflict");
    expect(apiError.retryable).toBe(true);
  });
});
