import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export type PiExtensionOrigin = "auto" | "local" | "package";
export type PiExtensionSourceType = "auto" | "local" | "npm" | "git";
export type PiExtensionScope = "global" | "project";
export type PiInventoryStatus =
  | "active"
  | "disabled"
  | "missing"
  | "invalid"
  | "conflict";
export type PiPackageStatus = "installed" | "missing" | "invalid" | "conflict";
export type PiExtensionRegistrationKind = "tool" | "command" | "flag";

export interface PiRuntimeInfo {
  scope: PiExtensionScope;
  projectDir?: string;
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
  registrations: PiExtensionRegistration[];
  analysisComplete: boolean;
  conflicts: PiExtensionConflict[];
  scope: PiExtensionScope;
  resourceKey: string;
  projectDir?: string;
}

export interface PiExtensionRegistration {
  kind: PiExtensionRegistrationKind;
  name: string;
}

export interface PiExtensionConflict {
  kind: PiExtensionRegistrationKind | "path";
  name: string;
  otherExtensionId: string;
  otherExtensionName: string;
  otherExtensionPath: string;
  otherExtensionScope: PiExtensionScope;
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
  scope: PiExtensionScope;
  resourceKey: string;
  projectDir?: string;
}

export interface PiExtensionInventory {
  runtimes: PiRuntimeInfo[];
  extensions: PiExtension[];
  packages: PiPackage[];
  project?: PiProjectStatus;
}

export interface PiProjectStatus {
  projectDir: string;
  trusted: boolean;
  decision?: boolean;
  inheritedFrom?: string;
}

export interface PiExtensionTarget {
  scope: PiExtensionScope;
  resourceKey: string;
  projectDir?: string;
}

export interface PiScopeTarget {
  scope: PiExtensionScope;
  projectDir?: string;
}

