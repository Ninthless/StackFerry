import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Plus } from "lucide-react";
import { type AppId } from "@/lib/api";
import { usePromptActions } from "@/hooks/usePromptActions";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import PromptListItem from "./PromptListItem";
import PromptFormPanel from "./PromptFormPanel";
import { ConfirmDialog } from "../ConfirmDialog";
import { Button } from "@/components/ui/button";
import { WorkbenchEmptyState } from "@/components/common/WorkbenchEmptyState";

interface PromptPanelProps {
  appId: AppId;
}

export interface PromptPanelHandle {
  openAdd: () => void;
}

const PromptPanel = React.forwardRef<PromptPanelHandle, PromptPanelProps>(
  ({ appId }, ref) => {
    const { t } = useTranslation();
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [confirmDialog, setConfirmDialog] = useState<{
      isOpen: boolean;
      titleKey: string;
      messageKey: string;
      messageParams?: Record<string, unknown>;
      onConfirm: () => void;
    } | null>(null);

    const {
      prompts,
      loading,
      reload,
      savePrompt,
      deletePrompt,
      toggleEnabled,
    } = usePromptActions(appId);

    useEffect(() => {
      reload();
    }, [reload]);

    useEffect(() => {
      const handlePromptImported = (event: Event) => {
        const customEvent = event as CustomEvent;
        if (customEvent.detail?.app === appId) {
          reload();
        }
      };

      window.addEventListener("prompt-imported", handlePromptImported);
      return () => {
        window.removeEventListener("prompt-imported", handlePromptImported);
      };
    }, [appId, reload]);

    useTauriEvent("profile-applied", reload);

    const handleAdd = () => {
      setEditingId(null);
      setIsFormOpen(true);
    };

    React.useImperativeHandle(ref, () => ({
      openAdd: handleAdd,
    }));

    const handleEdit = (id: string) => {
      setEditingId(id);
      setIsFormOpen(true);
    };

    const handleDelete = (id: string) => {
      const prompt = prompts[id];
      setConfirmDialog({
        isOpen: true,
        titleKey: "prompts.confirm.deleteTitle",
        messageKey: "prompts.confirm.deleteMessage",
        messageParams: { name: prompt?.name },
        onConfirm: async () => {
          try {
            await deletePrompt(id);
            setConfirmDialog(null);
          } catch {}
        },
      });
    };

    const promptEntries = useMemo(() => Object.entries(prompts), [prompts]);

    const enabledPrompt = promptEntries.find(([_, p]) => p.enabled);

    return (
      <div className="flex flex-col flex-1 min-h-0 px-6">
        <div className="mb-4 flex flex-shrink-0 items-center border-b border-border py-3">
          <div className="min-w-0 truncate text-sm text-muted-foreground">
            {t("prompts.count", { count: promptEntries.length })} ·{" "}
            {enabledPrompt
              ? t("prompts.enabledName", { name: enabledPrompt[1].name })
              : t("prompts.noneEnabled")}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-16">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              {t("prompts.loading")}
            </div>
          ) : promptEntries.length === 0 ? (
            <WorkbenchEmptyState
              icon={<FileText className="h-5 w-5" />}
              title={t("prompts.empty")}
              description={t("prompts.emptyDescription")}
              actions={
                <Button type="button" size="sm" onClick={handleAdd}>
                  <Plus className="h-4 w-4" />
                  {t("prompts.add")}
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {promptEntries.map(([id, prompt]) => (
                <PromptListItem
                  key={id}
                  id={id}
                  prompt={prompt}
                  onToggle={toggleEnabled}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>

        {isFormOpen && (
          <PromptFormPanel
            appId={appId}
            editingId={editingId || undefined}
            initialData={editingId ? prompts[editingId] : undefined}
            onSave={savePrompt}
            onClose={() => setIsFormOpen(false)}
          />
        )}

        {confirmDialog && (
          <ConfirmDialog
            isOpen={confirmDialog.isOpen}
            title={t(confirmDialog.titleKey)}
            message={t(confirmDialog.messageKey, confirmDialog.messageParams)}
            onConfirm={confirmDialog.onConfirm}
            onCancel={() => setConfirmDialog(null)}
          />
        )}
      </div>
    );
  },
);

PromptPanel.displayName = "PromptPanel";

export default PromptPanel;
