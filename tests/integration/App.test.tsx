import { Suspense, type ComponentType } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { providersApi } from "@/lib/api/providers";
import { supportsCapability } from "@/config/appConfig";
import {
  resetProviderState,
  setCurrentProviderId,
  setLiveProviderIds,
  setProviders,
} from "../msw/state";
import { emitTauriEvent } from "../msw/tauriMocks";
import { AnnouncementProvider } from "@/contexts/AnnouncementContext";

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const SESSION_PROVIDER_FILTER_STORAGE_KEY =
  "stackferry.sessions.providerFilter";
const PROMPT_APP_STORAGE_KEY = "stackferry.prompts.app";
const LEGACY_SKILLS_TARGET_APP_STORAGE_KEY = "stackferry.skills.targetApp";
const ROUTE_APP_STORAGE_KEY = "stackferry-last-app";
const VIEW_STORAGE_KEY = "stackferry-last-view";

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

vi.mock("@/components/providers/ProviderList", () => ({
  ProviderList: ({
    providers,
    currentProviderId,
    onSwitch,
    onEdit,
    onDuplicate,
    onConfigureUsage,
    onOpenWebsite,
    onCreate,
  }: any) => (
    <div>
      <div data-testid="provider-list">{JSON.stringify(providers)}</div>
      <div data-testid="current-provider">{currentProviderId}</div>
      <button onClick={() => onSwitch(providers[currentProviderId])}>
        switch
      </button>
      <button onClick={() => onEdit(providers[currentProviderId])}>edit</button>
      <button onClick={() => onDuplicate(providers[currentProviderId])}>
        duplicate
      </button>
      <button onClick={() => onConfigureUsage(providers[currentProviderId])}>
        usage
      </button>
      <button onClick={() => onOpenWebsite("https://example.com")}>
        open-website
      </button>
      <button onClick={() => onCreate?.()}>create</button>
    </div>
  ),
}));

vi.mock("@/components/providers/AddProviderDialog", () => ({
  AddProviderDialog: ({ open, onOpenChange, onSubmit, appId }: any) =>
    open ? (
      <div data-testid="add-provider-dialog">
        <button
          onClick={() =>
            onSubmit({
              name: `New ${appId} Provider`,
              settingsConfig: {},
              category: "custom",
              sortIndex: 99,
            })
          }
        >
          confirm-add
        </button>
        <button onClick={() => onOpenChange(false)}>close-add</button>
      </div>
    ) : null,
}));

vi.mock("@/components/providers/EditProviderDialog", () => ({
  EditProviderDialog: ({ open, provider, onSubmit, onOpenChange }: any) =>
    open ? (
      <div data-testid="edit-provider-dialog">
        <button
          onClick={() =>
            onSubmit({
              provider: {
                ...provider,
                name: `${provider.name}-edited`,
              },
              originalId: provider.id,
            })
          }
        >
          confirm-edit
        </button>
        <button onClick={() => onOpenChange(false)}>close-edit</button>
      </div>
    ) : null,
}));

vi.mock("@/components/UsageScriptModal", () => ({
  default: ({ isOpen, provider, appId, onSave, onClose }: any) =>
    isOpen ? (
      <div data-testid="usage-modal">
        <span data-testid="usage-provider">{provider?.id}</span>
        <span data-testid="usage-app">{appId}</span>
        <button onClick={() => onSave("script-code")}>save-script</button>
        <button onClick={() => onClose()}>close-usage</button>
      </div>
    ) : null,
}));

vi.mock("@/components/ConfirmDialog", () => ({
  ConfirmDialog: ({ isOpen, onConfirm, onCancel }: any) =>
    isOpen ? (
      <div data-testid="confirm-dialog">
        <button onClick={() => onConfirm()}>confirm-delete</button>
        <button onClick={() => onCancel()}>cancel-delete</button>
      </div>
    ) : null,
}));

vi.mock("@/components/AppSwitcher", () => ({
  AppSwitcher: ({ activeApp, onSwitch }: any) => (
    <div data-testid="app-switcher">
      <span>{activeApp}</span>
      <button onClick={() => onSwitch("claude")}>switch-claude</button>
      <button onClick={() => onSwitch("claude-desktop")}>
        switch-claude-desktop
      </button>
      <button onClick={() => onSwitch("codex")}>switch-codex</button>
      <button onClick={() => onSwitch("pi")}>switch-pi</button>
      <button onClick={() => onSwitch("gemini")}>switch-gemini</button>
      <button onClick={() => onSwitch("grokbuild")}>switch-grokbuild</button>
      <button onClick={() => onSwitch("opencode")}>switch-opencode</button>
      <button onClick={() => onSwitch("openclaw")}>switch-openclaw</button>
      <button onClick={() => onSwitch("hermes")}>switch-hermes</button>
    </div>
  ),
}));

