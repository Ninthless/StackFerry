import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CcSwitchImportDialog } from "@/features/providers/CcSwitchImportDialog";
import type { CcSwitchImportPreview } from "@/platform/tauri/api/providers";

const preview: CcSwitchImportPreview = {
  token: "preview-token",
  sourcePath: "C:\\Users\\test\\AppData\\cc-switch.db",
  sourceVersion: 16,
  items: [
    {
      key: "claude:relay",
      appType: "claude",
      sourceId: "relay",
      name: "Relay",
      endpoint: "https://relay.example/v1",
      modelCount: 2,
      credentialState: "source",
      action: "add",
      selectable: true,
      reason: null,
    },
    {
      key: "opencode:omo",
      appType: "opencode",
      sourceId: "omo",
      name: "OMO",
      endpoint: "https://omo.example/v1",
      modelCount: 1,
      credentialState: "missing",
      action: "preserveLocal",
      selectable: false,
      reason: "StackFerry 中的配置已被本地修改",
    },
  ],
  summary: {
    total: 2,
    selectable: 1,
    added: 1,
    updated: 0,
    preserved: 1,
    attached: 0,
    invalid: 0,
  },
  warnings: [],
};

vi.mock("@/platform/tauri/api/providers", () => ({
  providersApi: {
    previewCcSwitchProviderImport: vi.fn(),
    applyCcSwitchProviderImport: vi.fn(),
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${Object.values(values).join(" ")}` : key,
  }),
}));

describe("CcSwitchImportDialog", () => {
  beforeEach(async () => {
    const { providersApi } = await import("@/platform/tauri/api/providers");
    vi.mocked(providersApi.previewCcSwitchProviderImport).mockResolvedValue(
      preview,
    );
    vi.mocked(providersApi.applyCcSwitchProviderImport).mockResolvedValue({
      imported: 1,
      added: 1,
      updated: 0,
      preserved: 0,
      attached: 0,
      skipped: 0,
      affectedApps: ["claude"],
      warnings: [],
    });
  });

  it("defaults to the current agent and can switch to all agents", async () => {
    const user = userEvent.setup();
    render(<CcSwitchImportDialog open appId="claude" onOpenChange={vi.fn()} />);

    expect(
      await screen.findByText("provider.ccSwitchImport.currentAgent"),
    ).toBeInTheDocument();
    expect(screen.getByText("Relay")).toBeInTheDocument();
    expect(screen.queryByText("OMO")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("tab", { name: "provider.ccSwitchImport.allAgents" }),
    );
    expect(await screen.findByText("OMO")).toBeInTheDocument();
  });

  it("applies only selected and selectable entries", async () => {
    const user = userEvent.setup();
    const { providersApi } = await import("@/platform/tauri/api/providers");
    render(<CcSwitchImportDialog open appId="claude" onOpenChange={vi.fn()} />);
    await screen.findByText("Relay");
    await user.click(
      screen.getByRole("button", { name: "provider.ccSwitchImport.apply" }),
    );
    await waitFor(() =>
      expect(providersApi.applyCcSwitchProviderImport).toHaveBeenCalledWith({
        token: "preview-token",
        keys: ["claude:relay"],
      }),
    );
  });
});
