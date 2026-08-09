import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export type PiExtensionOrigin = "auto" | "local" | "package";
export type PiExtensionSourceType = "auto" | "local" | "npm" | "git";
export type PiInventoryStatus =
  | "active"
  | "disabled"
  | "missing"
  | "invalid"
  | "conflict";
export type PiPackageStatus = "installed" | "missing" | "invalid" | "conflict";

export interface PiRuntimeInfo {
  piDir: string;
  settingsPath: string;
  cliAvailable: boolean;
  cliPath?: string;
  cliVersion?: string;
  mutable: boolean;
  error?: string;
}

export interface PiExtension {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  origin: PiExtensionOrigin;
  sourceType: PiExtensionSourceType;
  packageId?: string;
  packageSource?: string;
  version?: string;
  status: PiInventoryStatus;
  error?: string;
}

export interface PiPackage {
  id: string;
  source: string;
  sourceType: Exclude<PiExtensionSourceType, "auto">;
  displayName: string;
  version?: string;
  installedPath?: string;
  status: PiPackageStatus;
  extensionCount: number;
  skillCount: number;
  promptCount: number;
  themeCount: number;
  extensions: PiExtension[];
  error?: string;
}

export interface PiExtensionInventory {
  runtime: PiRuntimeInfo;
  extensions: PiExtension[];
  packages: PiPackage[];
}

export interface PiPackageSearchItem {
  name: string;
  version: string;
  description?: string;
  publisher?: string;
  license?: string;
  publishedAt?: string;
  npmUrl?: string;
  repositoryUrl?: string;
  homepageUrl?: string;
  source: string;
  downloads?: number;
  resourceTypes: string[];
  manifestStatus: string;
  installed: boolean;
}

export interface PiPackageSearchResult {
  items: PiPackageSearchItem[];
  total: number;
  query: string;
  offset: number;
  limit: number;
}

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord =>
  value && typeof value === "object" ? (value as UnknownRecord) : {};

const field = <T>(
  record: UnknownRecord,
  camelCase: string,
  snakeCase: string,
  fallback: T,
): T => (record[camelCase] ?? record[snakeCase] ?? fallback) as T;

