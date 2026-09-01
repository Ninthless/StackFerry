import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer, PiMcpAdapterStatus } from "@/shared/contracts";

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
  togglePending: false,
  bulkPending: false,
  deletePending: false,
  importPending: false,
  adapterQueryEnabled: true,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}));

vi.mock("sonner", () => ({ toast: toastMocks }));

vi.mock("@/features/mcp/model/useMcp", () => ({
  useAllMcpServers: () => ({ data: hookState.servers, isLoading: false }),
  usePiMcpAdapterStatus: (_projectDir?: string, enabled = true) => {
    hookState.adapterQueryEnabled = enabled;
    return {
      data: enabled ? hookState.status : undefined,
      isLoading: false,
      error: enabled ? hookState.queryError : null,
      refetch: refetchPiAdapterStatusMock,
    };
  },
  useInstallPiMcpAdapter: () => ({
    mutateAsync: installPiAdapterMock,
    isPending: hookState.installPending,
  }),
  useToggleMcpApp: () => ({
    mutateAsync: toggleMcpAppMock,
    isPending: hookState.togglePending,
  }),
  useBulkToggleMcpApp: () => ({
    mutateAsync: bulkToggleMcpAppMock,
    isPending: hookState.bulkPending,
    variables: undefined,
  }),
  useDeleteMcpServer: () => ({
    mutateAsync: vi.fn(),
    isPending: hookState.deletePending,
  }),
  useImportMcpFromApps: () => ({
    mutateAsync: vi.fn(),
    isPending: hookState.importPending,
  }),
}));

import UnifiedMcpPanel from "@/features/mcp/UnifiedMcpPanel";

