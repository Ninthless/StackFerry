import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { promptsApi, type Prompt, type AppId } from "@/platform/tauri/api";

export function usePromptActions(appId: AppId) {
  const { t } = useTranslation();
  const [prompts, setPrompts] = useState<Record<string, Prompt>>({});
  const [loading, setLoading] = useState(false);
  const [pendingToggleId, setPendingToggleId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await promptsApi.getPrompts(appId);
      setPrompts(data);
    } catch (error) {
      toast.error(t("prompts.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [appId, t]);

  const savePrompt = useCallback(
    async (id: string, prompt: Prompt) => {
      try {
        await promptsApi.upsertPrompt(appId, id, prompt);
        await reload();
        toast.success(t("prompts.saveSuccess"), { closeButton: true });
      } catch (error) {
        toast.error(t("prompts.saveFailed"));
        throw error;
      }
    },
    [appId, reload, t],
  );

  const deletePrompt = useCallback(
    async (id: string) => {
      if (prompts[id]?.enabled) {
        toast.error(t("prompts.deleteEnabledReason"));
        return;
      }
      try {
        await promptsApi.deletePrompt(appId, id);
        await reload();
        toast.success(t("prompts.deleteSuccess"), { closeButton: true });
      } catch (error) {
        toast.error(t("prompts.deleteFailed"));
        throw error;
      }
    },
    [appId, prompts, reload, t],
  );

  const enablePrompt = useCallback(
    async (id: string) => {
      try {
        await promptsApi.enablePrompt(appId, id);
        await reload();
        toast.success(t("prompts.enableSuccess"), { closeButton: true });
      } catch (error) {
        toast.error(t("prompts.enableFailed"));
        throw error;
      }
    },
    [appId, reload, t],
  );

  const toggleEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      if (pendingToggleId) return;
      const previousPrompts = prompts;

      if (enabled) {
        const updatedPrompts = Object.keys(prompts).reduce(
          (acc, key) => {
            acc[key] = {
              ...prompts[key],
              enabled: key === id,
            };
            return acc;
          },
          {} as Record<string, Prompt>,
        );
        setPrompts(updatedPrompts);
      } else {
        setPrompts((prev) => ({
          ...prev,
          [id]: {
            ...prev[id],
            enabled: false,
          },
        }));
      }

      setPendingToggleId(id);
      try {
        if (enabled) {
          await promptsApi.enablePrompt(appId, id);
          toast.success(t("prompts.enableSuccess"), { closeButton: true });
        } else {
          await promptsApi.upsertPrompt(appId, id, {
            ...prompts[id],
            enabled: false,
          });
          toast.success(t("prompts.disableSuccess"), { closeButton: true });
        }
        await reload();
      } catch (error) {
        setPrompts(previousPrompts);
        toast.error(
          enabled ? t("prompts.enableFailed") : t("prompts.disableFailed"),
        );
        throw error;
      } finally {
        setPendingToggleId(null);
      }
    },
    [appId, pendingToggleId, prompts, reload, t],
  );

  const importFromFile = useCallback(async () => {
    try {
      const id = await promptsApi.importFromFile(appId);
      await reload();
      toast.success(t("prompts.importSuccess"), { closeButton: true });
      return id;
    } catch (error) {
      toast.error(t("prompts.importFailed"));
      throw error;
    }
  }, [appId, reload, t]);

  const getCurrentFileContent = useCallback(async () => {
    try {
      return await promptsApi.getCurrentFileContent(appId);
    } catch (error) {
      toast.error(t("prompts.currentFileFailed"));
      throw error;
    }
  }, [appId, t]);

  return {
    prompts,
    loading,
    reload,
    savePrompt,
    deletePrompt,
    enablePrompt,
    toggleEnabled,
    pendingToggleId,
    importFromFile,
    getCurrentFileContent,
  };
}