const optionalString = (
  record: UnknownRecord,
  camelCase: string,
  snakeCase: string,
): string | undefined => {
  const value = record[camelCase] ?? record[snakeCase];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const adaptInventory = (value: unknown): PiExtensionInventory => {
  const inventory = asRecord(value);
  const runtime = asRecord(inventory.runtime);
  const extensions = Array.isArray(inventory.extensions)
    ? inventory.extensions
    : [];
  const packages = Array.isArray(inventory.packages) ? inventory.packages : [];

  return {
    runtime: {
      piDir: field(runtime, "piDir", "pi_dir", ""),
      settingsPath: field(runtime, "settingsPath", "settings_path", ""),
      cliAvailable: field(runtime, "cliAvailable", "cli_available", false),
      cliPath: optionalString(runtime, "cliPath", "cli_path"),
      cliVersion: optionalString(runtime, "cliVersion", "cli_version"),
      mutable: field(runtime, "mutable", "mutable", true),
      error: optionalString(runtime, "error", "error"),
    },
    extensions: extensions.map((item) => {
      const extension = asRecord(item);
      return {
        id: field(extension, "id", "id", ""),
        name: field(extension, "name", "name", ""),
        path: field(extension, "path", "path", ""),
        enabled: field(extension, "enabled", "enabled", false),
        origin: field(extension, "origin", "origin", "local"),
        sourceType: field(extension, "sourceType", "source_type", "local"),
        packageId: optionalString(extension, "packageId", "package_id"),
        packageSource: optionalString(
          extension,
          "packageSource",
          "package_source",
        ),
        version: optionalString(extension, "version", "version"),
        status: field(extension, "status", "status", "invalid"),
        error: optionalString(extension, "error", "error"),
      };
    }),
    packages: packages.map((item) => {
      const packageItem = asRecord(item);
      return {
        id: field(packageItem, "id", "id", ""),
        source: field(packageItem, "source", "source", ""),
        sourceType: field(packageItem, "sourceType", "source_type", "local"),
        displayName: field(
          packageItem,
          "displayName",
          "display_name",
          field(packageItem, "source", "source", ""),
        ),
        version: optionalString(packageItem, "version", "version"),
        installedPath: optionalString(
          packageItem,
          "installedPath",
          "installed_path",
        ),
        status: field(packageItem, "status", "status", "invalid"),
        extensionCount: field(
          packageItem,
          "extensionCount",
          "extension_count",
          0,
        ),
        skillCount: field(packageItem, "skillCount", "skill_count", 0),
        promptCount: field(packageItem, "promptCount", "prompt_count", 0),
        themeCount: field(packageItem, "themeCount", "theme_count", 0),
        extensions: Array.isArray(packageItem.extensions)
          ? packageItem.extensions.map((extension) => {
              const resource = asRecord(extension);
              return {
                id: field(resource, "id", "id", ""),
                name: field(resource, "name", "name", ""),
                path: field(resource, "path", "path", ""),
                enabled: field(resource, "enabled", "enabled", false),
                origin: field(resource, "origin", "origin", "package"),
                sourceType: field(
                  resource,
                  "sourceType",
                  "source_type",
                  "local",
                ),
                packageId: optionalString(resource, "packageId", "package_id"),
                packageSource: optionalString(
                  resource,
                  "packageSource",
                  "package_source",
                ),
                version: optionalString(resource, "version", "version"),
                status: field(resource, "status", "status", "invalid"),
                error: optionalString(resource, "error", "error"),
              };
            })
          : [],
        error: optionalString(packageItem, "error", "error"),
      };
    }),
  };
};

const adaptSearchResult = (value: unknown): PiPackageSearchResult => {
  const result = asRecord(value);
  const items = Array.isArray(result.items) ? result.items : [];
  return {
    items: items.map((item) => {
      const packageItem = asRecord(item);
      return {
        name: field(packageItem, "name", "name", ""),
        version: field(packageItem, "version", "version", ""),
        description: optionalString(packageItem, "description", "description"),
        publisher: optionalString(packageItem, "publisher", "publisher"),
        license: optionalString(packageItem, "license", "license"),
        publishedAt: optionalString(packageItem, "publishedAt", "published_at"),
        npmUrl: optionalString(packageItem, "npmUrl", "npm_url"),
        repositoryUrl: optionalString(
          packageItem,
          "repositoryUrl",
          "repository_url",
        ),
        homepageUrl: optionalString(packageItem, "homepageUrl", "homepage_url"),
        source: field(packageItem, "source", "source", ""),
        downloads: field<number | undefined>(
          packageItem,
          "downloads",
          "downloads",
          undefined,
        ),
        resourceTypes: Array.isArray(
          packageItem.resourceTypes ?? packageItem.resource_types,
        )
          ? ((packageItem.resourceTypes ??
              packageItem.resource_types) as string[])
          : [],
        manifestStatus: field(
          packageItem,
          "manifestStatus",
          "manifest_status",
          "unavailable",
        ),
        installed: field(packageItem, "installed", "installed", false),
      };
    }),
    total: field(result, "total", "total", 0),
    query: field(result, "query", "query", ""),
    offset: field(result, "offset", "offset", 0),
    limit: field(result, "limit", "limit", 20),
  };
};

export const piExtensionsApi = {
  async getInventory(): Promise<PiExtensionInventory> {
    return adaptInventory(await invoke("get_pi_extension_inventory"));
  },

  async searchPackages(options: {
    query: string;
    offset: number;
    limit: number;
  }): Promise<PiPackageSearchResult> {
    return adaptSearchResult(await invoke("search_pi_packages", options));
  },

  async registerLocalExtension(path: string): Promise<PiExtensionInventory> {
    return adaptInventory(
      await invoke("register_pi_local_extension", { path }),
    );
  },

  async unregisterLocalExtension(path: string): Promise<PiExtensionInventory> {
    return adaptInventory(
      await invoke("unregister_pi_local_extension", { path }),
    );
  },

  async installPackage(source: string): Promise<PiExtensionInventory> {
    return adaptInventory(await invoke("install_pi_package", { source }));
  },

  async removePackage(source: string): Promise<PiExtensionInventory> {
    return adaptInventory(await invoke("remove_pi_package", { source }));
  },

  async setExtensionEnabled(
    id: string,
    enabled: boolean,
  ): Promise<PiExtensionInventory> {
    return adaptInventory(
      await invoke("set_pi_extension_enabled", { id, enabled }),
    );
  },

  async browseFile(): Promise<string | null> {
    const selected = await open({ multiple: false, directory: false });
    return typeof selected === "string" ? selected : null;
  },

  async browseDirectory(): Promise<string | null> {
    const selected = await open({ multiple: false, directory: true });
    return typeof selected === "string" ? selected : null;
  },
};