describe("UnifiedMcpPanel Pi adapter status", () => {
  beforeEach(() => {
    hookState.status = undefined;
    hookState.queryError = null;
    hookState.servers = {};
    hookState.installPending = false;
    hookState.togglePending = false;
    hookState.bulkPending = false;
    hookState.deletePending = false;
    hookState.importPending = false;
    hookState.adapterQueryEnabled = true;
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

    render(<UnifiedMcpPanel activeApp="pi" />);

    expect(screen.getByText("mcp.piAdapter.label")).toHaveAttribute(
      "title",
      "/home/test/.pi/agent/mcp.json",
    );
    expect(screen.getByText("mcp.piAdapter.effective")).toBeInTheDocument();
    expect(
      screen.getByText(/mcp\.piAdapter\.configuredVersion/),
    ).toHaveTextContent("2.19.0");
    expect(
      screen.getByText(/mcp\.piAdapter\.installedVersion/),
    ).toHaveTextContent("2.19.0");
    expect(screen.getByText(/mcp\.piAdapter\.counts/)).toHaveTextContent(
      '"desired":2',
    );
    expect(screen.getByText("mcp.piAdapter.projectOverride")).toHaveAttribute(
      "title",
      "/workspace/.pi/mcp.json",
    );
  });

  it("only enables and renders the Pi adapter for the Pi supplier", () => {
    hookState.status = {
      state: "error",
      configuredVersion: null,
      installedVersion: null,
      configPath: "/home/test/.pi/agent/mcp.json",
      projectOverridePath: null,
      error: "adapter unavailable",
      canInstall: false,
      canRepair: false,
      desiredServerCount: 1,
      projectedServerCount: 0,
    };

    const view = render(<UnifiedMcpPanel activeApp="claude" />);

    expect(hookState.adapterQueryEnabled).toBe(false);
    expect(screen.queryByText("mcp.piAdapter.label")).not.toBeInTheDocument();
    expect(
      screen.getByText("mcp.summary.attention").nextSibling,
    ).toHaveTextContent("0");

    view.rerender(<UnifiedMcpPanel activeApp="pi" />);

    expect(hookState.adapterQueryEnabled).toBe(true);
    expect(screen.getByText("mcp.piAdapter.label")).toBeInTheDocument();
    expect(
      screen.getByText("mcp.summary.attention").nextSibling,
    ).toHaveTextContent("1");
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

    render(<UnifiedMcpPanel activeApp="pi" />);

    expect(screen.getByText("mcp.piAdapter.error")).toBeInTheDocument();
    expect(screen.getByText("adapter package is disabled")).toHaveAttribute(
      "title",
      "adapter package is disabled",
    );
  });

  it.each([
    ["uninstalled", "mcp.piAdapter.uninstalled", true],
    ["declaredMissing", "mcp.piAdapter.declaredMissing", false],
    ["installed", "mcp.piAdapter.effective", false],
    ["incompatible", "mcp.piAdapter.incompatible", false],
    ["error", "mcp.piAdapter.error", false],
  ] as const)("shows the %s adapter state", (state, label, canInstall) => {
    hookState.status = {
      state,
      configuredVersion: state === "installed" ? "latest" : null,
      installedVersion: state === "installed" ? "2.19.0" : null,
      configPath: "/home/test/.pi/agent/mcp.json",
      projectOverridePath: null,
      error: state === "error" ? "adapter error" : null,
      canInstall,
      canRepair: false,
      desiredServerCount: state === "installed" ? 1 : 0,
      projectedServerCount: state === "installed" ? 1 : 0,
    };

    render(<UnifiedMcpPanel activeApp="pi" />);

    expect(screen.getByText(label)).toBeInTheDocument();
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
    const view = render(<UnifiedMcpPanel activeApp="pi" />);

    fireEvent.click(
      screen.getByRole("button", { name: "mcp.piAdapter.install" }),
    );
    expect(screen.getByText("mcp.piAdapter.installTitle")).toBeInTheDocument();
    expect(
      screen.getByText("mcp.piAdapter.installMessage"),
    ).toBeInTheDocument();

    hookState.installPending = true;
    view.rerender(<UnifiedMcpPanel activeApp="pi" />);

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
    render(<UnifiedMcpPanel activeApp="pi" />);

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
    render(<UnifiedMcpPanel activeApp="pi" />);

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
    render(<UnifiedMcpPanel activeApp="pi" />);

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
    render(<UnifiedMcpPanel activeApp="pi" />);

    expect(
      screen.getByText(/mcp\.piAdapter\.projectionPending/),
    ).toHaveTextContent('"desired":3');
    expect(screen.getByText(/mcp\.piAdapter\.counts/)).toHaveTextContent(
      '"projected":1',
    );
  });

  it("renders matrix headers and toggles one accessible cell", async () => {
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

    render(<UnifiedMcpPanel activeApp="pi" />);

    expect(
      screen.getByRole("table", { name: "mcp.matrix.label" }),
    ).toBeInTheDocument();
    const matrix = screen.getByRole("table", { name: "mcp.matrix.label" });
    expect(matrix).toHaveTextContent("Claude");
    expect(matrix).toHaveTextContent("Codex");
    expect(matrix).toHaveTextContent("Pi");
    expect(matrix).toHaveTextContent("Gemini");
    expect(matrix).toHaveTextContent("Grok Build");
    expect(matrix).toHaveTextContent("OpenCode");
    expect(matrix).toHaveTextContent("Hermes");
    expect(screen.queryByText("OpenClaw")).not.toBeInTheDocument();
    expect(screen.queryByText("Claude Desktop")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /mcp\.matrix\.cellLabel.*Matrix Server.*Codex/,
      }),
    );

    await waitFor(() => {
      expect(toggleMcpAppMock).toHaveBeenCalledWith({
        serverId: "server-1",
        app: "codex",
        enabled: true,
      });
    });
    expect(toggleMcpAppMock).toHaveBeenCalledTimes(1);
  });

  it("constrains long server paths to the identity column", () => {
    const longPath =
      "C:\\Users\\ninth\\AppData\\Local\\OpenAI\\Codex\\runtimes\\cua_node\\f8d2abcb7481383b\\bin\\node_repl.exe";
    hookState.servers = {
      node_repl: {
        id: "node_repl",
        name: "node_repl",
        server: { type: "stdio", command: longPath },
        apps: {
          claude: false,
          codex: true,
          pi: false,
          gemini: false,
          grokbuild: false,
          opencode: false,
          openclaw: false,
          hermes: false,
        },
      },
    };

    const { container } = render(<UnifiedMcpPanel activeApp="codex" />);
    const source = container.querySelector(".mcp-server-source");

    expect(source).toHaveClass("min-w-0", "flex-1", "truncate");
    expect(source).not.toHaveClass("shrink-0");
    expect(source).toHaveAttribute("title", longPath);
    expect(source?.closest(".mcp-server-identity-content")).toBeInTheDocument();
  });

  it("searches locally and bulk toggles only the filtered servers", async () => {
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

    render(<UnifiedMcpPanel activeApp="pi" />);
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "mcp.unifiedPanel.searchAriaLabel",
      }),
      { target: { value: "visible needle" } },
    );

    expect(screen.getAllByText("Visible Needle")).toHaveLength(2);
    expect(screen.queryByText("Hidden Server")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /mcp\.matrix\.enableFiltered.*Claude/,
      }),
    );

    await waitFor(() => {
      expect(bulkToggleMcpAppMock).toHaveBeenCalledWith({
        serverIds: ["visible"],
        app: "claude",
        enabled: true,
      });
    });
    expect(
      screen.queryByText(/mcp\.matrix\.filteredScope/),
    ).not.toBeInTheDocument();
  });

  it("combines projection and client filters before column bulk actions", async () => {
    hookState.servers = {
      target: {
        id: "target",
        name: "Target Server",
        source: "workspace-target",
        server: { type: "stdio", command: "target-command" },
        apps: {
          claude: true,
          codex: false,
          pi: false,
          gemini: false,
          grokbuild: false,
          opencode: false,
          openclaw: false,
          hermes: false,
        },
      },
      otherProjected: {
        id: "other-projected",
        name: "Other Projected",
        server: { type: "stdio", command: "other-command" },
        apps: {
          claude: false,
          codex: true,
          pi: false,
          gemini: false,
          grokbuild: false,
          opencode: false,
          openclaw: false,
          hermes: false,
        },
      },
      unprojected: {
        id: "unprojected",
        name: "Unprojected",
        server: { type: "stdio", command: "unprojected-command" },
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

    render(<UnifiedMcpPanel activeApp="pi" />);
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "mcp.unifiedPanel.searchAriaLabel",
      }),
      { target: { value: "workspace-target" } },
    );
    fireEvent.click(
      screen.getByRole("combobox", { name: "mcp.filters.status" }),
    );
    fireEvent.click(
      screen.getByRole("option", { name: "mcp.filters.projected" }),
    );
    fireEvent.click(
      screen.getByRole("combobox", { name: "mcp.filters.client" }),
    );
    fireEvent.click(
      screen.getByRole("option", {
        name: "mcp.unifiedPanel.apps.claude",
      }),
    );

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /mcp\.matrix\.enableFiltered.*Codex.*"count":1/,
      }),
    );

    await waitFor(() => {
      expect(bulkToggleMcpAppMock).toHaveBeenCalledWith({
        serverIds: ["target"],
        app: "codex",
        enabled: true,
      });
    });
    expect(
      screen.queryByText(/mcp\.matrix\.filteredScope/),
    ).not.toBeInTheDocument();
  });

  it("disables matrix controls while a projection mutation is pending", () => {
    hookState.togglePending = true;
    hookState.servers = {
      "server-1": {
        id: "server-1",
        name: "Pending Server",
        server: { type: "stdio", command: "pending-server" },
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

    render(<UnifiedMcpPanel activeApp="pi" />);

    expect(
      screen.getByRole("checkbox", {
        name: /mcp\.matrix\.cellLabel.*Pending Server.*Claude/,
      }),
    ).toBeDisabled();
    expect(
      screen
        .getAllByRole("button", { name: "common.moreActions" })
        .filter((button) => button.hasAttribute("disabled")),
    ).toHaveLength(2);
  });

  it("exposes narrow detail and page overflow containment hooks", () => {
    hookState.servers = {
      "server-1": {
        id: "server-1",
        name: "Responsive Server",
        server: { type: "stdio", command: "responsive-server" },
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
    hookState.status = {
      state: "error",
      configuredVersion: null,
      installedVersion: null,
      configPath: "/home/test/.pi/agent/mcp.json",
      projectOverridePath: null,
      error: "a very long adapter error",
      canInstall: false,
      canRepair: false,
      desiredServerCount: 1,
      projectedServerCount: 0,
    };

    const { container } = render(<UnifiedMcpPanel activeApp="pi" />);

    expect(
      container.querySelector('[data-layout="no-page-horizontal-scroll"]'),
    ).toHaveClass("mcp-compact-list");
    expect(
      container.querySelector('[data-layout="local-horizontal-scroll"]'),
    ).toHaveClass("mcp-matrix-scroll", "container-scroll-x");
    expect(container.querySelector(".mcp-matrix-sticky")).toBeInTheDocument();
    expect(
      container.querySelector(".mcp-compact-detail"),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(".pi-projection-health-actions"),
    ).toContainElement(
      screen.getByRole("button", { name: "mcp.piAdapter.recheck" }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /mcp\.matrix\.toggleDetails.*Responsive Server/,
      }),
    );

    expect(
      screen.getByRole("region", {
        name: /mcp\.matrix\.detailsLabel.*Responsive Server/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("checkbox", {
        name: /mcp\.matrix\.cellLabel.*Responsive Server.*Pi/,
      }),
    ).toHaveLength(2);
    expect(container.querySelector(".mcp-compact-detail")).toBeInTheDocument();
  });
});
