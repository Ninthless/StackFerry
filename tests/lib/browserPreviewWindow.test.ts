import { createBrowserPreviewCommandHandler } from "@/lib/browserPreview";

describe("browser preview window commands", () => {
  it("models the frameless window state used by the custom titlebar", () => {
    const invoke = createBrowserPreviewCommandHandler();

    expect(invoke("plugin:window|is_decorated")).toBe(false);
    expect(invoke("plugin:window|is_fullscreen")).toBe(false);
    expect(invoke("plugin:window|is_maximized")).toBe(false);
    expect(invoke("plugin:window|minimize")).toBe(true);
    expect(invoke("plugin:window|toggle_maximize")).toBe(true);
    expect(invoke("plugin:window|close")).toBe(true);
  });
});
