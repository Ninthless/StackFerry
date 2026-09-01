import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { piExtensionsApi } from "@/platform/tauri/api/piExtensions";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

const inventory = {
  runtime: {
    scope: "global",
    piDir: "C:\\Users\\test\\.pi",
    settingsPath: "C:\\Users\\test\\.pi\\settings.json",
    cliAvailable: true,
    mutable: true,
  },
  runtimes: [],
  projectTrust: {
    projectDir: "C:\\work\\demo",
    trusted: false,
    decision: null,
    inheritedFrom: "C:\\work",
  },
  extensions: [
    {
      id: "project-extension-id",
      resourceKey: "project-extension-key",
      scope: "project",
      projectDir: "C:\\work\\demo",
      name: "Project Extension",
      path: "C:\\work\\demo\\.pi\\extensions\\index.ts",
      enabled: true,
      origin: "local",
      sourceType: "local",
      status: "conflict",
      registrations: [],
      analysisComplete: true,
      conflicts: [
        {
          kind: "tool",
          name: "search",
          otherExtensionId: "global-extension-id",
          otherExtensionName: "Global Extension",
          otherExtensionPath: "C:\\Users\\test\\.pi\\extensions\\index.ts",
          otherExtensionScope: "global",
        },
      ],
    },
  ],
  packages: [],
};

describe("piExtensionsApi", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(inventory);
  });

  it("adapts project trust and conflict scope", async () => {
    const result = await piExtensionsApi.getInventory("C:\\work\\demo");

    expect(invokeMock).toHaveBeenCalledWith("get_pi_extension_inventory", {
      projectDir: "C:\\work\\demo",
    });
    expect(result.project).toEqual({
      projectDir: "C:\\work\\demo",
      trusted: false,
      decision: undefined,
      inheritedFrom: "C:\\work",
    });
    expect(result.extensions[0].conflicts[0].otherExtensionScope).toBe(
      "global",
    );
  });

  it("sends flat scope targets for every mutation", async () => {
    const target = {
      scope: "project" as const,
      projectDir: "C:\\work\\demo",
      resourceKey: "resource-key",
    };

    await piExtensionsApi.registerLocalExtension("extension.ts", target);
    expect(invokeMock).toHaveBeenLastCalledWith("register_pi_local_extension", {
      path: "extension.ts",
      scope: "project",
      projectDir: "C:\\work\\demo",
    });

    await piExtensionsApi.unregisterLocalExtension(target);
    expect(invokeMock).toHaveBeenLastCalledWith(
      "unregister_pi_local_extension",
      {
        resourceKey: "resource-key",
        scope: "project",
        projectDir: "C:\\work\\demo",
      },
    );

    invokeMock.mockResolvedValueOnce({
      inventory,
      isolatedExtensions: [],
    });
    await piExtensionsApi.installPackage("npm:pi-tools", target);
    expect(invokeMock).toHaveBeenLastCalledWith("install_pi_package", {
      source: "npm:pi-tools",
      scope: "project",
      projectDir: "C:\\work\\demo",
    });

    await piExtensionsApi.removePackage(target);
    expect(invokeMock).toHaveBeenLastCalledWith("remove_pi_package", {
      resourceKey: "resource-key",
      scope: "project",
      projectDir: "C:\\work\\demo",
    });

    await piExtensionsApi.setExtensionEnabled(target, false);
    expect(invokeMock).toHaveBeenLastCalledWith("set_pi_extension_enabled", {
      resourceKey: "resource-key",
      enabled: false,
      scope: "project",
      projectDir: "C:\\work\\demo",
    });

    await piExtensionsApi.trustProject("C:\\work\\demo");
    expect(invokeMock).toHaveBeenLastCalledWith("set_pi_project_trust", {
      projectDir: "C:\\work\\demo",
      trusted: true,
    });
  });
});
