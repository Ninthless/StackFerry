import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer, PiMcpAdapterStatus } from "@/types";

const toggleMcpAppMock = vi.hoisted(() => vi.fn());
const bulkToggleMcpAppMock = vi.hoisted(() => vi.fn());
const installPiAdapterMock = vi.hoisted(() => vi.fn());
const refetchPiAdapterStatusMock = vi.hoisted(() => vi.fn());
const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

const hookState = vi.hoisted(() => ({
  status: undefined as PiMcpAdapterStatus | undefined,
  queryError: null as Error | null,
  servers: {} as Record<string, McpServer>,
  installPending: false,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}));

vi.mock("sonner", () => ({ toast: toastMocks }));

vi.mock("@/hooks/useMcp", () => ({
  useAllMcpServers: () => ({ data: hookState.servers, isLoading: false }),
  usePiMcpAdapterStatus: () => ({
    data: hookState.status,
    isLoading: false,
    error: hookState.queryError,
    refetch: refetchPiAdapterStatusMock,
  }),
  useInstallPiMcpAdapter: () => ({
    mutateAsync: installPiAdapterMock,
    isPending: hookState.installPending,
  }),
  useToggleMcpApp: () => ({ mutateAsync: toggleMcpAppMock }),
  useBulkToggleMcpApp: () => ({
    mutateAsync: bulkToggleMcpAppMock,
    isPending: false,
    variables: undefined,
  }),
  useDeleteMcpServer: () => ({ mutateAsync: vi.fn() }),
  useImportMcpFromApps: () => ({ mutateAsync: vi.fn() }),
}));

import UnifiedMcpPanel from "@/components/mcp/UnifiedMcpPanel";

