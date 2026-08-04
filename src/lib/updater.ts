import { getVersion } from "@tauri-apps/api/app";
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
  { status: "up-to-date" } | { status: "available"; info: UpdateInfo }
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

  return { status: "available", info };
}
