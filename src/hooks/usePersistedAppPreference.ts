import { useCallback, useEffect, useState } from "react";
import type { AppId } from "@/lib/api/types";

const getFallbackApp = (
  availableApps: readonly AppId[],
  defaultApp: AppId,
): AppId =>
  availableApps.includes(defaultApp)
    ? defaultApp
    : (availableApps[0] ?? defaultApp);

const readPreference = (
  storageKey: string,
  availableApps: readonly AppId[],
  defaultApp: AppId,
): AppId => {
  const fallback = getFallbackApp(availableApps, defaultApp);
  if (typeof window === "undefined") return fallback;

  try {
    const stored = window.localStorage.getItem(storageKey) as AppId | null;
    return stored && availableApps.includes(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
};

export function usePersistedAppPreference(
  storageKey: string,
  availableApps: readonly AppId[],
  defaultApp: AppId = "claude",
) {
  const availableKey = availableApps.join("\u0000");
  const [app, setAppState] = useState<AppId>(() =>
    readPreference(storageKey, availableApps, defaultApp),
  );

  useEffect(() => {
    if (availableApps.includes(app)) return;

    const fallback = getFallbackApp(availableApps, defaultApp);
    setAppState(fallback);
    try {
      window.localStorage.setItem(storageKey, fallback);
    } catch {}
  }, [app, availableKey, availableApps, defaultApp, storageKey]);

  const setApp = useCallback(
    (nextApp: AppId) => {
      if (!availableApps.includes(nextApp)) return;

      setAppState(nextApp);
      try {
        window.localStorage.setItem(storageKey, nextApp);
      } catch {}
    },
    [availableKey, availableApps, storageKey],
  );

  return [app, setApp] as const;
}
