import { getVersion } from "@tauri-apps/api/app";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { homeDir, join } from "@tauri-apps/api/path";
import {
  getCurrentWindow,
  type Window as TauriWindow,
} from "@tauri-apps/api/window";
import { error as writeErrorLog } from "@tauri-apps/plugin-log";
import { check } from "@tauri-apps/plugin-updater";
import { isTauri, type InvokeArgs } from "@tauri-apps/api/core";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";

export interface RuntimeUpdate {
  version: string;
  body?: string | null;
  date?: string | null;
}

export type RuntimeWindow = TauriWindow;
export type RuntimeInvokeArgs = InvokeArgs;

export const runtimeApi = {
  getVersion(): Promise<string> {
    return getVersion();
  },

  async checkForUpdate(timeout: number): Promise<RuntimeUpdate | null> {
    return check({ timeout });
  },

  homeDir(): Promise<string> {
    return homeDir();
  },

  joinPath(...paths: string[]): Promise<string> {
    return join(...paths);
  },

  listen<P>(
    eventName: string,
    handler: (payload: P) => void | Promise<void>,
  ): Promise<UnlistenFn> {
    return listen<P>(eventName, (event) => {
      void handler(event.payload);
    });
  },

  writeFrontendError(message: string): Promise<void> {
    return writeErrorLog(message, { file: "frontend" });
  },

  getCurrentWindow(): RuntimeWindow {
    return getCurrentWindow();
  },

  isTauri(): boolean {
    return isTauri();
  },

  installPreviewMocks(
    handler: (command: string, payload?: InvokeArgs) => unknown,
  ): void {
    mockWindows("main");
    mockIPC(handler, { shouldMockEvents: true });
  },
};