describe("UnifiedMcpPanel Pi adapter status", () => {
  beforeEach(() => {
    hookState.status = undefined;
    hookState.queryError = null;
    hookState.servers = {};
    hookState.installPending = false;
    toggleMcpAppMock.mockReset();
    toggleMcpAppMock.mockResolvedValue(true);
    bulkToggleMcpAppMock.mockReset();
    bulkToggleMcpAppMock.mockResolvedValue({ succeeded: [], failed: [] });
    installPiAdapterMock.mockReset();
    refetchPiAdapterStatusMock.mockReset();
    toastMocks.success.mockReset();
    toastMocks.warning.mockReset();
    toastMocks.error.mockReset();
  });

  it("shows installed version, active counts, and project override", () => {
    hookState.status = {
      state: "installed",
      configuredVersion: "2.19.0",
      installedVersion: "2.19.0",
      configPath: "/home/test/.pi/agent/mcp.json",
      projectOverridePath: "/workspace/.pi/mcp.json",
      error: null,
      canInstall: false,
      canRepair: false,
      desiredServerCount: 2,
      projectedServerCount: 2,
    };

    render(<UnifiedMcpPanel />);

    expect(screen.getByText("mcp.piAdapter.label")).toHaveAttribute(
      "title",
      "/home/test/.pi/agent/mcp.json",
    );
    expect(screen.getByText(/mcp\.piAdapter\.effective/)).toHaveTextContent(
      "v2.19.0",
    );
    expect(screen.getByText(/mcp\.piAdapter\.counts/)).toHaveTextContent(
      '"desired":2',
    );
    expect(screen.getByText("mcp.piAdapter.projectOverride")).toHaveAttribute(
      "title",
      "/workspace/.pi/mcp.json",
    );
  });

  it("shows adapter configuration errors", () => {
    hookState.status = {
      state: "error",
      configuredVersion: null,
      installedVersion: null,
      configPath: "/home/test/.pi/agent/mcp.json",
      projectOverridePath: null,
      error: "adapter package is disabled",
      canInstall: false,
      canRepair: false,
      desiredServerCount: 1,
      projectedServerCount: 0,
    };

    render(<UnifiedMcpPanel />);

    expect(screen.getByText("mcp.piAdapter.error")).toBeInTheDocument();
    expect(screen.getByText("adapter package is disabled")).toBeInTheDocument();
  });

  it("confirms installation and keeps the dialog pending", async () => {
    hookState.status = {
      state: "uninstalled",
      configuredVersion: null,
      installedVersion: null,
      configPath: "/home/test/.pi/agent/mcp.json",
      projectOverridePath: null,
      error: null,
      canInstall: true,
      canRepair: false,
      desiredServerCount: 1,
      projectedServerCount: 0,
    };
    const view = render(<UnifiedMcpPanel />);

    fireEvent.click(
      screen.getByRole("button", { name: "mcp.piAdapter.install" }),
    );
    expect(screen.getByText("mcp.piAdapter.installTitle")).toBeInTheDocument();
    expect(
      screen.getByText("mcp.piAdapter.installMessage"),
    ).toBeInTheDocument();

    hookState.installPending = true;
    view.rerender(<UnifiedMcpPanel />);

    expect(
      screen.getByRole("button", { name: "common.cancel" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "mcp.piAdapter.installConfirm" }),
    ).toBeDisabled();
    expect(
      screen
        .getByRole("button", { name: "mcp.piAdapter.installConfirm" })
        .querySelector(".animate-spin"),
    ).not.toBeNull();
  });

  it("reports partial success when installation succeeds but projection fails", async () => {
    hookState.status = {
      state: "uninstalled",
      configuredVersion: null,
      installedVersion: null,
      configPath: "/home/test/.pi/agent/mcp.json",
      projectOverridePath: null,
      error: null,
      canInstall: true,
      canRepair: false,
      desiredServerCount: 1,
      projectedServerCount: 0,
    };
    installPiAdapterMock.mockResolvedValue({
      installed: true,
      projected: false,
      status: {
        ...hookState.status,
        state: "installed",
        configuredVersion: "latest",
        installedVersion: "2.19.0",
        canInstall: false,
      },
      error: "server id conflict",
    });
    render(<UnifiedMcpPanel />);

    fireEvent.click(
      screen.getByRole("button", { name: "mcp.piAdapter.install" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "mcp.piAdapter.installConfirm",
      }),
    );

    await waitFor(() => expect(installPiAdapterMock).toHaveBeenCalledTimes(1));
    expect(toastMocks.warning).toHaveBeenCalledWith(
      "mcp.piAdapter.projectionFailed",
      expect.objectContaining({ description: "server id conflict" }),
    );
  });

  it("does not offer installation for declared missing packages", () => {
    hookState.status = {
      state: "declaredMissing",
      configuredVersion: "latest",
      installedVersion: null,
      configPath: "/home/test/.pi/agent/mcp.json",
      projectOverridePath: null,
      error: "installed files are missing",
      canInstall: false,
      canRepair: false,
      desiredServerCount: 1,
      projectedServerCount: 0,
    };
    render(<UnifiedMcpPanel />);

    expect(
      screen.queryByRole("button", { name: "mcp.piAdapter.install" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "mcp.piAdapter.recheck" }),
    ).toBeInTheDocument();
    expect(screen.getByText("installed files are missing")).toBeInTheDocument();
  });

  it("offers safe cleanup and installation for legacy managed declarations", () => {
    hookState.status = {
      state: "declaredMissing",
      configuredVersion: "2.19.0",
      installedVersion: null,
      configPath: "/home/test/.pi/agent/mcp.json",
      projectOverridePath: null,
      error: null,
      canInstall: false,
      canRepair: true,
      desiredServerCount: 1,
      projectedServerCount: 0,
    };
    render(<UnifiedMcpPanel />);

    expect(
      screen.getByText("mcp.piAdapter.repairableMissingHint"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "mcp.piAdapter.repairInstall" }),
    ).toBeInTheDocument();
  });

  it("shows projected and desired counts when installed projection is incomplete", () => {
    hookState.status = {
      state: "installed",
      configuredVersion: "latest",
      installedVersion: "2.19.0",
      configPath: "/home/test/.pi/agent/mcp.json",
      projectOverridePath: null,
      error: null,
      canInstall: false,
      canRepair: false,
      desiredServerCount: 3,
      projectedServerCount: 1,
    };
    render(<UnifiedMcpPanel />);

    expect(
      screen.getByText(/mcp\.piAdapter\.projectionPending/),
    ).toHaveTextContent('"desired":3');
    expect(screen.getByText(/mcp\.piAdapter\.counts/)).toHaveTextContent(
      '"projected":1',
    );
  });

  it("toggles one matrix cell without a current application", async () => {
    hookState.servers = {
      "server-1": {
        id: "server-1",
        name: "Matrix Server",
        server: { type: "stdio", command: "matrix-server" },
        apps: {
          claude: true,
          codex: false,
          pi: true,
          gemini: false,
          grokbuild: false,
          opencode: false,
          openclaw: false,
          hermes: false,
        },
      },
    };

    render(<UnifiedMcpPanel />);

    expect(screen.getByRole("button", { name: "Pi" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "OpenClaw" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Claude" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Claude Desktop" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Codex" }));

    await waitFor(() => {
      expect(toggleMcpAppMock).toHaveBeenCalledWith({
        serverId: "server-1",
        app: "codex",
        enabled: true,
      });
    });
    expect(toggleMcpAppMock).toHaveBeenCalledTimes(1);
  });

  it("searches locally and bulk toggles the complete list", async () => {
    hookState.servers = {
      visible: {
        id: "visible",
        name: "Visible Needle",
        server: { type: "stdio", command: "visible-command" },
        apps: {
          claude: false,
          codex: false,
          pi: false,
          gemini: false,
          grokbuild: false,
          opencode: false,
          openclaw: false,
          hermes: false,
        },
      },
      hidden: {
        id: "hidden",
        name: "Hidden Server",
        server: { type: "stdio", command: "hidden-command" },
        apps: {
          claude: false,
          codex: false,
          pi: false,
          gemini: false,
          grokbuild: false,
          opencode: false,
          openclaw: false,
          hermes: false,
        },
      },
    };

    render(<UnifiedMcpPanel />);
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "mcp.unifiedPanel.searchAriaLabel",
      }),
      { target: { value: "visible needle" } },
    );

    expect(screen.getByText("Visible Needle")).toBeInTheDocument();
    expect(screen.queryByText("Hidden Server")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getAllByRole("checkbox", {
        name: /common\.enableAllForApp/,
      })[0],
    );

    await waitFor(() => {
      expect(bulkToggleMcpAppMock).toHaveBeenCalledWith({
        serverIds: ["visible", "hidden"],
        app: "claude",
        enabled: true,
      });
    });
  });
});
