import type { RefObject } from "react";
import type { TFunction } from "i18next";
import {
  ArrowLeft,
  Download,
  FolderArchive,
  FolderOpen,
  History,
  Plus,
  Search,
} from "lucide-react";
import type { AppId } from "@/platform/tauri/api";
import { Button } from "@/shared/ui/button";
import { AppSelect } from "@/shared/common/AppSelect";
import { ProfileSwitcher } from "@/features/profiles/ProfileSwitcher";
import { CcSwitchImportButton } from "@/features/providers/CcSwitchImportButton";
import { ProxyToggle } from "@/features/proxy/ProxyToggle";
import { ClaudeDesktopRouteToggle } from "@/features/proxy/ClaudeDesktopRouteToggle";
import { FailoverToggle } from "@/features/proxy/FailoverToggle";
import {
  getSkillsPageHeaderActions,
  type SkillsPageSource,
} from "@/features/skills/SkillsPage";
import type { SkillsWorkbenchHandle } from "@/features/skills/SkillsWorkbench";
import type {
  PromptPanelHandle,
  PromptPageState,
} from "@/features/prompts/PromptPanel";
import type { UnifiedMcpPanelHandle } from "@/features/mcp/UnifiedMcpPanel";
import type { InstalledSkillsPageState } from "@/features/skills/UnifiedSkillsPanel";
import type { PiExtensionsPageState } from "@/features/pi/PiExtensionsPanel";
import type { PageHeaderOverflowAction } from "./PageHeader";
import type { AppView } from "./types";

export interface AppHeaderProps {
  t: TFunction;
  currentView: AppView;
  activeApp: AppId;
  enableLocalProxy: boolean;
  enableFailoverToggle: boolean;
  promptApp: AppId;
  availablePromptApps: readonly AppId[];
  promptPageState: PromptPageState;
  piExtensionsPageState: PiExtensionsPageState;
  installedSkillsPageState: InstalledSkillsPageState;
  skillsDiscoverySource: SkillsPageSource;
  hasUnmanagedSkills: boolean;
  promptPanelRef: RefObject<PromptPanelHandle>;
  mcpPanelRef: RefObject<UnifiedMcpPanelHandle>;
  skillsPageRef: RefObject<SkillsWorkbenchHandle>;
  skillsWorkbenchRef: RefObject<SkillsWorkbenchHandle>;
  onPromptAppChange: (app: AppId) => void;
  onPromptPageStateChange: (state: PromptPageState) => void;
  onPiExtensionsPageStateChange: (state: PiExtensionsPageState) => void;
  onInstalledSkillsPageStateChange: (state: InstalledSkillsPageState) => void;
  onViewChange: (view: AppView) => void;
  onAddProvider: () => void;
}

export function getAppViewTitle({
  t,
  currentView,
  promptApp,
  promptPageState,
  piExtensionsPageState,
  installedSkillsPageState,
}: Pick<
  AppHeaderProps,
  | "t"
  | "currentView"
  | "promptApp"
  | "promptPageState"
  | "piExtensionsPageState"
  | "installedSkillsPageState"
>): string {
  switch (currentView) {
    case "providers":
      return t("provider.title");
    case "announcements":
      return t("announcements.title");
    case "settings":
      return t("settings.title");
    case "prompts":
      if (promptPageState.mode === "create") {
        return t("prompts.addTitle", { appName: t(`apps.${promptApp}`) });
      }
      if (promptPageState.mode === "edit") {
        return promptPageState.name;
      }
      return t("prompts.manage");
    case "skills":
      if (installedSkillsPageState.mode === "detail") {
        return installedSkillsPageState.name;
      }
      return t("skills.title");
    case "skillsDiscovery":
      return t("skills.title");
    case "mcp":
      return t("mcp.unifiedPanel.title");
    case "sessions":
      return t("sessionManager.title");
    case "workspace":
      return t("workspace.title");
    case "openclawEnv":
      return t("openclaw.env.title");
    case "openclawTools":
      return t("openclaw.tools.title");
    case "openclawAgents":
      return t("openclaw.agents.title");
    case "hermesMemory":
      return t("hermes.memory.title");
    case "piExtensions":
      if (piExtensionsPageState.mode === "detail") {
        return piExtensionsPageState.name;
      }
      return t("piExtensions.title");
  }
}

export function getAppViewContext(
  t: TFunction,
  currentView: AppView,
): string | undefined {
  return currentView === "settings" ? t("settings.description") : undefined;
}

