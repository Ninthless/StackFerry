import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { z } from "zod";
import {
  deploymentPreviewSchema,
  deploymentResultSchema,
  mcpServerSchema,
  promptAssetSchema,
  workspaceSnapshotSchema,
} from "../shared/contracts";
import { ipcResultSchema, toAppError, type IpcResult } from "../shared/errors";
import { desktopOrigin, ipcChannels } from "../shared/ipc";
import type { ControlClient } from "./controlClient";

export function registerWorkspaceIpc(client: ControlClient): void {
  ipcMain.handle(ipcChannels.workspaceGet, (event) =>
    invokeWorkspace(event, () => client.getWorkspace()),
  );
  ipcMain.handle(ipcChannels.workspaceRefresh, (event) =>
    invokeWorkspace(event, () => client.refreshWorkspace()),
  );
  ipcMain.handle(ipcChannels.deploymentPreviewMcp, async (event, input) => {
    try {
      assertTrustedSender(event);
      const servers = mcpServerSchema.array().parse(input);
      const agentIds = new Set(servers.map((server) => server.sourceAgent));
      if (
        agentIds.size !== 1 ||
        !["claude", "codex"].includes(servers[0]?.sourceAgent)
      ) {
        throw new Error(
          "MCP deployment must target exactly one managed agent",
        );
      }
      const data = deploymentPreviewSchema.parse(
        await client.previewMcpDeployment(
          servers,
          servers[0].sourceAgent as "claude" | "codex",
        ),
      );
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: toAppError(error) };
    }
  });
  ipcMain.handle(ipcChannels.deploymentPreviewPrompt, async (event, input) => {
    try {
      assertTrustedSender(event);
      const data = deploymentPreviewSchema.parse(
        await client.previewPromptDeployment(promptAssetSchema.parse(input)),
      );
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: toAppError(error) };
    }
  });
  ipcMain.handle(ipcChannels.deploymentApply, async (event, input) => {
    try {
      assertTrustedSender(event);
      const data = deploymentResultSchema.parse(
        await client.applyDeployment(z.string().uuid().parse(input)),
      );
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: toAppError(error) };
    }
  });
}

export function unregisterWorkspaceIpc(): void {
  ipcMain.removeHandler(ipcChannels.workspaceGet);
  ipcMain.removeHandler(ipcChannels.workspaceRefresh);
  ipcMain.removeHandler(ipcChannels.deploymentPreviewMcp);
  ipcMain.removeHandler(ipcChannels.deploymentPreviewPrompt);
  ipcMain.removeHandler(ipcChannels.deploymentApply);
}

async function invokeWorkspace(
  event: IpcMainInvokeEvent,
  operation: () => Promise<unknown>,
): Promise<IpcResult<unknown>> {
  try {
    assertTrustedSender(event);
    const data = workspaceSnapshotSchema.parse(await operation());
    return ipcResultSchema(workspaceSnapshotSchema).parse({ ok: true, data });
  } catch (error) {
    return { ok: false, error: toAppError(error) };
  }
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? "";
  const trusted =
    url.startsWith(`${desktopOrigin}/`) ||
    (process.env.ELECTRON_RENDERER_URL !== undefined &&
      url.startsWith(process.env.ELECTRON_RENDERER_URL));
  if (!trusted || event.senderFrame !== event.sender.mainFrame) {
    throw new Error("IPC request came from an untrusted frame");
  }
}