vi.mock("@/components/UpdateBadge", () => ({
  UpdateBadge: ({ onClick }: any) => (
    <button onClick={onClick}>update-badge</button>
  ),
}));

vi.mock("@/components/pi/PiExtensionsPanel", () => ({
  default: ({ requestedMode, onPageStateChange }: any) => (
    <div data-testid="pi-extensions-panel">
      <span>{requestedMode}</span>
      <button
        type="button"
        onClick={() =>
          onPageStateChange({
            mode: "detail",
            name: "Local One",
            resourceType: "extension",
          })
        }
      >
        open-pi-extension-detail
      </button>
    </div>
  ),
}));

vi.mock("@/components/settings/ThemeSettings", () => ({
  ThemeSettings: () => null,
}));

vi.mock("@/components/mcp/McpPanel", () => ({
  default: ({ open, onOpenChange }: any) =>
    open ? (
      <div data-testid="mcp-panel">
        <button onClick={() => onOpenChange(false)}>close-mcp</button>
      </div>
    ) : (
      <button onClick={() => onOpenChange(true)}>open-mcp</button>
    ),
}));

const renderApp = (AppComponent: ComponentType) => {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <AnnouncementProvider>
        <Suspense fallback={<div data-testid="loading">loading</div>}>
          <AppComponent />
        </Suspense>
      </AnnouncementProvider>
    </QueryClientProvider>,
  );
};

