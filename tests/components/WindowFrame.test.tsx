import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

const platformState = vi.hoisted(() => ({
  current: "windows" as "linux" | "macos" | "unknown" | "windows",
}));
const windowState = vi.hoisted(() => ({
  close: vi.fn(async () => undefined),
  isDecorated: false,
  isFocused: true,
  isFullscreen: false,
  isMaximized: false,
  isReady: true,
  minimize: vi.fn(async () => undefined),
  reconcile: vi.fn(async () => undefined),
  setDecorated: vi.fn(async () => undefined),
  toggleMaximize: vi.fn(async () => undefined),
}));
const toastError = vi.hoisted(() => vi.fn());
const reportFrontendError = vi.hoisted(() => vi.fn());
const getCurrentVersion = vi.hoisted(() => vi.fn(async () => "9.8.7"));

vi.mock("@/lib/platform", () => ({
  DRAG_REGION_ATTR: { "data-tauri-drag-region": true },
  isLinux: () => platformState.current === "linux",
  isMac: () => platformState.current === "macos",
  isWindows: () => platformState.current === "windows",
}));

vi.mock("@/app/shell/useWindowControls", () => ({
  useWindowControls: () => windowState,
}));

vi.mock("sonner", () => ({
  toast: { error: toastError },
}));

vi.mock("@/lib/frontendLogger", () => ({
  reportFrontendError,
}));

vi.mock("@/lib/updater", () => ({ getCurrentVersion }));

import { WindowFrame } from "@/app/shell/WindowFrame";
import { FrontendErrorBoundary } from "@/app/bootstrap/FrontendErrorBoundary";

function ThrowingChild(): React.ReactNode {
  throw new Error("render failed");
}

