import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ElectronMigrateDialog } from "@/app/overlays/ElectronMigrateDialog";
import {
  ELECTRON_DOWNLOAD_URL,
  ELECTRON_MIGRATE_DISMISSED_KEY,
} from "@/lib/electronMigrate";

const openExternal = vi.fn().mockResolvedValue(undefined);

vi.mock("@/platform/tauri/api", () => ({
  settingsApi: {
    openExternal: (...args: unknown[]) => openExternal(...args),
  },
}));

describe("ElectronMigrateDialog", () => {
  beforeEach(() => {
    openExternal.mockClear();
    localStorage.clear();
  });

  it("opens the Electron GitHub Latest download", async () => {
    render(<ElectronMigrateDialog />);
    fireEvent.click(
      screen.getByRole("button", { name: "electronMigrate.download" }),
    );
    await waitFor(() => {
      expect(openExternal).toHaveBeenCalledWith(ELECTRON_DOWNLOAD_URL);
    });
    expect(ELECTRON_DOWNLOAD_URL).toBe(
      "https://github.com/Ninthless/StackFerry/releases/latest",
    );
  });

  it("stays closed after the user postpones migration", () => {
    localStorage.setItem(ELECTRON_MIGRATE_DISMISSED_KEY, "1");
    render(<ElectronMigrateDialog />);
    expect(screen.queryByText("electronMigrate.title")).toBeNull();
  });

  it("persists postpone so the next launch stays quiet", () => {
    render(<ElectronMigrateDialog />);
    fireEvent.click(
      screen.getByRole("button", { name: "electronMigrate.later" }),
    );
    expect(localStorage.getItem(ELECTRON_MIGRATE_DISMISSED_KEY)).toBe("1");
  });
});
