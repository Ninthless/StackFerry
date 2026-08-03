import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface WindowControlState {
  isDecorated: boolean;
  isFocused: boolean;
  isFullscreen: boolean;
  isMaximized: boolean;
  isReady: boolean;
}

const initialState: WindowControlState = {
  isDecorated: true,
  isFocused: true,
  isFullscreen: false,
  isMaximized: false,
  isReady: false,
};

export function useWindowControls() {
  const appWindow = useMemo(() => getCurrentWindow(), []);
  const mountedRef = useRef(false);
  const [state, setState] = useState<WindowControlState>(initialState);

  const readWindowState = useCallback(async () => {
    const [isDecorated, isFullscreen, isMaximized] = await Promise.all([
      appWindow.isDecorated(),
      appWindow.isFullscreen(),
      appWindow.isMaximized(),
    ]);

    return { isDecorated, isFullscreen, isMaximized };
  }, [appWindow]);

  const reconcile = useCallback(async () => {
    const nextState = await readWindowState();
    if (mountedRef.current) {
      setState((current) => ({
        ...current,
        ...nextState,
        isReady: true,
      }));
    }
  }, [readWindowState]);

  useEffect(() => {
    let disposed = false;
    const unlisteners: UnlistenFn[] = [];
    mountedRef.current = true;

    const safeReconcile = () => {
      void readWindowState()
        .then((nextState) => {
          if (!disposed) {
            setState((current) => ({
              ...current,
              ...nextState,
              isReady: true,
            }));
          }
        })
        .catch((error) => {
          console.error("[WindowFrame] Failed to read window state", error);
        });
    };

    const unlistenSafely = (unlisten: UnlistenFn) => {
      try {
        void Promise.resolve(unlisten()).catch((error) => {
          console.error(
            "[WindowFrame] Failed to unsubscribe from window state",
            error,
          );
        });
      } catch (error) {
        console.error(
          "[WindowFrame] Failed to unsubscribe from window state",
          error,
        );
      }
    };

    const addListener = async (
      subscribe: () => Promise<UnlistenFn>,
    ): Promise<void> => {
      try {
        const unlisten = await subscribe();
        if (disposed) {
          unlistenSafely(unlisten);
        } else {
          unlisteners.push(unlisten);
        }
      } catch (error) {
        console.error(
          "[WindowFrame] Failed to subscribe to window state",
          error,
        );
      }
    };

    safeReconcile();
    void addListener(() => appWindow.onResized(safeReconcile));
    void addListener(() => appWindow.onScaleChanged(safeReconcile));
    void addListener(() =>
      appWindow.onFocusChanged(({ payload: focused }) => {
        if (!disposed) {
          setState((current) => ({ ...current, isFocused: focused }));
        }
        if (focused) {
          safeReconcile();
        }
      }),
    );

    return () => {
      disposed = true;
      mountedRef.current = false;
      unlisteners.forEach(unlistenSafely);
    };
  }, [appWindow, readWindowState]);

  const setDecorated = useCallback(
    async (decorated: boolean) => {
      await appWindow.setDecorations(decorated);
      if (mountedRef.current) {
        setState((current) => ({
          ...current,
          isDecorated: decorated,
          isReady: true,
        }));
      }
    },
    [appWindow],
  );

  const toggleMaximize = useCallback(async () => {
    await appWindow.toggleMaximize();
    await reconcile().catch((error) => {
      console.error("[WindowFrame] Failed to refresh maximized state", error);
    });
  }, [appWindow, reconcile]);

  return {
    ...state,
    close: useCallback(() => appWindow.close(), [appWindow]),
    minimize: useCallback(() => appWindow.minimize(), [appWindow]),
    reconcile,
    setDecorated,
    toggleMaximize,
  };
}
