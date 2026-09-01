import type { Dispatch, RefObject, SetStateAction } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { AppId } from "@/platform/tauri/api";
import type { Provider } from "@/shared/contracts";
import type { AppView } from "./types";
import { AnnouncementCenter } from "@/features/announcements/AnnouncementCenter";
import { SettingsPage } from "@/features/settings/SettingsPage";
import PromptPanel, {
  type PromptPanelHandle,
  type PromptPageState,
} from "@/features/prompts/PromptPanel";
import HermesMemoryPanel from "@/features/hermes/HermesMemoryPanel";
import PiExtensionsPanel, {
  type PiExtensionsPageState,
} from "@/features/pi/PiExtensionsPanel";
import SkillsWorkbench, {
  type SkillsWorkbenchHandle,
} from "@/features/skills/SkillsWorkbench";
import type { InstalledSkillsPageState } from "@/features/skills/UnifiedSkillsPanel";
import type { SkillsPageSource } from "@/features/skills/SkillsPage";
import UnifiedMcpPanel, {
  type UnifiedMcpPanelHandle,
} from "@/features/mcp/UnifiedMcpPanel";
import { SessionManagerPage } from "@/features/sessions/SessionManagerPage";
import WorkspaceFilesPanel from "@/features/workspace/WorkspaceFilesPanel";
import EnvPanel from "@/features/openclaw/EnvPanel";
import ToolsPanel from "@/features/openclaw/ToolsPanel";
import AgentsDefaultsPanel from "@/features/openclaw/AgentsDefaultsPanel";
import { ProviderList } from "@/features/providers/ProviderList";
import { supportsCapability } from "@/shared/platform/appRegistry";

interface AppViewRendererProps {
  currentView: AppView;
  activeApp: AppId;
  providers: Record<string, Provider>;
  currentProviderId: string;
  activeProviderId?: string;
  isLoading: boolean;
  isProxyRunning: boolean;
  isCurrentAppTakeoverActive: boolean;
  promptApp: AppId;
  availableSkillsApps: readonly AppId[];
  promptPageState: PromptPageState;
  piExtensionsPageState: PiExtensionsPageState;
  installedSkillsPageState: InstalledSkillsPageState;
  sessionInstanceId: string | null;
  requestedAnnouncementId: string | null;
  settingsDefaultTab: string;
  promptPanelRef: RefObject<PromptPanelHandle>;
  mcpPanelRef: RefObject<UnifiedMcpPanelHandle>;
  skillsPageRef: RefObject<SkillsWorkbenchHandle>;
  skillsWorkbenchRef: RefObject<SkillsWorkbenchHandle>;
  onViewChange: (view: AppView) => void;
  onOpenUpdate: () => void;
  onImportSuccess: () => Promise<void>;
  onPromptPageStateChange: Dispatch<SetStateAction<PromptPageState>>;
  onPiExtensionsPageStateChange: Dispatch<
    SetStateAction<PiExtensionsPageState>
  >;
  onInstalledSkillsPageStateChange: Dispatch<
    SetStateAction<InstalledSkillsPageState>
  >;
  onSkillsSourceChange: Dispatch<SetStateAction<SkillsPageSource>>;
  onSessionInstanceApplied: () => void;
  onSwitchProvider: (provider: Provider) => void;
  onEditProvider: (provider: Provider) => void;
  onDeleteProvider: (provider: Provider) => void;
  onRemoveProvider: (provider: Provider) => void;
  onDisableOmo: () => void;
  onDisableOmoSlim: () => void;
  onDuplicateProvider: (provider: Provider) => Promise<void>;
  onConfigureUsage: (provider: Provider) => void;
  onOpenWebsite: (url: string) => Promise<void>;
  onOpenTerminal: (provider: Provider) => Promise<void>;
  onManageRuntimeEnvironments: (provider: Provider) => void;
  onCreateProvider: () => void;
  onSetAsDefault: ((provider: Provider) => void) | undefined;
}