export interface PiPackageInstallResult {
  inventory: PiExtensionInventory;
  isolatedExtensions: PiExtension[];
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

const adaptRegistration = (value: unknown): PiExtensionRegistration => {
  const registration = asRecord(value);
  return {
    kind: field(registration, "kind", "kind", "tool"),
    name: field(registration, "name", "name", ""),
  };
};

const adaptConflict = (value: unknown): PiExtensionConflict => {
  const conflict = asRecord(value);
  return {
    kind: field(conflict, "kind", "kind", "tool"),
    name: field(conflict, "name", "name", ""),
    otherExtensionId: field(
      conflict,
      "otherExtensionId",
      "other_extension_id",
      "",
    ),
    otherExtensionName: field(
      conflict,
      "otherExtensionName",
      "other_extension_name",
      "",
    ),
    otherExtensionPath: field(
      conflict,
      "otherExtensionPath",
      "other_extension_path",
      "",
    ),
    otherExtensionScope: field(
      conflict,
      "otherExtensionScope",
      "other_extension_scope",
      "global",
    ),
  };
};

const adaptExtension = (value: unknown): PiExtension => {
  const extension = asRecord(value);
  const registrations = Array.isArray(extension.registrations)
    ? extension.registrations
    : [];
  const conflicts = Array.isArray(extension.conflicts)
    ? extension.conflicts
    : [];
  return {
    id: field(extension, "id", "id", ""),
    name: field(extension, "name", "name", ""),
    path: field(extension, "path", "path", ""),
    enabled: field(extension, "enabled", "enabled", false),
    origin: field(extension, "origin", "origin", "local"),
    sourceType: field(extension, "sourceType", "source_type", "local"),
    packageId: optionalString(extension, "packageId", "package_id"),
    packageSource: optionalString(extension, "packageSource", "package_source"),
    version: optionalString(extension, "version", "version"),
    status: field(extension, "status", "status", "invalid"),
    error: optionalString(extension, "error", "error"),
    registrations: registrations.map(adaptRegistration),
    analysisComplete: field(
      extension,
      "analysisComplete",
      "analysis_complete",
      false,
    ),
    conflicts: conflicts.map(adaptConflict),
    scope: field(extension, "scope", "scope", "global"),
    resourceKey: field(
      extension,
      "resourceKey",
      "resource_key",
      field(extension, "id", "id", ""),
    ),
    projectDir: optionalString(extension, "projectDir", "project_dir"),
  };
};

const adaptInventory = (value: unknown): PiExtensionInventory => {
  const inventory = asRecord(value);
  const runtimeItems = Array.isArray(inventory.runtimes)
    ? inventory.runtimes
    : inventory.runtime
      ? [inventory.runtime]
      : [];
  const extensions = Array.isArray(inventory.extensions)
    ? inventory.extensions
    : [];
  const packages = Array.isArray(inventory.packages) ? inventory.packages : [];

  return {
    runtimes: runtimeItems.map((item) => {
      const runtime = asRecord(item);
      return {
        scope: field(runtime, "scope", "scope", "global"),
        projectDir: optionalString(runtime, "projectDir", "project_dir"),
        piDir: field(runtime, "piDir", "pi_dir", ""),
        settingsPath: field(runtime, "settingsPath", "settings_path", ""),
        cliAvailable: field(runtime, "cliAvailable", "cli_available", false),
        cliPath: optionalString(runtime, "cliPath", "cli_path"),
        cliVersion: optionalString(runtime, "cliVersion", "cli_version"),
        mutable: field(runtime, "mutable", "mutable", true),
        error: optionalString(runtime, "error", "error"),
      };
    }),
    extensions: extensions.map(adaptExtension),
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
          ? packageItem.extensions.map(adaptExtension)
          : [],
        error: optionalString(packageItem, "error", "error"),
        scope: field(packageItem, "scope", "scope", "global"),
        resourceKey: field(
          packageItem,
          "resourceKey",
          "resource_key",
          field(packageItem, "id", "id", ""),
        ),
        projectDir: optionalString(packageItem, "projectDir", "project_dir"),
      };
    }),
    project:
      (inventory.projectTrust ?? inventory.project_trust)
        ? (() => {
            const project = asRecord(
              inventory.projectTrust ?? inventory.project_trust,
            );
            return {
              projectDir: field(project, "projectDir", "project_dir", ""),
              trusted: field(project, "trusted", "trusted", false),
              decision: field<boolean | undefined>(
                project,
                "decision",
                "decision",
                undefined,
              ),
              inheritedFrom: optionalString(
                project,
                "inheritedFrom",
                "inherited_from",
              ),
            };
          })()
        : undefined,
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
  async getInventory(projectDir?: string): Promise<PiExtensionInventory> {
    return adaptInventory(
      await invoke("get_pi_extension_inventory", { projectDir }),
    );
  },

  async searchPackages(options: {
    query: string;
    offset: number;
    limit: number;
  }): Promise<PiPackageSearchResult> {
    return adaptSearchResult(await invoke("search_pi_packages", options));
  },

  async registerLocalExtension(
    path: string,
    target: PiScopeTarget,
  ): Promise<PiExtensionInventory> {
    return adaptInventory(
      await invoke("register_pi_local_extension", {
        path,
        scope: target.scope,
        projectDir: target.projectDir,
      }),
    );
  },

  async unregisterLocalExtension(
    target: PiExtensionTarget,
  ): Promise<PiExtensionInventory> {
    return adaptInventory(
      await invoke("unregister_pi_local_extension", {
        resourceKey: target.resourceKey,
        scope: target.scope,
        projectDir: target.projectDir,
      }),
    );
  },

  async installPackage(
    source: string,
    target: PiScopeTarget,
  ): Promise<PiPackageInstallResult> {
    const result = asRecord(
      await invoke("install_pi_package", {
        source,
        scope: target.scope,
        projectDir: target.projectDir,
      }),
    );
    const isolatedExtensions = Array.isArray(
      result.isolatedExtensions ?? result.isolated_extensions,
    )
      ? (
          (result.isolatedExtensions ?? result.isolated_extensions) as unknown[]
        ).map(adaptExtension)
      : [];
    return {
      inventory: adaptInventory(result.inventory),
      isolatedExtensions,
    };
  },

  async removePackage(
    target: PiExtensionTarget,
  ): Promise<PiExtensionInventory> {
    return adaptInventory(
      await invoke("remove_pi_package", {
        resourceKey: target.resourceKey,
        scope: target.scope,
        projectDir: target.projectDir,
      }),
    );
  },

  async setExtensionEnabled(
    target: PiExtensionTarget,
    enabled: boolean,
  ): Promise<PiExtensionInventory> {
    return adaptInventory(
      await invoke("set_pi_extension_enabled", {
        resourceKey: target.resourceKey,
        enabled,
        scope: target.scope,
        projectDir: target.projectDir,
      }),
    );
  },

  async trustProject(projectDir: string): Promise<PiExtensionInventory> {
    return adaptInventory(
      await invoke("set_pi_project_trust", { projectDir, trusted: true }),
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
