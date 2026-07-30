import { getVersion } from "@tauri-apps/api/app";
import { isUpdateAvailable } from "./version";

const LATEST_RELEASE_URL =
  "https://api.github.com/repos/Ninthless/StackFerry/releases/latest";

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
    return "";
  }
}

export async function checkForUpdate(
  opts: CheckOptions = {},
): Promise<
  { status: "up-to-date" } | { status: "available"; info: UpdateInfo }
> {
  const currentVersion = await getCurrentVersion();
  const controller = new AbortController();
  const timer = window.setTimeout(
    () => controller.abort(),
    opts.timeout ?? 30000,
  );

  let response: Response;
  try {
    response = await fetch(LATEST_RELEASE_URL, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timer);
  }

  if (response.status === 404) {
    return { status: "up-to-date" };
  }

  if (!response.ok) {
    throw new Error(`GitHub release check failed: HTTP ${response.status}`);
  }

  const release = (await response.json()) as {
    tag_name?: string;
    body?: string;
    published_at?: string;
  };
  const latestVersion = (release.tag_name ?? "").replace(/^v/i, "");

  if (!isUpdateAvailable(currentVersion, latestVersion)) {
    return { status: "up-to-date" };
  }

  const info: UpdateInfo = {
    currentVersion,
    availableVersion: latestVersion,
    notes: release.body,
    pubDate: release.published_at,
  };

  return { status: "available", info };
}
