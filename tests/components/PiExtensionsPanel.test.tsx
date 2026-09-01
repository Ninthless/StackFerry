import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PiExtensionInventory,
  PiPackageSearchResult,
} from "@/platform/tauri/api/piExtensions";
import PiExtensionsPanel, {
  type PiExtensionsPageState,
} from "@/features/pi/PiExtensionsPanel";

const mocks = vi.hoisted(() => ({
  getInventory: vi.fn(),
  searchPackages: vi.fn(),
  setExtensionEnabled: vi.fn(),
  removePackage: vi.fn(),
  installPackage: vi.fn(),
  registerLocalExtension: vi.fn(),
  unregisterLocalExtension: vi.fn(),
  trustProject: vi.fn(),
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
  pickDirectory: vi.fn(),
  openExternal: vi.fn(),
}));

vi.mock("@/platform/tauri/api/piExtensions", async () => {
  const actual = await vi.importActual<
    typeof import("@/platform/tauri/api/piExtensions")
  >("@/platform/tauri/api/piExtensions");
  return {
    ...actual,
    piExtensionsApi: {
      ...actual.piExtensionsApi,
      getInventory: mocks.getInventory,
      searchPackages: mocks.searchPackages,
      setExtensionEnabled: mocks.setExtensionEnabled,
      removePackage: mocks.removePackage,
      installPackage: mocks.installPackage,
      registerLocalExtension: mocks.registerLocalExtension,
      unregisterLocalExtension: mocks.unregisterLocalExtension,
      trustProject: mocks.trustProject,
    },
  };
});

