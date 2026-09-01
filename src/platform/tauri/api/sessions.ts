import { invoke } from "@tauri-apps/api/core";
import type {
  SessionMessage,
  SessionMessagePage,
  SessionMeta,
} from "@/shared/contracts";

export const SESSION_PROVIDER_IDS = [
  "codex",
  "claude",
  "opencode",
  "openclaw",
  "gemini",
  "hermes",
  "grokbuild",
  "pi",
] as const;

export type SessionProviderId = (typeof SESSION_PROVIDER_IDS)[number];

export type SessionScope =
  | { type: "all" }
  | { type: "default" }
  | { type: "instance"; instanceId: string };

export const DEFAULT_SESSION_SCOPE: SessionScope = { type: "default" };

export const isSessionProviderId = (
  value: string | null | undefined,
): value is SessionProviderId =>
  value !== null &&
  value !== undefined &&
  SESSION_PROVIDER_IDS.includes(value as SessionProviderId);

export interface DeleteSessionOptions {
  providerId: string;
  sessionId: string;
  instanceId?: string;
  sourcePath: string;
}

export interface DeleteSessionResult extends DeleteSessionOptions {
  success: boolean;
  error?: string;
}

export const sessionsApi = {
  async list(
    providerId: SessionProviderId,
    scope: SessionScope = DEFAULT_SESSION_SCOPE,
    forceRefresh = false,
  ): Promise<SessionMeta[]> {
    const backendScope =
      scope.type === "instance"
        ? { type: "instance", instanceId: scope.instanceId }
        : { type: scope.type };
    return await invoke<SessionMeta[]>("list_sessions", {
      providerId,
      scope: backendScope,
      forceRefresh,
    });
  },

  async getMessages(
    providerId: string,
    sourcePath: string,
    instanceId?: string,
  ): Promise<SessionMessage[]> {
    return await invoke("get_session_messages", {
      providerId,
      instanceId,
      sourcePath,
    });
  },

  async getMessagePage(
    providerId: string,
    sourcePath: string,
    cursor?: string,
    instanceId?: string,
  ): Promise<SessionMessagePage> {
    return await invoke("get_session_message_page", {
      providerId,
      instanceId,
      sourcePath,
      cursor,
    });
  },

  async getMessageContent(
    providerId: string,
    sourcePath: string,
    contentCursor: string,
    instanceId?: string,
  ): Promise<string> {
    return await invoke("get_session_message_content", {
      providerId,
      instanceId,
      sourcePath,
      contentCursor,
    });
  },

  async delete(options: DeleteSessionOptions): Promise<boolean> {
    const { providerId, sessionId, instanceId, sourcePath } = options;
    return await invoke("delete_session", {
      providerId,
      sessionId,
      instanceId,
      sourcePath,
    });
  },

  async deleteMany(
    items: DeleteSessionOptions[],
  ): Promise<DeleteSessionResult[]> {
    return await invoke("delete_sessions", { items });
  },

  async launchTerminal(options: {
    command: string;
    cwd?: string | null;
    customConfig?: string | null;
    providerId?: string;
    instanceId?: string;
    sessionId?: string;
    sourcePath?: string;
  }): Promise<boolean> {
    const {
      command,
      cwd,
      customConfig,
      providerId,
      instanceId,
      sessionId,
      sourcePath,
    } = options;
    return await invoke("launch_session_terminal", {
      command,
      cwd,
      customConfig,
      providerId,
      instanceId,
      sessionId,
      sourcePath,
    });
  },
};
