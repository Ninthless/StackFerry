import { invoke } from "@tauri-apps/api/core";
import type { SessionMessage, SessionMessagePage, SessionMeta } from "@/types";

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

export const isSessionProviderId = (
  value: string | null | undefined,
): value is SessionProviderId =>
  value !== null &&
  value !== undefined &&
  SESSION_PROVIDER_IDS.includes(value as SessionProviderId);

export interface DeleteSessionOptions {
  providerId: string;
  sessionId: string;
  sourcePath: string;
}

export interface DeleteSessionResult extends DeleteSessionOptions {
  success: boolean;
  error?: string;
}

export const sessionsApi = {
  async list(
    providerId: SessionProviderId,
    forceRefresh = false,
  ): Promise<SessionMeta[]> {
    return await invoke("list_sessions", { providerId, forceRefresh });
  },

  async getMessages(
    providerId: string,
    sourcePath: string,
  ): Promise<SessionMessage[]> {
    return await invoke("get_session_messages", { providerId, sourcePath });
  },

  async getMessagePage(
    providerId: string,
    sourcePath: string,
    cursor?: string,
  ): Promise<SessionMessagePage> {
    return await invoke("get_session_message_page", {
      providerId,
      sourcePath,
      cursor,
    });
  },

  async getMessageContent(
    providerId: string,
    sourcePath: string,
    contentCursor: string,
  ): Promise<string> {
    return await invoke("get_session_message_content", {
      providerId,
      sourcePath,
      contentCursor,
    });
  },

  async delete(options: DeleteSessionOptions): Promise<boolean> {
    const { providerId, sessionId, sourcePath } = options;
    return await invoke("delete_session", {
      providerId,
      sessionId,
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
  }): Promise<boolean> {
    const { command, cwd, customConfig } = options;
    return await invoke("launch_session_terminal", {
      command,
      cwd,
      customConfig,
    });
  },
};
