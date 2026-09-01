import { act, renderHook, waitFor } from "@testing-library/react";
import { getTauriWindowMock } from "../msw/tauriMocks";
import { useWindowControls } from "@/app/shell/useWindowControls";

const tauriWindowMock = getTauriWindowMock();

describe("useWindowControls", () => {
  beforeEach(() => {
    tauriWindowMock.close.mockResolvedValue(undefined);
    tauriWindowMock.isDecorated.mockResolvedValue(false);
    tauriWindowMock.isFullscreen.mockResolvedValue(false);
    tauriWindowMock.isMaximized.mockResolvedValue(true);
    tauriWindowMock.minimize.mockResolvedValue(undefined);
    tauriWindowMock.onFocusChanged.mockResolvedValue(() => undefined);
    tauriWindowMock.onResized.mockResolvedValue(() => undefined);
    tauriWindowMock.onScaleChanged.mockResolvedValue(() => undefined);
    tauriWindowMock.setDecorations.mockResolvedValue(undefined);
    tauriWindowMock.toggleMaximize.mockResolvedValue(undefined);
  });

  it("reconciles window state and refreshes after its own maximize action", async () => {
    const { result } = renderHook(() => useWindowControls());

    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.isDecorated).toBe(false);
    expect(result.current.isMaximized).toBe(true);

    tauriWindowMock.isMaximized.mockResolvedValue(false);
    await act(async () => {
      await result.current.toggleMaximize();
    });

    expect(tauriWindowMock.toggleMaximize).toHaveBeenCalledOnce();
    expect(result.current.isMaximized).toBe(false);
  });

  it("reconciles on resize and focus regain", async () => {
    let resized: (() => void) | undefined;
    let focusChanged: ((event: { payload: boolean }) => void) | undefined;
    tauriWindowMock.onResized.mockImplementation(async (handler) => {
      resized = handler as () => void;
      return () => undefined;
    });
    tauriWindowMock.onFocusChanged.mockImplementation(async (handler) => {
      focusChanged = handler as (event: { payload: boolean }) => void;
      return () => undefined;
    });

    const { result } = renderHook(() => useWindowControls());
    await waitFor(() => expect(result.current.isReady).toBe(true));

    tauriWindowMock.isMaximized.mockResolvedValue(false);
    act(() => resized?.());
    await waitFor(() => expect(result.current.isMaximized).toBe(false));

    act(() => focusChanged?.({ payload: false }));
    expect(result.current.isFocused).toBe(false);
    act(() => focusChanged?.({ payload: true }));
    await waitFor(() => expect(result.current.isFocused).toBe(true));
  });

  it("unsubscribes when registration resolves after unmount", async () => {
    const unlistenResize = vi.fn();
    let resolveResize: ((unlisten: () => void) => void) | undefined;
    tauriWindowMock.onResized.mockReturnValue(
      new Promise((resolve) => {
        resolveResize = resolve;
      }),
    );

    const { unmount } = renderHook(() => useWindowControls());
    unmount();

    await act(async () => {
      resolveResize?.(unlistenResize);
      await Promise.resolve();
    });

    expect(unlistenResize).toHaveBeenCalledOnce();
  });

  it("contains asynchronous listener cleanup failures", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const cleanupError = new Error("listener already removed");
    const unlistenResize = vi.fn(
      () => Promise.reject(cleanupError) as unknown as void,
    );
    tauriWindowMock.onResized.mockResolvedValue(unlistenResize);

    const { unmount } = renderHook(() => useWindowControls());
    await waitFor(() => expect(tauriWindowMock.onResized).toHaveBeenCalled());
    unmount();

    await waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        "[WindowFrame] Failed to unsubscribe from window state",
        cleanupError,
      ),
    );
    consoleError.mockRestore();
  });
});
