import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PiExtensionInventory,
  PiPackageSearchResult,
} from "@/lib/api/piExtensions";
import PiExtensionsPanel from "@/components/pi/PiExtensionsPanel";

const mocks = vi.hoisted(() => ({
  getInventory: vi.fn(),
  searchPackages: vi.fn(),
  setExtensionEnabled: vi.fn(),
  removePackage: vi.fn(),
  installPackage: vi.fn(),
  registerLocalExtension: vi.fn(),
  unregisterLocalExtension: vi.fn(),
  openExternal: vi.fn(),
}));

vi.mock("@/lib/api/piExtensions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/piExtensions")>(
    "@/lib/api/piExtensions",
  );
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
    },
  };
});

vi.mock("@/lib/api/settings", () => ({
  settingsApi: { openExternal: mocks.openExternal },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}));

const inventory: PiExtensionInventory = {
  runtime: {
    piDir: "C:\\Users\\test\\.pi",
    settingsPath: "C:\\Users\\test\\.pi\\settings.json",
    cliAvailable: true,
    cliVersion: "0.31.0",
    mutable: true,
  },
  extensions: [
    {
      id: "local-one",
      name: "Local One",
      path: "C:\\extensions\\one.ts",
      enabled: true,
      origin: "local",
      sourceType: "local",
      status: "active",
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
      extensions: [],
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
      source: "@scope/pi-extra-package-with-a-very-long-name",
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

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PiExtensionsPanel />
    </QueryClientProvider>,
  );
}

describe("PiExtensionsPanel", () => {
  beforeEach(() => {
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
    mocks.installPackage.mockResolvedValue(inventory);
    mocks.registerLocalExtension.mockResolvedValue(inventory);
    mocks.unregisterLocalExtension.mockResolvedValue({
      ...inventory,
      extensions: inventory.extensions.filter(
        (extension) => extension.id !== "local-one",
      ),
    });
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
        "local-one",
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
    await user.click(
      await screen.findByRole("button", {
        name: 'piExtensions.actions.remove:{"name":"Pi Tools"}',
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
      expect(mocks.removePackage).toHaveBeenCalledWith("pi-tools"),
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

    expect(screen.getByText("piExtensions.adapterBadge")).toHaveAttribute(
      "title",
      "piExtensions.actions.adapterManagedPackage",
    );
    expect(
      screen.queryByRole("button", {
        name: 'piExtensions.actions.remove:{"name":"Pi MCP Adapter"}',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: 'piExtensions.actions.remove:{"name":"Declared Missing"}',
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Pi MCP Adapter")).toBeInTheDocument();
    expect(screen.getByText("Declared Missing")).toBeInTheDocument();
  });

  it("requires confirmation before unregistering a local extension", async () => {
    renderPanel();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", {
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
      expect(mocks.unregisterLocalExtension).toHaveBeenCalledWith(
        "C:\\extensions\\one.ts",
      ),
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
        "@scope/pi-extra-package-with-a-very-long-name",
      ),
    );
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

  it("disables mutations when Pi CLI is unavailable and refreshes inventory", async () => {
    mocks.getInventory.mockResolvedValueOnce({
      ...inventory,
      runtime: {
        ...inventory.runtime,
        cliAvailable: false,
        cliPath: undefined,
        cliVersion: undefined,
      },
    });
    renderPanel();
    const user = userEvent.setup();

    const refresh = await screen.findByRole("button", {
      name: "piExtensions.actions.refresh",
    });
    expect(
      screen.getByRole("switch", {
        name: 'piExtensions.actions.toggle:{"name":"Local One"}',
      }),
    ).toBeDisabled();
    expect(
      screen.getAllByRole("button", { name: "piExtensions.add" })[0],
    ).toBeDisabled();

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
});