describe("App integration with MSW", () => {
  beforeEach(() => {
    resetProviderState();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    Element.prototype.scrollIntoView = vi.fn();
    window.localStorage.removeItem(SESSION_PROVIDER_FILTER_STORAGE_KEY);
    window.localStorage.removeItem(PROMPT_APP_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_SKILLS_TARGET_APP_STORAGE_KEY);
    window.localStorage.removeItem(ROUTE_APP_STORAGE_KEY);
    window.localStorage.removeItem(VIEW_STORAGE_KEY);
  });

  it("normalizes an application-incompatible persisted view", async () => {
    window.localStorage.setItem(ROUTE_APP_STORAGE_KEY, "codex");
    window.localStorage.setItem(VIEW_STORAGE_KEY, "openclawAgents");

    const { default: App } = await import("@/App");
    renderApp(App);

    await waitFor(() =>
      expect(screen.getByTestId("provider-list")).toHaveTextContent("codex-1"),
    );
    expect(window.localStorage.getItem(VIEW_STORAGE_KEY)).toBe("providers");
  }, 30_000);

  it("covers basic provider flows via real hooks", async () => {
    const { default: App } = await import("@/App");
    renderApp(App);

    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toContain(
        "claude-1",
      ),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "firstRunNotice.confirm" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "firstRunNotice.title" }),
      ).not.toBeInTheDocument(),
    );

    expect(screen.getAllByTestId("app-switcher")).toHaveLength(1);
    expect(screen.queryByText("StackFerry")).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("complementary")).getByRole("button", {
        name: "Routing activity",
      }),
    ).toBeVisible();

    fireEvent.click(screen.getByText("switch-codex"));
    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toContain(
        "codex-1",
      ),
    );
    expect(
      within(screen.getByRole("complementary")).getByRole("button", {
        name: "Routing activity",
      }),
    ).toBeVisible();

    fireEvent.click(screen.getByText("usage"));
    expect(screen.getByTestId("usage-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByText("save-script"));
    fireEvent.click(screen.getByText("close-usage"));

    fireEvent.click(screen.getByText("create"));
    expect(screen.getByTestId("add-provider-dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByText("confirm-add"));
    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toMatch(
        /New codex Provider/,
      ),
    );

    fireEvent.click(screen.getByText("edit"));
    expect(screen.getByTestId("edit-provider-dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByText("confirm-edit"));
    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toMatch(
        /-edited/,
      ),
    );

    fireEvent.click(screen.getByText("switch"));
    fireEvent.click(screen.getByText("duplicate"));
    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toMatch(/copy/),
    );

    fireEvent.click(screen.getByText("open-website"));

    emitTauriEvent("provider-switched", {
      appType: "codex",
      providerId: "codex-2",
    });

    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalled();
  }, 60_000);

  it("shows application switching only on the provider routing view", async () => {
    const { default: App } = await import("@/App");
    renderApp(App);

    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toContain(
        "claude-1",
      ),
    );

    const firstRunConfirm = await screen.findByRole("button", {
      name: "firstRunNotice.confirm",
    });
    fireEvent.click(firstRunConfirm);
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "firstRunNotice.title" }),
      ).not.toBeInTheDocument(),
    );

    let pageHeader = screen.getByRole("banner");
    const sidebar = screen.getByRole("complementary");
    expect(within(sidebar).getByTestId("app-switcher")).toBeVisible();
    expect(
      within(pageHeader).queryByTestId("app-switcher"),
    ).not.toBeInTheDocument();
    expect(
      within(pageHeader).getByRole("heading", { name: "provider.title" }),
    ).toBeVisible();
    expect(
      within(pageHeader).getByRole("button", { name: "provider.addProvider" }),
    ).toBeVisible();
    expect(
      within(pageHeader).queryByText("shell.directMode"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(screen.getByRole("complementary")).getByRole("button", {
        name: "common.settings",
      }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("banner")).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("tablist", { name: "common.settings" }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("settings.title")).not.toBeInTheDocument();
    expect(screen.queryByText("settings.description")).not.toBeInTheDocument();

    fireEvent.click(
      within(screen.getByRole("complementary")).getByRole("button", {
        name: "provider.title",
      }),
    );

    await waitFor(() => {
      pageHeader = screen.getByRole("banner");
      expect(within(sidebar).getByTestId("app-switcher")).toBeVisible();
      expect(
        within(pageHeader).queryByTestId("app-switcher"),
      ).not.toBeInTheDocument();
    });
  }, 30_000);

  it("keeps the session filter independent from provider route switching", async () => {
    const { default: App } = await import("@/App");
    renderApp(App);

    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toContain(
        "claude-1",
      ),
    );

    const firstRunConfirm = screen.queryByRole("button", {
      name: "firstRunNotice.confirm",
    });
    if (firstRunConfirm) {
      fireEvent.click(firstRunConfirm);
      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "firstRunNotice.title" }),
        ).not.toBeInTheDocument(),
      );
    }

    fireEvent.click(
      within(screen.getByRole("complementary")).getByRole("button", {
        name: "Sessions",
      }),
    );

    const filter = await screen.findByRole("combobox", {
      name: /会话供应商/i,
    });
    await userEvent.click(filter);
    await userEvent.click(
      await screen.findByRole("option", { name: /Codex/i }),
    );
    await waitFor(() =>
      expect(
        window.localStorage.getItem(SESSION_PROVIDER_FILTER_STORAGE_KEY),
      ).toBe("codex"),
    );

    fireEvent.click(
      within(screen.getByRole("complementary")).getByRole("button", {
        name: "provider.title",
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("app-switcher")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText("switch-pi"));

    fireEvent.click(
      within(screen.getByRole("complementary")).getByRole("button", {
        name: "Sessions",
      }),
    );
    const restoredFilter = await screen.findByRole("combobox", {
      name: /会话供应商/i,
    });
    await userEvent.click(restoredFilter);

    expect(
      await screen.findByRole("option", { name: /Codex/i }),
    ).toHaveAttribute("data-state", "checked");
    expect(
      window.localStorage.getItem(SESSION_PROVIDER_FILTER_STORAGE_KEY),
    ).toBe("codex");
  }, 30_000);

  it("keeps MCP reachable and route-neutral for every routing application", async () => {
    const { default: App } = await import("@/App");
    renderApp(App);

    await waitFor(() =>
      expect(screen.getByTestId("provider-list")).toBeInTheDocument(),
    );

    const firstRunConfirm = await screen.findByRole("button", {
      name: "firstRunNotice.confirm",
    });
    fireEvent.click(firstRunConfirm);
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "firstRunNotice.title" }),
      ).not.toBeInTheDocument(),
    );

    const routeApps = [
      "claude",
      "claude-desktop",
      "codex",
      "pi",
      "gemini",
      "grokbuild",
      "opencode",
      "openclaw",
      "hermes",
    ];

    for (const app of routeApps) {
      fireEvent.click(screen.getByText(`switch-${app}`));
      await waitFor(() =>
        expect(
          within(screen.getByTestId("app-switcher")).getByText(app),
        ).toBeInTheDocument(),
      );

      const sidebar = within(screen.getByRole("complementary"));
      if (
        !supportsCapability(
          app as Parameters<typeof supportsCapability>[0],
          "mcp",
        )
      ) {
        expect(
          sidebar.queryByRole("button", { name: "MCP servers" }),
        ).not.toBeInTheDocument();
        continue;
      }

      fireEvent.click(
        sidebar.getByRole("button", {
          name: "MCP servers",
        }),
      );

      const header = await screen.findByRole("banner");
      expect(
        within(header).getByRole("heading", {
          name: "mcp.unifiedPanel.title",
        }),
      ).toBeInTheDocument();
      expect(header.querySelector("p")).toBeNull();

      fireEvent.click(
        within(screen.getByRole("complementary")).getByRole("button", {
          name: "provider.title",
        }),
      );
      await waitFor(() =>
        expect(screen.getByTestId("app-switcher")).toBeInTheDocument(),
      );
    }
  }, 60_000);

  it("keeps every feature scope unchanged across route and provider switching", async () => {
    window.localStorage.setItem(PROMPT_APP_STORAGE_KEY, "codex");
    window.localStorage.setItem(LEGACY_SKILLS_TARGET_APP_STORAGE_KEY, "pi");
    window.localStorage.setItem(SESSION_PROVIDER_FILTER_STORAGE_KEY, "gemini");

    const { default: App } = await import("@/App");
    renderApp(App);

    await waitFor(() =>
      expect(screen.getByTestId("provider-list")).toBeInTheDocument(),
    );
    const firstRunConfirm = await screen.findByRole("button", {
      name: "firstRunNotice.confirm",
    });
    fireEvent.click(firstRunConfirm);
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "firstRunNotice.title" }),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByText("switch-codex"));
    await waitFor(() =>
      expect(screen.getByTestId("provider-list")).toHaveTextContent("codex-1"),
    );
    fireEvent.click(screen.getByText("switch"));
    fireEvent.click(screen.getByText("switch-pi"));
    fireEvent.click(screen.getByText("switch-openclaw"));
    fireEvent.click(screen.getByText("switch-claude"));

    expect(window.localStorage.getItem(PROMPT_APP_STORAGE_KEY)).toBe("codex");
    expect(
      window.localStorage.getItem(LEGACY_SKILLS_TARGET_APP_STORAGE_KEY),
    ).toBeNull();
    expect(
      window.localStorage.getItem(SESSION_PROVIDER_FILTER_STORAGE_KEY),
    ).toBe("gemini");

    const sidebar = screen.getByRole("complementary");
    fireEvent.click(within(sidebar).getByRole("button", { name: "Prompts" }));
    const promptAppSelect = within(await screen.findByRole("banner")).getByRole(
      "combobox",
      {
        name: "prompts.selectApplication",
      },
    );
    expect(within(promptAppSelect).getByText("Codex")).toBeInTheDocument();
    const promptHeader = screen.getByRole("banner");
    expect(
      within(promptHeader).getAllByRole("button", { name: "prompts.add" }),
    ).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "prompts.add" })).toHaveLength(
      1,
    );
    fireEvent.click(
      within(promptHeader).getByRole("button", { name: "prompts.add" }),
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole("banner")).getByRole("button", {
          name: "common.back",
        }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(
      within(screen.getByRole("banner")).getByRole("button", {
        name: "common.back",
      }),
    );

    fireEvent.click(within(sidebar).getByRole("button", { name: "Skills" }));
    expect(
      screen.queryByRole("combobox", {
        name: "skills.selectTargetApplication",
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(within(sidebar).getByRole("button", { name: "Sessions" }));
    const sessionFilter = await screen.findByRole("combobox", {
      name: /会话供应商/i,
    });
    await userEvent.click(sessionFilter);
    const geminiOption = await screen.findByRole("option", { name: /Gemini/i });
    expect(geminiOption).toHaveAttribute("data-state", "checked");
    await userEvent.click(geminiOption);

    fireEvent.click(
      within(sidebar).getByRole("button", { name: "MCP servers" }),
    );
    expect(await screen.findAllByText("Matrix Server")).toHaveLength(2);
    const mcpMatrix = screen.getByRole("table");
    const matrixRows = within(mcpMatrix).getAllByRole("row");
    const matrixCells = within(matrixRows[1]).getAllByRole("checkbox");
    expect(matrixCells[1]).toBeChecked();
    expect(matrixCells[2]).not.toBeChecked();
  }, 60_000);

  it("opens usage configuration for Pi providers", async () => {
    setProviders("pi", {
      "pi-1": {
        id: "pi-1",
        name: "Pi Provider",
        settingsConfig: {
          baseUrl: "https://pi.example/v1",
          apiKey: "$STACKFERRY_PI_KEY",
          api: "openai-responses",
          models: [],
        },
        category: "custom",
        sortIndex: 0,
        createdAt: Date.now(),
      },
    });
    setCurrentProviderId("pi", "pi-1");

    const { default: App } = await import("@/App");
    renderApp(App);

    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toContain(
        "claude-1",
      ),
    );
    fireEvent.click(screen.getByText("switch-pi"));
    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toContain("pi-1"),
    );

    fireEvent.click(screen.getByText("usage"));

    expect(screen.getByTestId("usage-modal")).toBeInTheDocument();
    expect(screen.getByTestId("usage-provider")).toHaveTextContent("pi-1");
    expect(screen.getByTestId("usage-app")).toHaveTextContent("pi");
  }, 30_000);

  it("shows toast when auto sync fails in background", async () => {
    const { default: App } = await import("@/App");
    renderApp(App);

    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toContain(
        "claude-1",
      ),
    );

    expect(() => {
      emitTauriEvent("webdav-sync-status-updated", null);
    }).not.toThrow();
    expect(toastErrorMock).not.toHaveBeenCalled();

    emitTauriEvent("webdav-sync-status-updated", {
      source: "auto",
      status: "error",
      error: "network timeout",
    });

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalled();
    });

    toastErrorMock.mockReset();
    expect(() => {
      emitTauriEvent("s3-sync-status-updated", null);
    }).not.toThrow();
    expect(toastErrorMock).not.toHaveBeenCalled();

    emitTauriEvent("s3-sync-status-updated", {
      source: "auto",
      status: "error",
      error: "s3 timeout",
    });

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalled();
    });
  });

  it("routes Pi extension navigation into the Pi workbench", async () => {
    const { default: App } = await import("@/App");
    renderApp(App);

    fireEvent.click(
      await screen.findByRole("button", { name: "firstRunNotice.confirm" }),
    );
    fireEvent.click(await screen.findByText("switch-pi"));
    const sidebar = within(screen.getByRole("complementary"));
    fireEvent.click(
      await sidebar.findByRole("button", { name: "piExtensions.title" }),
    );

    expect(
      await screen.findByTestId("pi-extensions-panel"),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem(VIEW_STORAGE_KEY)).toBe("piExtensions");

    fireEvent.click(
      screen.getByRole("button", { name: "open-pi-extension-detail" }),
    );
    expect(
      screen.getByRole("heading", { name: "Local One" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "common.back" }));
    expect(
      screen.getByRole("heading", { name: "piExtensions.title" }),
    ).toBeInTheDocument();
  });

  it("duplicates openclaw providers with a generated key that avoids live-only ids", async () => {
    setProviders("openclaw", {
      deepseek: {
        id: "deepseek",
        name: "DeepSeek",
        settingsConfig: {
          baseUrl: "https://api.deepseek.com",
          apiKey: "test-key",
          api: "openai-completions",
          models: [],
        },
        category: "custom",
        sortIndex: 0,
        createdAt: Date.now(),
      },
    });
    setCurrentProviderId("openclaw", "deepseek");
    setLiveProviderIds("openclaw", ["deepseek-copy"]);

    const { default: App } = await import("@/App");
    renderApp(App);

    fireEvent.click(screen.getByText("switch-openclaw"));

    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toContain(
        "deepseek",
      ),
    );

    fireEvent.click(screen.getByText("duplicate"));

    await waitFor(() => {
      const providerList = screen.getByTestId("provider-list").textContent;
      expect(providerList).toContain("deepseek-copy-2");
      expect(providerList).toContain("DeepSeek copy");
    });

    expect(toastErrorMock).not.toHaveBeenCalledWith(
      expect.stringContaining("Provider key is required for openclaw"),
    );
  });

  it("shows toast when duplicate cannot load live provider ids", async () => {
    setProviders("openclaw", {
      deepseek: {
        id: "deepseek",
        name: "DeepSeek",
        settingsConfig: {
          baseUrl: "https://api.deepseek.com",
          apiKey: "test-key",
          api: "openai-completions",
          models: [],
        },
        category: "custom",
        sortIndex: 0,
        createdAt: Date.now(),
      },
    });
    setCurrentProviderId("openclaw", "deepseek");

    const liveIdsSpy = vi
      .spyOn(providersApi, "getOpenClawLiveProviderIds")
      .mockRejectedValueOnce(new Error("broken config"));

    const { default: App } = await import("@/App");
    renderApp(App);

    fireEvent.click(screen.getByText("switch-openclaw"));

    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toContain(
        "deepseek",
      ),
    );

    fireEvent.click(screen.getByText("duplicate"));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        expect.stringContaining("读取配置中的供应商标识失败"),
      );
    });

    expect(screen.getByTestId("provider-list").textContent).not.toContain(
      "deepseek-copy",
    );

    liveIdsSpy.mockRestore();
  });
});
