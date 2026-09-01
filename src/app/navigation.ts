import type { AppId } from "@/platform/tauri/api";
import type { AppView } from "@/app/shell/types";

const APP_STORAGE_KEY = "stackferry-last-app";
export const VIEW_STORAGE_KEY = "stackferry-last-view";

const VALID_APPS: AppId[] = [
  "claude",
  "claude-desktop",
  "codex",
  "pi",
  "gemini",
  "grokbuild",
  "opencode",
  "openclaw",
  "hermes",
];

const VALID_VIEWS: AppView[] = [
  "providers",
  "announcements",
  "settings",
  "prompts",
  "skills",
  "skillsDiscovery",
  "mcp",
  "sessions",
  "workspace",
  "openclawEnv",
  "openclawTools",
  "openclawAgents",
  "hermesMemory",
  "piExtensions",
];

export function isViewCompatibleWithApp(view: AppView, appId: AppId): boolean {
  if (
    view === "workspace" ||
    view === "openclawEnv" ||
    view === "openclawTools" ||
    view === "openclawAgents"
  ) {
    return appId === "openclaw";
  }
  if (view === "hermesMemory") {
    return appId === "hermes";
  }
  if (view === "piExtensions") {
    return appId === "pi";
  }
  return true;
}

export function getInitialApp(): AppId {
  const saved = localStorage.getItem(APP_STORAGE_KEY) as AppId | null;
  return saved && VALID_APPS.includes(saved) ? saved : "claude";
}

export function getInitialView(appId: AppId): AppView {
  const saved = localStorage.getItem(VIEW_STORAGE_KEY) as AppView | null;
  return saved &&
    VALID_VIEWS.includes(saved) &&
    isViewCompatibleWithApp(saved, appId)
    ? saved
    : "providers";
}
