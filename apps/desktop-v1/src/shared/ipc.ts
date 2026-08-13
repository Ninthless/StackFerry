export const ipcChannels = {
  workspaceGet: "workspace:get",
  workspaceRefresh: "workspace:refresh",
  deploymentPreviewMcp: "deployment:preview-mcp",
  deploymentPreviewPrompt: "deployment:preview-prompt",
  deploymentApply: "deployment:apply",
} as const;

export const desktopProtocol = "stackferry";
export const desktopOrigin = `${desktopProtocol}://app`;
