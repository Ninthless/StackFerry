import { APP_VERSION } from "./appVersion";
import { isUpdateAvailable } from "./version";
import { runtimeApi } from "@/platform/tauri/api";

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
    return await runtimeApi.getVersion();
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
  const update = await runtimeApi.checkForUpdate(opts.timeout ?? 30000);

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
