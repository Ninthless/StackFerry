import { contextBridge, ipcRenderer } from "electron";
import { z } from "zod";
import {
  desktopApiSchema,
  deploymentPreviewSchema,
  deploymentResultSchema,
  mcpServerSchema,
  promptAssetSchema,
  workspaceSnapshotSchema,
  type DesktopApi,
} from "../shared/contracts";
import {
  DesktopApiError,
  ipcResultSchema,
  type IpcResult,
} from "../shared/errors";
import { ipcChannels } from "../shared/ipc";

const api: DesktopApi = {
  getWorkspace: () => invokeWorkspace(ipcChannels.workspaceGet),
  refreshWorkspace: () => invokeWorkspace(ipcChannels.workspaceRefresh),
  previewMcpDeployment: (servers) =>
    invoke(
      ipcChannels.deploymentPreviewMcp,
      deploymentPreviewSchema,
      mcpServerSchema.array().parse(servers),
    ),
  previewPromptDeployment: (prompt) =>
    invoke(
      ipcChannels.deploymentPreviewPrompt,
      deploymentPreviewSchema,
      promptAssetSchema.parse(prompt),
    ),
  applyDeployment: (previewId) =>
    invoke(
      ipcChannels.deploymentApply,
      deploymentResultSchema,
      previewId,
    ),
};

contextBridge.exposeInMainWorld("stackferry", desktopApiSchema.parse(api));

async function invokeWorkspace(channel: string) {
  return invoke(channel, workspaceSnapshotSchema);
}

async function invoke<T>(
  channel: string,
  schema: z.ZodType<T>,
  input?: unknown,
): Promise<T> {
  const result = ipcResultSchema(schema).parse(
    (await ipcRenderer.invoke(channel, input)) as IpcResult<unknown>,
  );
  if (!result.ok) {
    throw new DesktopApiError(result.error);
  }
  return result.data;
}
