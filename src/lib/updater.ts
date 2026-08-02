import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import type { Update } from "@tauri-apps/plugin-updater";
import { APP_VERSION } from "./appVersion";
import { isUpdateAvailable } from "./version";

export interface UpdateInfo {
  currentVersion: string;
  availableVersion: string;
  notes?: string;
  pubDate?: string;
}

export interface CheckOptions {
  timeout?: number;
}

export interface UpdateHandle {
  version: string;
  downloadAndInstall: () => Promise<void>;
}

export async function getCurrentVersion(): Promise<string> {
  try {
    return await getVersion();
  } catch {
    return APP_VERSION;
  }
}

export async function checkForUpdate(
  opts: CheckOptions = {},
): Promise<
  | { status: "up-to-date" }
  | { status: "available"; info: UpdateInfo; update: UpdateHandle }
> {
  const currentVersion = await getCurrentVersion();
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check({ timeout: opts.timeout ?? 30000 });

  if (!update || !isUpdateAvailable(currentVersion, update.version)) {
    return { status: "up-to-date" };
  }

  const info: UpdateInfo = {
    currentVersion,
    availableVersion: update.version,
    notes: update.body ?? undefined,
    pubDate: update.date ?? undefined,
  };

  return { status: "available", info, update: mapUpdate(update) };
}

function mapUpdate(update: Update): UpdateHandle {
  return {
    version: update.version,
    downloadAndInstall: () => update.downloadAndInstall(),
  };
}

export async function relaunchApp(): Promise<void> {
  await relaunch();
}
