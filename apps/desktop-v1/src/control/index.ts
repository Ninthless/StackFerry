import { createAgentAdapters } from "../main/agents";
import { WorkspaceDatabase } from "../main/database";
import { WorkspaceService } from "../main/workspace";
import {
  applyDeploymentInputSchema,
  controlProtocolVersion,
  controlRequestSchema,
  controlResponseSchema,
  previewMcpInputSchema,
  previewPromptInputSchema,
  type ControlResponse,
} from "../shared/control";
import { toAppError } from "../shared/errors";

const parentPort = process.parentPort;

if (!parentPort) {
  throw new Error("Control process requires a parent port");
}

let database: WorkspaceDatabase | null = null;

parentPort.once("message", (event) => {
  const { databasePath, backupDirectory } = event.data as {
    databasePath: string;
    backupDirectory: string;
  };
  const port = event.ports[0];
  if (!port) {
    throw new Error("Control process message port is unavailable");
  }
  database = new WorkspaceDatabase(databasePath, { backupDirectory });
  const service = new WorkspaceService(createAgentAdapters(), database);
  port.on("message", async (event: { data: unknown }) => {
    const request = controlRequestSchema.parse(event.data);
    let response: ControlResponse;
    try {
      let data;
      switch (request.method) {
        case "workspace.get":
          data = await service.getWorkspace();
          break;
        case "workspace.refresh":
          data = await service.refreshWorkspace();
          break;
        case "database.backup":
          data = database?.backup() ?? null;
          break;
        case "deployment.preview-mcp":
          {
            const input = previewMcpInputSchema.parse(request.input);
            data = await service.previewMcpDeployment(
              input.servers,
              input.agentId,
              input.context,
            );
          }
          break;
        case "deployment.apply":
          data = await service.applyDeployment(
            applyDeploymentInputSchema.parse(request.input),
          );
          break;
        case "deployment.preview-prompt":
          data = await service.previewPromptDeployment(
            previewPromptInputSchema.parse(request.input),
          );
          break;
      }
      response = {
        version: controlProtocolVersion,
        id: request.id,
        ok: true,
        data,
      };
    } catch (error) {
      response = {
        version: controlProtocolVersion,
        id: request.id,
        ok: false,
        error: toAppError(error),
      };
    }
    port.postMessage(controlResponseSchema.parse(response));
  });
  port.start();
});

process.once("exit", () => {
  database?.close();
  database = null;
});
