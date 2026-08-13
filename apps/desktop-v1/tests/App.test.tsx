import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import {
  createMemoryHistory,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { router } from "../src/renderer/router";
import type { WorkspaceSnapshot } from "../src/shared/contracts";

const workspace: WorkspaceSnapshot = {
  agents: [
    {
      id: "codex",
      name: "Codex",
      installed: true,
      configPath: "C:\\Users\\user\\.codex\\config.toml",
      version: null,
      health: "healthy",
      capabilities: {
        mcp: "managed",
        providers: "core",
        skills: "managed",
        prompts: "managed",
        sessions: "import-only",
      },
    },
  ],
  mcpServers: [
    {
      id: "context7",
      resourceId: "codex:context7",
      name: "context7",
      sourceAgent: "codex",
      ownership: "discovered",
      transport: {
        type: "http",
        url: "https://example.com/mcp",
        headers: {},
      },
    },
    {
      id: "local-tools",
      resourceId: "codex:local-tools",
      name: "local-tools",
      sourceAgent: "codex",
      ownership: "discovered",
      transport: {
        type: "stdio",
        command: "npx",
        args: ["-y", "@example/mcp"],
        cwd: null,
        env: {},
      },
    },
  ],
  prompts: [],
  scannedAt: "2026-08-13T00:00:00.000Z",
};

function renderApp() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  router.update({
    history: createMemoryHistory({ initialEntries: ["/library/mcp"] }),
  });
  return render(
    <MantineProvider>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe("App", () => {
  it("loads, filters, selects, and refreshes MCP servers through preload", async () => {
    const refreshWorkspace = vi.fn().mockResolvedValue(workspace);
    const previewMcpDeployment = vi.fn().mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      agentId: "codex",
      capability: "mcp",
      createdAt: "2026-08-13T00:00:00.000Z",
      expiresAt: "2026-08-13T00:10:00.000Z",
      changes: [
        {
          path: "config.toml",
          beforeHash: "before",
          before: "",
          after: "[mcp_servers.local]",
        },
      ],
    });
    const applyDeployment = vi.fn().mockResolvedValue({
      deploymentId: "22222222-2222-4222-8222-222222222222",
      previewId: "11111111-1111-4111-8111-111111111111",
      status: "applied",
      appliedAt: "2026-08-13T00:00:00.000Z",
    });
    window.stackferry = {
      getWorkspace: vi.fn().mockResolvedValue(workspace),
      refreshWorkspace,
      previewMcpDeployment,
      previewPromptDeployment: vi.fn(),
      applyDeployment,
    };
    renderApp();

    expect((await screen.findAllByText("context7")).length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        "/library/mcp/codex%3Acontext7",
      ),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "搜索 MCP" }), {
      target: { value: "local" },
    });
    expect(screen.queryByText("context7")).not.toBeInTheDocument();
    expect(screen.getAllByText("local-tools")).toHaveLength(2);
    expect(screen.getByText(/@example\/mcp/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重新扫描" }));
    await waitFor(() => expect(refreshWorkspace).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "预览应用" }));
    expect(await screen.findByText("确认配置变更")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认应用" }));
    await waitFor(() =>
      expect(applyDeployment).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
      ),
    );
  });
});