export function AppHeaderActions(props: AppHeaderProps) {
  const {
    t,
    currentView,
    activeApp,
    enableLocalProxy,
    enableFailoverToggle,
    promptApp,
    availablePromptApps,
    promptPageState,
    piExtensionsPageState,
    installedSkillsPageState,
    promptPanelRef,
    mcpPanelRef,
    skillsWorkbenchRef,
    onPromptAppChange,
    onPromptPageStateChange,
    onPiExtensionsPageStateChange,
    onInstalledSkillsPageStateChange,
    onViewChange,
    onAddProvider,
  } = props;

  if (currentView === "providers") {
    return (
      <>
        {activeApp !== "opencode" &&
          activeApp !== "openclaw" &&
          activeApp !== "hermes" && (
            <div className="flex shrink-0 items-center gap-2">
              {activeApp === "claude-desktop" ? (
                <ClaudeDesktopRouteToggle />
              ) : (
                enableLocalProxy && <ProxyToggle activeApp={activeApp} />
              )}
              {activeApp !== "claude-desktop" && enableFailoverToggle && (
                <FailoverToggle activeApp={activeApp} />
              )}
            </div>
          )}
        <span className="page-header-secondary-action">
          <CcSwitchImportButton appId={activeApp} />
        </span>
        <span className="page-header-secondary-action">
          <ProfileSwitcher activeApp={activeApp} />
        </span>
        <Button type="button" size="sm" onClick={onAddProvider}>
          <Plus className="h-4 w-4" />
          <span>{t("provider.addProvider")}</span>
        </Button>
      </>
    );
  }

  if (currentView === "prompts") {
    if (promptPageState.mode !== "list") {
      return (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            onPromptPageStateChange({ mode: "list" });
            promptPanelRef.current?.closeEditor();
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t("common.back")}</span>
        </Button>
      );
    }
    return (
      <>
        <AppSelect
          value={promptApp}
          appIds={availablePromptApps}
          onValueChange={onPromptAppChange}
          ariaLabel={t("prompts.selectApplication")}
        />
        <Button
          type="button"
          size="sm"
          onClick={() => onPromptPageStateChange({ mode: "create" })}
        >
          <Plus className="h-4 w-4" />
          <span>{t("prompts.add")}</span>
        </Button>
      </>
    );
  }

  if (
    currentView === "piExtensions" &&
    piExtensionsPageState.mode === "detail"
  ) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onPiExtensionsPageStateChange({ mode: "list" })}
      >
        <ArrowLeft className="h-4 w-4" />
        <span>{t("common.back")}</span>
      </Button>
    );
  }

  if (currentView === "skills" && installedSkillsPageState.mode === "detail") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onInstalledSkillsPageStateChange({ mode: "list" })}
      >
        <ArrowLeft className="h-4 w-4" />
        <span>{t("common.back")}</span>
      </Button>
    );
  }

  if (currentView === "mcp") {
    return (
      <Button
        type="button"
        size="sm"
        onClick={() => mcpPanelRef.current?.openAdd()}
      >
        <Plus className="h-4 w-4" />
        <span>{t("mcp.addMcp")}</span>
      </Button>
    );
  }

  if (currentView === "skills") {
    return (
      <Button
        type="button"
        size="sm"
        onClick={() => skillsWorkbenchRef.current?.openDiscovery()}
      >
        <Search className="h-4 w-4" />
        <span>{t("skills.discover")}</span>
      </Button>
    );
  }

  if (currentView === "skillsDiscovery") {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => onViewChange("skills")}
        title={t("common.back", { defaultValue: "Back" })}
        aria-label={t("common.back", { defaultValue: "Back" })}
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>
    );
  }

  return null;
}

export function getAppHeaderOverflowActions(
  props: AppHeaderProps,
): PageHeaderOverflowAction[] {
  const {
    t,
    currentView,
    activeApp,
    skillsDiscoverySource,
    hasUnmanagedSkills,
    mcpPanelRef,
    skillsPageRef,
    skillsWorkbenchRef,
  } = props;

  if (currentView === "providers") {
    return [
      ...(activeApp === "codex"
        ? [
            {
              key: "import-cc-switch",
              label: t("provider.importFromCcSwitch"),
              icon: <Download className="h-4 w-4" />,
              onSelect: () => {
                document
                  .querySelector<HTMLButtonElement>(
                    '[data-header-action="import-cc-switch"]',
                  )
                  ?.click();
              },
            },
          ]
        : []),
      ...(activeApp === "claude" ||
      activeApp === "claude-desktop" ||
      activeApp === "codex"
        ? [
            {
              key: "open-profile-switcher",
              label: t("profiles.manage"),
              icon: <FolderOpen className="h-4 w-4" />,
              onSelect: () => {
                document
                  .querySelector<HTMLButtonElement>(
                    '[data-header-action="profile-switcher"]',
                  )
                  ?.click();
              },
            },
          ]
        : []),
    ];
  }

  if (currentView === "mcp") {
    return [
      {
        key: "import-mcp",
        label: t("mcp.importExisting"),
        icon: <Download className="h-4 w-4" />,
        onSelect: () => mcpPanelRef.current?.openImport(),
      },
    ];
  }

  if (currentView === "skills") {
    return [
      {
        key: "restore-skills",
        label: t("skills.restoreFromBackup.button"),
        icon: <History className="h-4 w-4" />,
        onSelect: () => skillsWorkbenchRef.current?.openRestoreFromBackup(),
      },
      {
        key: "install-skills-zip",
        label: t("skills.installFromZip.button"),
        icon: <FolderArchive className="h-4 w-4" />,
        onSelect: () => skillsWorkbenchRef.current?.openInstallFromZip(),
      },
      {
        key: "import-skills",
        label: t("skills.import"),
        icon: <Download className="h-4 w-4" />,
        onSelect: () => skillsWorkbenchRef.current?.openImport(),
        indicator: hasUnmanagedSkills,
      },
    ];
  }

  if (currentView === "skillsDiscovery") {
    return getSkillsPageHeaderActions(skillsDiscoverySource).map(
      ({ key, labelKey, Icon, execute }) => ({
        key,
        label: t(labelKey),
        icon: <Icon className="h-4 w-4" />,
        onSelect: () => execute(skillsPageRef.current),
      }),
    );
  }

  return [];
}