vi.mock("@/platform/tauri/api/settings", () => ({
  settingsApi: {
    get: mocks.getSettings,
    save: mocks.saveSettings,
    pickDirectory: mocks.pickDirectory,
    openExternal: mocks.openExternal,
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}));

const inventory: PiExtensionInventory = {
  runtimes: [
    {
      scope: "global",
      piDir: "C:\\Users\\test\\.pi",
      settingsPath: "C:\\Users\\test\\.pi\\settings.json",
      cliAvailable: true,
      cliVersion: "0.31.0",
      mutable: true,
    },
  ],
  extensions: [
    {
      id: "local-one",
      name: "Local One",
      path: "C:\\extensions\\one.ts",
      enabled: true,
      origin: "local",
      sourceType: "local",
      status: "active",
      registrations: [],
      analysisComplete: true,
      conflicts: [],
      scope: "global",
      resourceKey: "local-one",
    },
    {
      id: "broken-one",
      name: "Broken One",
      path: "C:\\extensions\\missing.ts",
      enabled: false,
      origin: "package",
      sourceType: "npm",
      packageId: "pi-tools",
      status: "missing",
      error: "not found",
      registrations: [],
      analysisComplete: false,
      conflicts: [],
      scope: "global",
      resourceKey: "broken-one",
    },
    {
      id: "adapter-child",
      name: "Adapter Child",
      path: "C:\\packages\\pi-mcp-adapter\\extensions\\index.js",
      enabled: true,
      origin: "package",
      sourceType: "npm",
      packageId: "pi-mcp-adapter",
      packageSource: "npm:pi-mcp-adapter@2.19.0",
      status: "active",
      registrations: [],
      analysisComplete: true,
      conflicts: [],
      scope: "global",
      resourceKey: "adapter-child",
    },
  ],
  packages: [
    {
      id: "pi-tools",
      source: "pi-tools",
      sourceType: "npm",
      displayName: "Pi Tools",
      version: "1.2.0",
      installedPath: "C:\\packages\\pi-tools",
      status: "installed",
      extensionCount: 2,
      skillCount: 1,
      promptCount: 1,
      themeCount: 0,
      extensions: [
        {
          id: "pi-tools-extension",
          name: "Pi Tools Extension",
          path: "C:\\packages\\pi-tools\\extensions\\index.js",
          enabled: true,
          origin: "package",
          sourceType: "npm",
          packageId: "pi-tools",
          packageSource: "pi-tools",
          status: "active",
          registrations: [],
          analysisComplete: true,
          conflicts: [],
          scope: "global",
          resourceKey: "pi-tools-extension",
        },
      ],
      scope: "global",
      resourceKey: "pi-tools",
    },
    {
      id: "pi-mcp-adapter",
      source: "npm:pi-mcp-adapter@2.19.0",
      sourceType: "npm",
      displayName: "Pi MCP Adapter",
      version: "2.19.0",
      installedPath: "C:\\packages\\pi-mcp-adapter",
      status: "installed",
      extensionCount: 1,
      skillCount: 0,
      promptCount: 0,
      themeCount: 0,
      extensions: [],
      scope: "global",
      resourceKey: "pi-mcp-adapter",
    },
    {
      id: "declared-missing",
      source: "npm:declared-missing",
      sourceType: "npm",
      displayName: "Declared Missing",
      installedPath: "C:\\packages\\declared-missing",
      status: "missing",
      extensionCount: 0,
      skillCount: 0,
      promptCount: 0,
      themeCount: 0,
      extensions: [],
      scope: "global",
      resourceKey: "declared-missing",
    },
  ],
};

const searchResult: PiPackageSearchResult = {
  items: [
    {
      name: "@scope/pi-extra-package-with-a-very-long-name",
      version: "2.0.0",
      publisher: "scope",
      description: "Extra Pi resources",
      source: "npm:@scope/pi-extra-package-with-a-very-long-name",
      npmUrl: "https://npmjs.com/package/pi-extra",
      downloads: 12500,
      resourceTypes: ["extension", "skill"],
      manifestStatus: "available",
      installed: false,
    },
  ],
  total: 1,
  query: "extra",
  offset: 0,
  limit: 12,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderPanel({
  requestedMode,
  onPageStateChange,
}: {
  requestedMode?: PiExtensionsPageState["mode"];
  onPageStateChange?: (state: PiExtensionsPageState) => void;
} = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PiExtensionsPanel
        requestedMode={requestedMode}
        onPageStateChange={onPageStateChange}
      />
    </QueryClientProvider>,
  );
}

describe("PiExtensionsPanel", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    mocks.getInventory.mockResolvedValue(inventory);
    mocks.searchPackages.mockResolvedValue(searchResult);
    mocks.setExtensionEnabled.mockResolvedValue({
      ...inventory,
      extensions: inventory.extensions.map((extension) =>
        extension.id === "local-one"
          ? { ...extension, enabled: false, status: "disabled" as const }
          : extension,
      ),
    });
    mocks.removePackage.mockResolvedValue({
      ...inventory,
      packages: [],
    });
    mocks.installPackage.mockResolvedValue({
      inventory,
      isolatedExtensions: [],
    });
    mocks.registerLocalExtension.mockResolvedValue(inventory);
    mocks.unregisterLocalExtension.mockResolvedValue({
      ...inventory,
      extensions: inventory.extensions.filter(
        (extension) => extension.id !== "local-one",
      ),
    });
    mocks.trustProject.mockResolvedValue(inventory);
    mocks.getSettings.mockResolvedValue({
      showInTray: true,
      minimizeToTrayOnClose: false,
    });
    mocks.saveSettings.mockResolvedValue(true);
    mocks.pickDirectory.mockResolvedValue(null);
  });

  it("renders all tabs, filters extensions, toggles valid items, and blocks broken items", async () => {
    renderPanel();

    expect(
      await screen.findByRole("tab", { name: "piExtensions.tabs.extensions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "piExtensions.tabs.packages" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "piExtensions.tabs.discover" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Local One")).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "piExtensions.searchPlaceholder",
      }),
      { target: { value: "Broken" } },
    );
    expect(screen.queryByText("Local One")).not.toBeInTheDocument();
    expect(screen.getByText("Broken One")).toBeInTheDocument();
    expect(
      screen.getByRole("switch", {
        name: 'piExtensions.actions.toggle:{"name":"Broken One"}',
      }),
    ).toBeDisabled();

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "piExtensions.searchPlaceholder",
      }),
      { target: { value: "Local" } },
    );
    fireEvent.click(
      screen.getByRole("switch", {
        name: 'piExtensions.actions.toggle:{"name":"Local One"}',
      }),
    );
    await waitFor(() =>
      expect(mocks.setExtensionEnabled).toHaveBeenCalledWith(
        {
          scope: "global",
          resourceKey: "local-one",
          projectDir: undefined,
        },
        false,
      ),
    );
  });

  it("requires package removal confirmation", async () => {
    renderPanel();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("tab", {
        name: "piExtensions.tabs.packages",
      }),
    );
    const packageRow = (await screen.findByText("Pi Tools")).closest(
      ".pi-package-row",
    );
    expect(packageRow).not.toBeNull();
    await user.click(
      within(packageRow as HTMLElement).getByRole("button", {
        name: "common.moreActions",
      }),
    );
    await user.click(
      screen.getByRole("menuitem", {
        name: "piExtensions.actions.removePackage",
      }),
    );
    expect(
      screen.getByText("piExtensions.removeConfirm.title"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "piExtensions.removeConfirm.confirm",
      }),
    );
    await waitFor(() =>
      expect(mocks.removePackage).toHaveBeenCalledWith({
        scope: "global",
        resourceKey: "pi-tools",
        projectDir: undefined,
      }),
    );
  });

  it("reports extensions isolated after a conflicting package install", async () => {
    mocks.installPackage.mockResolvedValue({
      inventory,
      isolatedExtensions: [
        {
          ...inventory.extensions[0],
          id: "isolated-search",
          name: "Web Search",
          enabled: false,
          status: "disabled",
          registrations: [{ kind: "tool", name: "web_search" }],
          conflicts: [
            {
              kind: "tool",
              name: "web_search",
              otherExtensionId: "web-access",
              otherExtensionName: "Pi Web Access",
              otherExtensionPath: "C:\\extensions\\web-access.ts",
              otherExtensionScope: "global" as const,
            },
          ],
        },
      ],
    });
    renderPanel();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("tab", { name: "piExtensions.tabs.discover" }),
    );
    const search = screen.getByRole("textbox", {
      name: "piExtensions.discover.placeholder",
    });
    await user.type(search, "extra");
    await user.keyboard("{Enter}");
    await user.click(
      await screen.findByRole("button", {
        name: "piExtensions.discover.install",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "piExtensions.installConfirm.confirm",
      }),
    );
    await waitFor(() =>
      expect(mocks.installPackage).toHaveBeenCalledWith(
        "npm:@scope/pi-extra-package-with-a-very-long-name",
        { scope: "global" },
      ),
    );
  });

  it("marks the MCP adapter package and hides protected remove actions", async () => {
    renderPanel();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("tab", {
        name: "piExtensions.tabs.packages",
      }),
    );

    expect(screen.getByText("piExtensions.adapterBadge")).toBeInTheDocument();
    const adapterRow = screen
      .getByText("Pi MCP Adapter")
      .closest(".pi-package-row");
    const missingRow = screen
      .getByText("Declared Missing")
      .closest(".pi-package-row");
    for (const row of [adapterRow, missingRow]) {
      expect(row).not.toBeNull();
      await user.click(
        within(row as HTMLElement).getByRole("button", {
          name: "common.moreActions",
        }),
      );
      expect(
        screen.queryByRole("menuitem", {
          name: "piExtensions.actions.removePackage",
        }),
      ).not.toBeInTheDocument();
      await user.keyboard("{Escape}");
    }
    expect(screen.getByText("Pi MCP Adapter")).toBeInTheDocument();
    expect(screen.getByText("Declared Missing")).toBeInTheDocument();
  });

  it("requires confirmation before unregistering a local extension", async () => {
    renderPanel();
    const user = userEvent.setup();

    const extensionRow = (await screen.findByText("Local One")).closest(
      ".pi-extension-list-row",
    );
    expect(extensionRow).not.toBeNull();
    await user.click(
      within(extensionRow as HTMLElement).getByRole("button", {
        name: "common.moreActions",
      }),
    );
    await user.click(
      screen.getByRole("menuitem", {
        name: 'piExtensions.actions.unregisterLocal:{"name":"Local One"}',
      }),
    );
    expect(
      screen.getByText("piExtensions.unregisterConfirm.title"),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "piExtensions.unregisterConfirm.confirm",
      }),
    );

    await waitFor(() =>
      expect(mocks.unregisterLocalExtension).toHaveBeenCalledWith({
        scope: "global",
        resourceKey: "local-one",
        projectDir: undefined,
      }),
    );
  });

  it("searches discovery and requires install confirmation", async () => {
    renderPanel();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("tab", {
        name: "piExtensions.tabs.discover",
      }),
    );
    fireEvent.change(
      await screen.findByRole("textbox", {
        name: "piExtensions.discover.placeholder",
      }),
      { target: { value: "extra" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "common.search" }));
    expect(
      await screen.findByText("@scope/pi-extra-package-with-a-very-long-name"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "piExtensions.discover.install",
      }),
    );
    expect(
      screen.getByText("piExtensions.installConfirm.title"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "piExtensions.installConfirm.confirm",
      }),
    );
    await waitFor(() =>
      expect(mocks.installPackage).toHaveBeenCalledWith(
        "npm:@scope/pi-extra-package-with-a-very-long-name",
        { scope: "global" },
      ),
    );
  });

  it("shows a loading state and does not retain results from a previous query", async () => {
    const firstSearch = deferred<PiPackageSearchResult>();
    const secondSearch = deferred<PiPackageSearchResult>();
    mocks.searchPackages
      .mockReturnValueOnce(firstSearch.promise)
      .mockReturnValueOnce(secondSearch.promise);
    renderPanel();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("tab", {
        name: "piExtensions.tabs.discover",
      }),
    );
    const searchInput = screen.getByRole("textbox", {
      name: "piExtensions.discover.placeholder",
    });
    await user.type(searchInput, "extra");
    await user.click(screen.getByRole("button", { name: "common.search" }));

    expect(screen.getByRole("status", { name: "" })).toHaveTextContent(
      "piExtensions.discover.searching",
    );
    expect(
      screen.getByRole("button", {
        name: "piExtensions.discover.searching",
      }),
    ).toBeDisabled();

    await act(async () => {
      firstSearch.resolve(searchResult);
      await firstSearch.promise;
    });
    expect(
      await screen.findByText("@scope/pi-extra-package-with-a-very-long-name"),
    ).toBeInTheDocument();

    await user.clear(searchInput);
    await user.type(searchInput, "other");
    await user.click(screen.getByRole("button", { name: "common.search" }));

    expect(
      screen.queryByText("@scope/pi-extra-package-with-a-very-long-name"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent(
      "piExtensions.discover.searching",
    );

    await act(async () => {
      secondSearch.resolve({
        ...searchResult,
        items: [{ ...searchResult.items[0], name: "other-package" }],
        query: "other",
      });
      await secondSearch.promise;
    });
    expect(await screen.findByText("other-package")).toBeInTheDocument();
  });

  it("allows installation when the manifest is unavailable", async () => {
    mocks.searchPackages.mockResolvedValueOnce({
      ...searchResult,
      items: [
        {
          ...searchResult.items[0],
          manifestStatus: "unavailable",
          resourceTypes: [],
        },
      ],
    });
    renderPanel();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("tab", {
        name: "piExtensions.tabs.discover",
      }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: "piExtensions.discover.placeholder",
      }),
      "extra",
    );
    await user.click(screen.getByRole("button", { name: "common.search" }));
    const installButton = await screen.findByRole("button", {
      name: "piExtensions.discover.install",
    });
    expect(installButton).toBeEnabled();

    await user.click(installButton);
    expect(
      screen.getByText(/piExtensions\.installConfirm\.manifestUnavailable/),
    ).toBeInTheDocument();
  });

  it("uses tab-specific dynamic status filters", async () => {
    renderPanel();
    const user = userEvent.setup();
    const statusFilter = await screen.findByRole("combobox", {
      name: "piExtensions.filters.status",
    });

    await user.click(statusFilter);
    expect(
      screen.getByRole("option", { name: "piExtensions.status.active" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "piExtensions.status.installed" }),
    ).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(
      screen.getByRole("tab", { name: "piExtensions.tabs.packages" }),
    );
    await user.click(
      screen.getByRole("combobox", {
        name: "piExtensions.filters.status",
      }),
    );
    expect(
      screen.getByRole("option", { name: "piExtensions.status.installed" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "piExtensions.status.active" }),
    ).not.toBeInTheDocument();
  });

  it("protects adapter child extensions from toggles", async () => {
    renderPanel();
    expect(
      await screen.findByRole("switch", {
        name: 'piExtensions.actions.toggle:{"name":"Adapter Child"}',
      }),
    ).toBeDisabled();
  });

  it("shows compact package resource summary and expands child resources", async () => {
    const { container } = renderPanel();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("tab", {
        name: "piExtensions.tabs.packages",
      }),
    );

    const summary = container.querySelector(
      ".pi-package-row .pi-extension-resource-counts",
    );
    expect(summary).toHaveTextContent(
      "piExtensions.resources.extensionsCompact2",
    );
    expect(summary).toHaveTextContent("piExtensions.resources.skillsCompact1");
    await user.click(
      screen.getByRole("button", {
        name: 'piExtensions.packages.toggleResources:{"name":"Pi Tools"}',
      }),
    );
    expect(await screen.findByText("Pi Tools Extension")).toBeInTheDocument();
  });

  it("loads more discovery results and keeps manifest warnings visible", async () => {
    mocks.searchPackages
      .mockResolvedValueOnce({
        ...searchResult,
        total: 13,
      })
      .mockResolvedValueOnce({
        ...searchResult,
        items: [
          {
            ...searchResult.items[0],
            name: "second-package",
            source: "npm:second-package",
            version: "1.0.0",
            manifestStatus: "unavailable",
          },
        ],
        total: 13,
        offset: 12,
      });
    renderPanel();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("tab", {
        name: "piExtensions.tabs.discover",
      }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: "piExtensions.discover.placeholder",
      }),
      "extra",
    );
    await user.click(screen.getByRole("button", { name: "common.search" }));
    expect(
      await screen.findByText('piExtensions.discover.loadedCount:{"count":1}'),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "piExtensions.discover.loadMore",
      }),
    );
    expect(await screen.findByText("second-package")).toBeInTheDocument();
    expect(
      screen.getByText("piExtensions.discover.manifestUnavailable"),
    ).toBeInTheDocument();
  });

  it("keeps discovery results visible while loading more and supports retry", async () => {
    const nextPage = deferred<PiPackageSearchResult>();
    mocks.searchPackages
      .mockResolvedValueOnce({
        ...searchResult,
        total: 13,
      })
      .mockReturnValueOnce(nextPage.promise)
      .mockResolvedValueOnce({
        ...searchResult,
        items: [
          {
            ...searchResult.items[0],
            name: "recovered-package",
            source: "npm:recovered-package",
          },
        ],
        total: 13,
        offset: 12,
      });
    renderPanel();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("tab", {
        name: "piExtensions.tabs.discover",
      }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: "piExtensions.discover.placeholder",
      }),
      "extra",
    );
    await user.click(screen.getByRole("button", { name: "common.search" }));
    expect(
      await screen.findByText("@scope/pi-extra-package-with-a-very-long-name"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "piExtensions.discover.loadMore",
      }),
    );
    expect(
      screen.getByRole("button", {
        name: "piExtensions.discover.loadingMore",
      }),
    ).toBeDisabled();
    expect(
      screen.getByText("@scope/pi-extra-package-with-a-very-long-name"),
    ).toBeInTheDocument();

    await act(async () => {
      nextPage.reject(new Error("network unavailable"));
      await nextPage.promise.catch(() => undefined);
    });
    expect(
      await screen.findByRole("button", {
        name: "piExtensions.discover.retryMore",
      }),
    ).toBeEnabled();

    await user.click(
      screen.getByRole("button", {
        name: "piExtensions.discover.retryMore",
      }),
    );
    expect(await screen.findByText("recovered-package")).toBeInTheDocument();
  });

  it("normalizes bare npm sources in the add dialog", async () => {
    renderPanel();
    const user = userEvent.setup();
    await user.click(
      (
        await screen.findAllByRole("button", {
          name: "piExtensions.add",
        })
      )[0],
    );
    await user.click(
      screen.getByRole("tab", {
        name: "piExtensions.installDialog.modes.npm",
      }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: "piExtensions.installDialog.labels.npm",
      }),
      "sample-package@1.2.3",
    );
    await user.click(screen.getByRole("checkbox"));
    await user.click(
      screen.getByRole("button", {
        name: "piExtensions.installDialog.confirm",
      }),
    );
    await waitFor(() =>
      expect(mocks.installPackage).toHaveBeenCalledWith(
        "npm:sample-package@1.2.3",
        { scope: "global", projectDir: undefined },
      ),
    );
  });

  it("opens extension details as a dedicated page and reports header state", async () => {
    const onPageStateChange = vi.fn();
    const { container } = renderPanel({ onPageStateChange });
    const user = userEvent.setup();
    await user.click(await screen.findByText("Local One"));
    expect(container.querySelector(".pi-extension-detail-page")).toBeVisible();
    expect(container.querySelector(".management-workbench")).toBeNull();
    expect(onPageStateChange).toHaveBeenCalledWith({
      mode: "detail",
      name: "Local One",
      resourceType: "extension",
    });
    expect(
      screen.getByRole("heading", {
        name: "piExtensions.details.extension",
      }),
    ).toBeInTheDocument();
  });

  it("shows registration conflicts and allows disabling the conflicting extension", async () => {
    const conflictingInventory: PiExtensionInventory = {
      ...inventory,
      extensions: inventory.extensions.map((extension) =>
        extension.id === "local-one"
          ? {
              ...extension,
              status: "conflict" as const,
              registrations: [{ kind: "tool" as const, name: "web_search" }],
              conflicts: [
                {
                  kind: "tool" as const,
                  name: "web_search",
                  otherExtensionId: "web-access",
                  otherExtensionName: "Pi Web Access",
                  otherExtensionPath: "C:\\extensions\\web-access.ts",
                  otherExtensionScope: "global" as const,
                },
              ],
            }
          : extension,
      ),
    };
    mocks.getInventory.mockResolvedValue(conflictingInventory);
    renderPanel();
    const user = userEvent.setup();

    expect(
      await screen.findByText('piExtensions.conflicts.bannerTitle:{"count":1}'),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "piExtensions.conflicts.review" }),
    );
    expect(screen.getByText("web_search")).toBeInTheDocument();
    expect(
      screen.getByText((content) =>
        content.includes(
          'piExtensions.conflicts.withExtension:{"name":"Pi Web Access"}',
        ),
      ),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "piExtensions.conflicts.disableThis",
      }),
    );
    await waitFor(() =>
      expect(mocks.setExtensionEnabled).toHaveBeenCalledWith(
        {
          scope: "global",
          resourceKey: "local-one",
          projectDir: undefined,
        },
        false,
      ),
    );
  });

  it("returns to the inventory when the parent requests list mode", async () => {
    const { rerender } = renderPanel({ requestedMode: "detail" });
    const user = userEvent.setup();
    await user.click(await screen.findByText("Local One"));
    expect(
      document.querySelector(".pi-extension-detail-page"),
    ).toBeInTheDocument();

    rerender(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          })
        }
      >
        <PiExtensionsPanel requestedMode="list" />
      </QueryClientProvider>,
    );
    expect(
      await screen.findByRole("tab", { name: "piExtensions.tabs.extensions" }),
    ).toBeInTheDocument();
  });

  it("keeps config mutations available when Pi CLI is unavailable and disables package operations", async () => {
    const cliUnavailableInventory = {
      ...inventory,
      runtimes: inventory.runtimes.map((runtime) => ({
        ...runtime,
        cliAvailable: false,
        cliPath: undefined,
        cliVersion: undefined,
      })),
    };
    mocks.getInventory.mockResolvedValueOnce(cliUnavailableInventory);
    mocks.registerLocalExtension.mockResolvedValue(cliUnavailableInventory);
    mocks.unregisterLocalExtension.mockResolvedValue(cliUnavailableInventory);
    mocks.setExtensionEnabled.mockResolvedValue(cliUnavailableInventory);
    renderPanel();
    const user = userEvent.setup();

    const refresh = await screen.findByRole("button", {
      name: "piExtensions.actions.refresh",
    });
    expect(
      screen.getByRole("switch", {
        name: 'piExtensions.actions.toggle:{"name":"Local One"}',
      }),
    ).toBeEnabled();
    expect(
      screen.getAllByRole("button", { name: "piExtensions.add" })[0],
    ).toBeEnabled();
    await user.click(
      screen.getAllByRole("button", { name: "piExtensions.add" })[0],
    );
    await user.type(
      screen.getByRole("textbox", {
        name: "piExtensions.installDialog.labels.extensionFile",
      }),
      "C:\\extensions\\new.ts",
    );
    await user.click(screen.getByRole("checkbox"));
    await user.click(
      screen.getByRole("button", {
        name: "piExtensions.installDialog.confirm",
      }),
    );
    await waitFor(() =>
      expect(mocks.registerLocalExtension).toHaveBeenCalledWith(
        "C:\\extensions\\new.ts",
        { scope: "global", projectDir: undefined },
      ),
    );

    const extensionRow = screen
      .getByText("Local One")
      .closest(".pi-extension-list-row");
    await user.click(
      within(extensionRow as HTMLElement).getByRole("button", {
        name: "common.moreActions",
      }),
    );
    await user.click(
      screen.getByRole("menuitem", {
        name: 'piExtensions.actions.unregisterLocal:{"name":"Local One"}',
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "piExtensions.unregisterConfirm.confirm",
      }),
    );
    await waitFor(() =>
      expect(mocks.unregisterLocalExtension).toHaveBeenCalledWith({
        scope: "global",
        resourceKey: "local-one",
        projectDir: undefined,
      }),
    );

    await user.click(
      screen.getByRole("tab", { name: "piExtensions.tabs.packages" }),
    );
    const packageRow = (await screen.findByText("Pi Tools")).closest(
      ".pi-package-row",
    );
    await user.click(
      within(packageRow as HTMLElement).getByRole("button", {
        name: "common.moreActions",
      }),
    );
    expect(
      screen.getByRole("menuitem", {
        name: "piExtensions.actions.removePackage",
      }),
    ).toHaveAttribute("aria-disabled", "true");
    await user.keyboard("{Escape}");
    await user.click(
      screen.getAllByRole("button", { name: "piExtensions.add" })[0],
    );
    await user.click(
      screen.getByRole("tab", {
        name: "piExtensions.installDialog.modes.npm",
      }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: "piExtensions.installDialog.labels.npm",
      }),
      "blocked-package",
    );
    await user.click(screen.getByRole("checkbox"));
    expect(
      screen.getByRole("button", {
        name: "piExtensions.installDialog.confirm",
      }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", {
        name: "common.cancel",
      }),
    );
    await user.click(
      screen.getByRole("tab", { name: "piExtensions.tabs.extensions" }),
    );
    await user.click(
      screen.getByRole("switch", {
        name: 'piExtensions.actions.toggle:{"name":"Local One"}',
      }),
    );
    await waitFor(() =>
      expect(mocks.setExtensionEnabled).toHaveBeenCalledWith(
        {
          scope: "global",
          resourceKey: "local-one",
          projectDir: undefined,
        },
        false,
      ),
    );

    await user.click(refresh);
    await waitFor(() => expect(mocks.getInventory).toHaveBeenCalledTimes(2));
  });

  it("shows load errors and empty states", async () => {
    mocks.getInventory.mockRejectedValueOnce(new Error("inventory failed"));
    renderPanel();
    expect(
      await screen.findByText("piExtensions.loadFailed"),
    ).toBeInTheDocument();

    mocks.getInventory.mockResolvedValueOnce({
      ...inventory,
      extensions: [],
      packages: [],
    });
    renderPanel();
    expect(
      await screen.findByText("piExtensions.empty.noExtensions"),
    ).toBeInTheDocument();
  });

  it("exposes workbench toolbar and list action hooks", async () => {
    const { container } = renderPanel();

    expect(
      await screen.findByRole("tab", { name: "piExtensions.tabs.extensions" }),
    ).toBeInTheDocument();
    expect(container.querySelector(".pi-extensions-toolbar")).toContainElement(
      screen.getByRole("textbox", {
        name: "piExtensions.searchPlaceholder",
      }),
    );
    expect(container.querySelector(".pi-extensions-toolbar")).toContainElement(
      container.querySelector(".pi-extensions-status-filter"),
    );
    expect(container.querySelector(".pi-extensions-summary")).toContainElement(
      container.querySelector(".pi-extensions-tabs"),
    );
    expect(container.querySelector(".pi-runtime-health-grid")).toBeVisible();
    expect(
      container.querySelector(".pi-extension-list-actions"),
    ).toContainElement(
      screen.getByRole("switch", {
        name: 'piExtensions.actions.toggle:{"name":"Local One"}',
      }),
    );
  });

  it("loads the recent project and trusts an untrusted project", async () => {
    const projectInventory: PiExtensionInventory = {
      ...inventory,
      project: { projectDir: "C:\\work\\demo", trusted: false },
      runtimes: [
        ...inventory.runtimes,
        {
          scope: "project",
          projectDir: "C:\\work\\demo",
          piDir: "C:\\work\\demo\\.pi",
          settingsPath: "C:\\work\\demo\\.pi\\settings.json",
          cliAvailable: true,
          mutable: true,
        },
      ],
      extensions: [
        ...inventory.extensions,
        {
          ...inventory.extensions[0],
          id: "project-local",
          name: "Project Local",
          scope: "project",
          resourceKey: "project-local",
          projectDir: "C:\\work\\demo",
        },
      ],
    };
    mocks.getSettings.mockResolvedValue({
      showInTray: true,
      minimizeToTrayOnClose: false,
      recentPiProjectDir: "C:\\work\\demo",
    });
    mocks.getInventory.mockImplementation((projectDir?: string) =>
      Promise.resolve(projectDir ? projectInventory : inventory),
    );
    mocks.trustProject.mockResolvedValue({
      ...projectInventory,
      project: { ...projectInventory.project!, trusted: true },
    });
    renderPanel();
    const user = userEvent.setup();

    expect(await screen.findByText("Project Local")).toBeInTheDocument();
    await user.click(
      screen.getAllByRole("button", {
        name: "piExtensions.project.trust",
      })[0],
    );
    await user.click(
      screen.getByRole("button", {
        name: "piExtensions.project.trustConfirm",
      }),
    );
    await waitFor(() =>
      expect(mocks.trustProject).toHaveBeenCalledWith("C:\\work\\demo"),
    );
  });

  it("installs to the selected project with an explicit target", async () => {
    mocks.getSettings.mockResolvedValue({
      showInTray: true,
      minimizeToTrayOnClose: false,
      recentPiProjectDir: "C:\\work\\demo",
    });
    mocks.getInventory.mockResolvedValue({
      ...inventory,
      project: { projectDir: "C:\\work\\demo", trusted: true },
      runtimes: [
        ...inventory.runtimes,
        {
          ...inventory.runtimes[0],
          scope: "project",
          projectDir: "C:\\work\\demo",
          piDir: "C:\\work\\demo\\.pi",
          settingsPath: "C:\\work\\demo\\.pi\\settings.json",
        },
      ],
    });
    renderPanel();
    const user = userEvent.setup();

    await user.click(
      (
        await screen.findAllByRole("button", {
          name: "piExtensions.add",
        })
      )[0],
    );
    await user.click(
      screen.getByRole("button", { name: "piExtensions.scope.project" }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: "piExtensions.installDialog.labels.extensionFile",
      }),
      "C:\\work\\demo\\extension.ts",
    );
    await user.click(screen.getByRole("checkbox"));
    await user.click(
      screen.getByRole("button", {
        name: "piExtensions.installDialog.confirm",
      }),
    );
    await waitFor(() =>
      expect(mocks.registerLocalExtension).toHaveBeenCalledWith(
        "C:\\work\\demo\\extension.ts",
        { scope: "project", projectDir: "C:\\work\\demo" },
      ),
    );
  });
});
