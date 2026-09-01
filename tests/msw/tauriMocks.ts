import "cross-fetch/polyfill";
import { vi } from "vitest";
import { server } from "./server";

const tauriWindowMock = vi.hoisted(() => {
  type WindowEventHandler<T> = (event: { payload: T }) => void;
  const unlisten = (): void => undefined;

  return {
    close: vi.fn(async (): Promise<void> => undefined),
    isDecorated: vi.fn(async (): Promise<boolean> => true),
    isFullscreen: vi.fn(async (): Promise<boolean> => false),
    isMaximized: vi.fn(async (): Promise<boolean> => false),
    minimize: vi.fn(async (): Promise<void> => undefined),
    onFocusChanged: vi.fn(
      async (_handler: WindowEventHandler<boolean>): Promise<() => void> =>
        unlisten,
    ),
    onResized: vi.fn(
      async (_handler: WindowEventHandler<unknown>): Promise<() => void> =>
        unlisten,
    ),
    onScaleChanged: vi.fn(
      async (_handler: WindowEventHandler<unknown>): Promise<() => void> =>
        unlisten,
    ),
    setDecorations: vi.fn(
      async (_decorated: boolean): Promise<void> => undefined,
    ),
    toggleMaximize: vi.fn(async (): Promise<void> => undefined),
  };
});

export const getTauriWindowMock = () => tauriWindowMock;

const TAURI_ENDPOINT = "http://tauri.local";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (command: string, payload: Record<string, unknown> = {}) => {
    const response = await fetch(`${TAURI_ENDPOINT}/${command}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload ?? {}),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Invoke failed for ${command}`);
    }

    const text = await response.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  },
}));

const listeners = new Map<string, Set<(event: { payload: unknown }) => void>>();

const ensureListenerSet = (event: string) => {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  return listeners.get(event)!;
};

export const emitTauriEvent = (event: string, payload: unknown) => {
  const handlers = listeners.get(event);
  handlers?.forEach((handler) => handler({ payload }));
};

vi.mock("@tauri-apps/api/event", () => ({
  listen: async (
    event: string,
    handler: (event: { payload: unknown }) => void,
  ) => {
    const set = ensureListenerSet(event);
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  },
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => tauriWindowMock,
}));

// Ensure the MSW server is referenced so tree shaking doesn't remove imports
void server;

vi.mock("@tauri-apps/api/path", () => ({
  homeDir: async () => "/home/mock",
  join: async (...segments: string[]) => segments.join("/"),
}));