export function AppViewRenderer(props: AppViewRendererProps) {
  const {
    currentView,
    activeApp,
    providers,
    currentProviderId,
    activeProviderId,
    isLoading,
    isProxyRunning,
    isCurrentAppTakeoverActive,
    promptApp,
    availableSkillsApps,
    promptPageState,
    piExtensionsPageState,
    installedSkillsPageState,
    sessionInstanceId,
    requestedAnnouncementId,
    settingsDefaultTab,
    promptPanelRef,
    mcpPanelRef,
    skillsPageRef,
    skillsWorkbenchRef,
    onViewChange,
    onOpenUpdate,
    onImportSuccess,
    onPromptPageStateChange,
    onPiExtensionsPageStateChange,
    onInstalledSkillsPageStateChange,
    onSkillsSourceChange,
    onSessionInstanceApplied,
    onSwitchProvider,
    onEditProvider,
    onDeleteProvider,
    onRemoveProvider,
    onDisableOmo,
    onDisableOmoSlim,
    onDuplicateProvider,
    onConfigureUsage,
    onOpenWebsite,
    onOpenTerminal,
    onManageRuntimeEnvironments,
    onCreateProvider,
    onSetAsDefault,
  } = props;

  const content = (() => {
    switch (currentView) {
      case "announcements":
        return (
          <AnnouncementCenter
            onOpenUpdate={onOpenUpdate}
            requestedAnnouncementId={requestedAnnouncementId}
          />
        );
      case "settings":
        return (
          <SettingsPage
            open
            onOpenChange={() => onViewChange("providers")}
            onImportSuccess={onImportSuccess}
            defaultTab={settingsDefaultTab}
          />
        );
      case "prompts":
        return (
          <PromptPanel
            key={promptApp}
            ref={promptPanelRef}
            appId={promptApp}
            requestedMode={promptPageState.mode}
            onPageStateChange={onPromptPageStateChange}
          />
        );
      case "hermesMemory":
        return <HermesMemoryPanel />;
      case "piExtensions":
        return (
          <PiExtensionsPanel
            requestedMode={piExtensionsPageState.mode}
            onPageStateChange={onPiExtensionsPageStateChange}
          />
        );
      case "skills":
        return (
          <SkillsWorkbench
            ref={skillsWorkbenchRef}
            initialTab="installed"
            availableApps={availableSkillsApps}
            onSourceChange={onSkillsSourceChange}
            requestedMode={installedSkillsPageState.mode}
            onPageStateChange={onInstalledSkillsPageStateChange}
          />
        );
      case "skillsDiscovery":
        return (
          <SkillsWorkbench
            ref={skillsPageRef}
            initialTab="discover"
            availableApps={availableSkillsApps}
            onSourceChange={onSkillsSourceChange}
          />
        );
      case "mcp":
        return <UnifiedMcpPanel ref={mcpPanelRef} activeApp={activeApp} />;
      case "sessions":
        return (
          <SessionManagerPage
            initialInstanceId={sessionInstanceId}
            onInitialInstanceApplied={onSessionInstanceApplied}
          />
        );
      case "workspace":
        return <WorkspaceFilesPanel />;
      case "openclawEnv":
        return <EnvPanel />;
      case "openclawTools":
        return <ToolsPanel />;
      case "openclawAgents":
        return <AgentsDefaultsPanel />;
      default:
        return (
          <div className="px-6 flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto overflow-x-hidden pb-12 px-1">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeApp}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-4"
                >
                  <ProviderList
                    providers={providers}
                    currentProviderId={currentProviderId}
                    appId={activeApp}
                    isLoading={isLoading}
                    isProxyRunning={isProxyRunning}
                    isProxyTakeover={
                      isProxyRunning && isCurrentAppTakeoverActive
                    }
                    activeProviderId={activeProviderId}
                    onSwitch={onSwitchProvider}
                    onEdit={onEditProvider}
                    onDelete={onDeleteProvider}
                    onRemoveFromConfig={
                      activeApp === "opencode" ||
                      activeApp === "openclaw" ||
                      activeApp === "hermes" ||
                      activeApp === "pi"
                        ? onRemoveProvider
                        : undefined
                    }
                    onDisableOmo={
                      activeApp === "opencode" ? onDisableOmo : undefined
                    }
                    onDisableOmoSlim={
                      activeApp === "opencode" ? onDisableOmoSlim : undefined
                    }
                    onDuplicate={onDuplicateProvider}
                    onConfigureUsage={onConfigureUsage}
                    onOpenWebsite={onOpenWebsite}
                    onOpenTerminal={
                      supportsCapability(activeApp, "runtimeEnvironments")
                        ? onOpenTerminal
                        : undefined
                    }
                    onManageRuntimeEnvironments={
                      supportsCapability(activeApp, "runtimeEnvironments")
                        ? onManageRuntimeEnvironments
                        : undefined
                    }
                    onCreate={onCreateProvider}
                    onSetAsDefault={onSetAsDefault}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        );
    }
  })();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={currentView}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {content}
      </motion.div>
    </AnimatePresence>
  );
}
