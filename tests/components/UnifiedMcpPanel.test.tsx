import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer, PiMcpAdapterStatus } from "@/types";

const toggleMcpAppMock = vi.hoisted(() => vi.fn());

const hookState = vi.hoisted(() => ({
  status: undefined as PiMcpAdapterStatus | undefined,
  queryError: null as Error | null,
  servers: {} as Record<string, McpServer>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/hooks/useMcp", () => ({
  useAllMcpServers: () => ({ data: hookState.servers, isLoading: false }),
  usePiMcpAdapterStatus: () => ({
    data: hookState.status,
    isLoading: false,
    error: hookState.queryError,
  }),
  useToggleMcpApp: () => ({ mutateAsync: toggleMcpAppMock }),
  useDeleteMcpServer: () => ({ mutateAsync: vi.fn() }),
  useImportMcpFromApps: () => ({ mutateAsync: vi.fn() }),
}));

import UnifiedMcpPanel from "@/components/mcp/UnifiedMcpPanel";

describe("UnifiedMcpPanel Pi adapter status", () => {
  beforeEach(() => {
    hookState.status = undefined;
    hookState.queryError = null;
    hookState.servers = {};
    toggleMcpAppMock.mockReset();
    toggleMcpAppMock.mockResolvedValue(true);
  });

  it("shows the installed version and project override", () => {
    hookState.status = {
      state: "installed",
      configuredVersion: "2.19.0",
      installedVersion: "2.19.0",
      configPath: "/home/test/.pi/agent/mcp.json",
      projectOverridePath: "/workspace/.pi/mcp.json",
      error: null,
    };

    render(<UnifiedMcpPanel onOpenChange={vi.fn()} />);

    expect(screen.getByText("mcp.piAdapter.label")).toHaveAttribute(
      "title",
      "/home/test/.pi/agent/mcp.json",
    );
    expect(screen.getByText(/mcp\.piAdapter\.installed/)).toHaveTextContent(
      "v2.19.0",
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
    };

    render(<UnifiedMcpPanel onOpenChange={vi.fn()} />);

    expect(screen.getByText("mcp.piAdapter.error")).toBeInTheDocument();
    expect(screen.getByText("adapter package is disabled")).toBeInTheDocument();
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

    render(<UnifiedMcpPanel onOpenChange={vi.fn()} />);

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
});
