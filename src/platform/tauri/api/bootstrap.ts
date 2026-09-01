import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { message } from "@tauri-apps/plugin-dialog";
import { exit } from "@tauri-apps/plugin-process";

export interface ConfigLoadErrorPayload {
  path?: string;
  error?: string;
  kind?: string;
  db_version?: number;
  supported_version?: number;
}

export const bootstrapApi = {
  getInitError(): Promise<ConfigLoadErrorPayload | null> {
    return invoke("get_init_error");
  },

  onConfigLoadError(
    handler: (payload: ConfigLoadErrorPayload | null) => void | Promise<void>,
  ): Promise<UnlistenFn> {
    return listen<ConfigLoadErrorPayload | null>("configLoadError", (event) =>
      handler(event.payload),
    );
  },

  async showErrorMessage(content: string, title: string): Promise<void> {
    await message(content, { title, kind: "error" });
  },

  exit(code: number): Promise<void> {
    return exit(code);
  },
};
