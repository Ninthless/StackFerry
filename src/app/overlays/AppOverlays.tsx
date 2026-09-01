import type { Dispatch, SetStateAction } from "react";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import type { AppId } from "@/platform/tauri/api";
import { hermesApi } from "@/platform/tauri/api/hermes";
import type { Provider, UsageScript } from "@/shared/contracts";
import { extractErrorMessage } from "@/shared/lib/errorUtils";
import { AddProviderDialog } from "@/features/providers/AddProviderDialog";
import { EditProviderDialog } from "@/features/providers/EditProviderDialog";
import { AgentInstancesDialog } from "@/features/providers/AgentInstancesDialog";
import UsageScriptModal from "@/features/usage/UsageScriptModal";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { CriticalAnnouncementDialog } from "@/features/announcements/CriticalAnnouncementDialog";
import { DeepLinkImportDialog } from "./DeepLinkImportDialog";
import { FirstRunNoticeDialog } from "./FirstRunNoticeDialog";
import type { AppView } from "@/app/shell/types";

export interface ProviderConfirmAction {
  provider: Provider;
  action: "remove" | "delete";
}

export interface RuntimeEnvironmentTarget {
  appId: AppId;
  provider: Provider;
}

interface AppOverlaysProps {
  t: TFunction;
  activeApp: AppId;
  isAddOpen: boolean;
  editingProvider: Provider | null;
  effectiveEditingProvider: Provider | null;
  usageProvider: Provider | null;
  effectiveUsageProvider: Provider | null;
  runtimeEnvironmentTarget: RuntimeEnvironmentTarget | null;
  confirmAction: ProviderConfirmAction | null;
  launchDashboardOpen: boolean;
  isCurrentAppTakeoverActive: boolean;
  onAddOpenChange: Dispatch<SetStateAction<boolean>>;
  onEditingProviderChange: Dispatch<SetStateAction<Provider | null>>;
  onUsageProviderChange: Dispatch<SetStateAction<Provider | null>>;
  onRuntimeEnvironmentTargetChange: Dispatch<
    SetStateAction<RuntimeEnvironmentTarget | null>
  >;
  onConfirmActionChange: Dispatch<SetStateAction<ProviderConfirmAction | null>>;
  onLaunchDashboardOpenChange: Dispatch<SetStateAction<boolean>>;
  onSettingsDefaultTabChange: Dispatch<SetStateAction<string>>;
  onViewChange: Dispatch<SetStateAction<AppView>>;
  onSessionInstanceIdChange: Dispatch<SetStateAction<string | null>>;
  onAddProvider: (provider: Omit<Provider, "id">) => Promise<void>;
  onEditProvider: (input: {
    provider: Provider;
    originalId?: string;
  }) => Promise<void>;
  onSaveUsageScript: (provider: Provider, script: UsageScript) => Promise<void>;
  onConfirmAction: () => Promise<void>;
}

export function AppOverlays({
  t,
  activeApp,
  isAddOpen,
  editingProvider,
  effectiveEditingProvider,
  usageProvider,
  effectiveUsageProvider,
  runtimeEnvironmentTarget,
  confirmAction,
  launchDashboardOpen,
  isCurrentAppTakeoverActive,
  onAddOpenChange,
  onEditingProviderChange,
  onUsageProviderChange,
  onRuntimeEnvironmentTargetChange,
  onConfirmActionChange,
  onLaunchDashboardOpenChange,
  onSettingsDefaultTabChange,
  onViewChange,
  onSessionInstanceIdChange,
  onAddProvider,
  onEditProvider,
  onSaveUsageScript,
  onConfirmAction,
}: AppOverlaysProps) {
  return (
    <>
      <AddProviderDialog
        open={isAddOpen}
        onOpenChange={onAddOpenChange}
        appId={activeApp}
        onSubmit={onAddProvider}
      />
      <CriticalAnnouncementDialog
        onOpenUpdate={() => {
          onSettingsDefaultTabChange("about");
          onViewChange("settings");
        }}
      />
      <EditProviderDialog
        open={Boolean(editingProvider)}
        provider={effectiveEditingProvider}
        onOpenChange={(open) => {
          if (!open) {
            onEditingProviderChange(null);
          }
        }}
        onSubmit={onEditProvider}
        appId={activeApp}
        isProxyTakeover={isCurrentAppTakeoverActive}
      />
      <AgentInstancesDialog
        open={Boolean(runtimeEnvironmentTarget)}
        appId={runtimeEnvironmentTarget?.appId ?? activeApp}
        provider={runtimeEnvironmentTarget?.provider ?? null}
        onOpenChange={(open) => {
          if (!open) onRuntimeEnvironmentTargetChange(null);
        }}
        onViewSessions={(appId, instanceId) => {
          localStorage.setItem("stackferry.sessions.providerFilter", appId);
          onSessionInstanceIdChange(instanceId);
          onRuntimeEnvironmentTargetChange(null);
          onViewChange("sessions");
        }}
      />
      {effectiveUsageProvider && (
        <UsageScriptModal
          key={effectiveUsageProvider.id}
          provider={effectiveUsageProvider}
          appId={activeApp}
          isOpen={Boolean(usageProvider)}
          onClose={() => onUsageProviderChange(null)}
          onSave={(script) => {
            if (usageProvider) {
              void onSaveUsageScript(usageProvider, script);
            }
          }}
        />
      )}
      <ConfirmDialog
        isOpen={Boolean(confirmAction)}
        title={
          confirmAction?.action === "remove"
            ? t("confirm.removeProvider")
            : t("confirm.deleteProvider")
        }
        message={
          confirmAction
            ? confirmAction.action === "remove"
              ? t("confirm.removeProviderMessage", {
                  name: confirmAction.provider.name,
                })
              : t("confirm.deleteProviderMessage", {
                  name: confirmAction.provider.name,
                })
            : ""
        }
        onConfirm={() => void onConfirmAction()}
        onCancel={() => onConfirmActionChange(null)}
      />
      <ConfirmDialog
        isOpen={launchDashboardOpen}
        title={t("hermes.webui.launchConfirmTitle")}
        message={t("hermes.webui.launchConfirmMessage")}
        confirmText={t("hermes.webui.launchConfirmAction")}
        variant="info"
        onConfirm={() => {
          onLaunchDashboardOpenChange(false);
          void (async () => {
            try {
              await hermesApi.launchDashboard();
              toast.success(t("hermes.webui.launching"));
            } catch (error) {
              toast.error(t("hermes.webui.launchFailed"), {
                description: extractErrorMessage(error) || undefined,
              });
            }
          })();
        }}
        onCancel={() => onLaunchDashboardOpenChange(false)}
      />
      <DeepLinkImportDialog />
      <FirstRunNoticeDialog />
    </>
  );
}