describe("WindowFrame", () => {
  beforeEach(() => {
    platformState.current = "windows";
    windowState.isDecorated = false;
    windowState.isFocused = true;
    windowState.isFullscreen = false;
    windowState.isMaximized = false;
  });

  it("renders Windows controls and delegates close through the window API", async () => {
    render(
      <WindowFrame>
        <div>content</div>
      </WindowFrame>,
    );

    expect(screen.getByTestId("window-titlebar")).toHaveAttribute(
      "data-platform",
      "windows",
    );
    expect(screen.getByText("content")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "header.windowClose" }));
    await waitFor(() => expect(windowState.close).toHaveBeenCalledOnce());
  });

  it("keeps window actions outside the explicit drag region", () => {
    render(<WindowFrame>content</WindowFrame>);

    const titlebar = screen.getByTestId("window-titlebar");
    const dragRegion = titlebar.querySelector("[data-tauri-drag-region]");
    const noDragRegion = titlebar.querySelector("[data-tauri-no-drag]");
    const buttons = screen.getAllByRole("button");

    expect(dragRegion).toBeInTheDocument();
    expect(noDragRegion).toBeInTheDocument();
    expect(screen.getByTestId("window-brand")).toHaveClass(
      "pointer-events-none",
    );
    buttons.forEach((button) => {
      expect(button.closest("[data-tauri-drag-region]")).toBeNull();
      expect(noDragRegion).toContainElement(button);
    });
  });

  it("places one compact brand at the left of the Windows titlebar", async () => {
    render(<WindowFrame>content</WindowFrame>);

    const titlebar = screen.getByTestId("window-titlebar");
    const brand = within(titlebar).getByTestId("window-brand");
    const wordmark = within(brand).getByText("StackFerry");
    const version = within(brand).getByTestId("window-version");
    expect(wordmark).toBeVisible();
    await waitFor(() => expect(version).toHaveTextContent("v9.8.7"));
    expect(wordmark.nextElementSibling).toBe(version);
    expect(brand.querySelectorAll("img")).toHaveLength(1);
    expect(
      brand.querySelector(".lucide-sliders-horizontal"),
    ).not.toBeInTheDocument();
    expect(brand).toHaveClass("pl-3");
    expect(brand).not.toHaveClass("pl-[78px]");

    const [minimize, maximize, close] = within(titlebar).getAllByRole("button");
    [minimize, maximize, close].forEach((button) => {
      expect(button).toHaveClass("h-8", "w-[46px]", "bg-transparent");
    });
    expect(minimize).toHaveClass("hover:bg-sidebar-hover");
    expect(maximize).toHaveClass("hover:bg-sidebar-hover");
    expect(close).toHaveClass("hover:bg-destructive");
  });

  it("updates the maximize control label, tooltip, and icon for restore", () => {
    const { rerender } = render(<WindowFrame>content</WindowFrame>);

    const maximize = screen.getByRole("button", {
      name: "header.windowMaximize",
    });
    expect(maximize).toHaveAttribute("title", "header.windowMaximize");
    expect(maximize.querySelector(".lucide-square")).toBeInTheDocument();

    windowState.isMaximized = true;
    rerender(<WindowFrame>content</WindowFrame>);

    const restore = screen.getByRole("button", {
      name: "header.windowRestore",
    });
    expect(restore).toHaveAttribute("title", "header.windowRestore");
    expect(restore.querySelector(".lucide-copy")).toBeInTheDocument();
  });

  it("reports window action failures and restores the controls", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    windowState.minimize.mockRejectedValueOnce(new Error("minimize failed"));

    render(<WindowFrame>content</WindowFrame>);

    const minimize = screen.getByRole("button", {
      name: "header.windowMinimize",
    });
    fireEvent.click(minimize);

    await waitFor(() => expect(toastError).toHaveBeenCalledOnce());
    await waitFor(() => expect(minimize).toBeEnabled());
    consoleError.mockRestore();
  });

  it("dims the titlebar when the window loses focus", () => {
    const { rerender } = render(<WindowFrame>content</WindowFrame>);
    const titlebar = screen.getByTestId("window-titlebar");

    expect(titlebar).not.toHaveClass("text-sidebar-foreground/60");

    windowState.isFocused = false;
    rerender(<WindowFrame>content</WindowFrame>);

    expect(titlebar).toHaveClass("text-sidebar-foreground/60");
  });

  it("keeps macOS native controls without rendering duplicate buttons", () => {
    platformState.current = "macos";
    windowState.isDecorated = true;

    render(<WindowFrame>content</WindowFrame>);

    expect(screen.getByTestId("window-titlebar")).toHaveAttribute(
      "data-platform",
      "macos",
    );
    expect(screen.getByTestId("window-brand")).toHaveClass("pl-[78px]");
    expect(screen.getAllByText("StackFerry")).toHaveLength(1);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("forces Linux app controls regardless of the legacy preference", async () => {
    platformState.current = "linux";
    windowState.isDecorated = true;
    const { rerender } = render(<WindowFrame>content</WindowFrame>);

    expect(screen.queryByTestId("window-titlebar")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(windowState.setDecorated).toHaveBeenCalledWith(false),
    );

    windowState.isDecorated = false;
    rerender(<WindowFrame>content</WindowFrame>);

    expect(screen.getByTestId("window-titlebar")).toHaveAttribute(
      "data-platform",
      "linux",
    );
  });

  it("removes custom chrome while the window is fullscreen", () => {
    windowState.isFullscreen = true;

    render(<WindowFrame>content</WindowFrame>);

    expect(screen.queryByTestId("window-titlebar")).not.toBeInTheDocument();
    expect(
      document.documentElement.style.getPropertyValue(
        "--window-titlebar-height",
      ),
    ).toBe("0px");
  });

  it("keeps window controls when application content crashes", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    render(
      <WindowFrame>
        <FrontendErrorBoundary>
          <ThrowingChild />
        </FrontendErrorBoundary>
      </WindowFrame>,
    );

    expect(screen.getByTestId("window-titlebar")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
