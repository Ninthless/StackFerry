import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Layers, Plus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { UniversalProviderCard } from "./UniversalProviderCard";
import { UniversalProviderFormModal } from "./UniversalProviderFormModal";
import { universalProvidersApi } from "@/platform/tauri/api";
import type {
  UniversalProvider,
  UniversalProvidersMap,
} from "@/shared/contracts";
import { deepClone } from "@/shared/lib/deepClone";
import { Button } from "@/shared/ui/button";
import { WorkbenchEmptyState } from "@/shared/common/WorkbenchEmptyState";

export function UniversalProviderPanel() {
  const { t } = useTranslation();

  // 状态
  const [providers, setProviders] = useState<UniversalProvidersMap>({});
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProvider, setEditingProvider] =
    useState<UniversalProvider | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    id: string;
    name: string;
  }>({ open: false, id: "", name: "" });
  const [syncConfirm, setSyncConfirm] = useState<{
    open: boolean;
    id: string;
    name: string;
  }>({ open: false, id: "", name: "" });

  // 加载数据
  const loadProviders = useCallback(async () => {
    try {
      setLoading(true);
      const data = await universalProvidersApi.getAll();
      setProviders(data);
    } catch (error) {
      console.error("Failed to load universal providers:", error);
      toast.error(
        t("universalProvider.loadError", {
          defaultValue: "加载统一供应商失败",
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  // 添加/编辑供应商
  const handleSave = useCallback(
    async (provider: UniversalProvider) => {
      try {
        await universalProvidersApi.upsert(provider);

        // 新建模式下自动同步到各应用
        if (!editingProvider) {
          await universalProvidersApi.sync(provider.id);
        }

        toast.success(
          editingProvider
            ? t("universalProvider.updated", {
                defaultValue: "统一供应商已更新",
              })
            : t("universalProvider.addedAndSynced", {
                defaultValue: "统一供应商已添加并同步",
              }),
        );
        loadProviders();
        setEditingProvider(null);
      } catch (error) {
        console.error("Failed to save universal provider:", error);
        toast.error(
          t("universalProvider.saveError", {
            defaultValue: "保存统一供应商失败",
          }),
        );
        throw error;
      }
    },
    [editingProvider, loadProviders, t],
  );

  // 保存并同步供应商
  const handleSaveAndSync = useCallback(
    async (provider: UniversalProvider) => {
      try {
        await universalProvidersApi.upsert(provider);
        await universalProvidersApi.sync(provider.id);
        toast.success(
          t("universalProvider.savedAndSynced", {
            defaultValue: "已保存并同步到所有应用",
          }),
        );
        loadProviders();
        setEditingProvider(null);
      } catch (error) {
        console.error("Failed to save and sync universal provider:", error);
        toast.error(
          t("universalProvider.saveAndSyncError", {
            defaultValue: "保存并同步失败",
          }),
        );
        throw error;
      }
    },
    [loadProviders, t],
  );

  // 删除供应商
  const handleDelete = useCallback(async () => {
    if (!deleteConfirm.id) return;

    try {
      await universalProvidersApi.delete(deleteConfirm.id);
      toast.success(
        t("universalProvider.deleted", { defaultValue: "统一供应商已删除" }),
      );
      loadProviders();
    } catch (error) {
      console.error("Failed to delete universal provider:", error);
      toast.error(
        t("universalProvider.deleteError", {
          defaultValue: "删除统一供应商失败",
        }),
      );
    } finally {
      setDeleteConfirm({ open: false, id: "", name: "" });
    }
  }, [deleteConfirm.id, loadProviders, t]);

  // 同步供应商
  const handleSync = useCallback(async () => {
    if (!syncConfirm.id) return;

    try {
      await universalProvidersApi.sync(syncConfirm.id);
      toast.success(
        t("universalProvider.synced", { defaultValue: "已同步到所有应用" }),
      );
    } catch (error) {
      console.error("Failed to sync universal provider:", error);
      toast.error(
        t("universalProvider.syncError", {
          defaultValue: "同步统一供应商失败",
        }),
      );
    } finally {
      setSyncConfirm({ open: false, id: "", name: "" });
    }
  }, [syncConfirm.id, t]);

  // 打开同步确认
  const handleSyncClick = useCallback(
    (id: string) => {
      const provider = providers[id];
      setSyncConfirm({
        open: true,
        id,
        name: provider?.name || id,
      });
    },
    [providers],
  );

  // 复制供应商
  const handleDuplicate = useCallback(
    async (provider: UniversalProvider) => {
      const duplicated: UniversalProvider = {
        ...deepClone(provider),
        id: crypto.randomUUID(),
        name: `${provider.name} copy`,
        createdAt: Date.now(),
      };
      try {
        await universalProvidersApi.upsert(duplicated);
        await universalProvidersApi.sync(duplicated.id);
        toast.success(
          t("universalProvider.duplicatedAndSynced", {
            defaultValue: "统一供应商已复制并同步",
          }),
        );
        loadProviders();
      } catch (error) {
        console.error("Failed to duplicate universal provider:", error);
        toast.error(
          t("universalProvider.duplicateError", {
            defaultValue: "复制统一供应商失败",
          }),
        );
      }
    },
    [loadProviders, t],
  );

  // 打开编辑
  const handleEdit = useCallback((provider: UniversalProvider) => {
    setEditingProvider(provider);
    setIsFormOpen(true);
  }, []);

  // 打开删除确认
  const handleDeleteClick = useCallback(
    (id: string) => {
      const provider = providers[id];
      setDeleteConfirm({
        open: true,
        id,
        name: provider?.name || id,
      });
    },
    [providers],
  );

  const providerList = Object.values(providers);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="flex items-center gap-2 border-b border-border-default pb-4 pt-1">
        <Layers className="h-5 w-5 text-foreground" />
        <h2 className="text-lg font-semibold">
          {t("universalProvider.title", { defaultValue: "统一供应商" })}
        </h2>
        <span className="rounded-md border border-border-default bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
          {providerList.length}
        </span>
        <Button
          type="button"
          size="sm"
          className="ml-auto"
          onClick={() => setIsFormOpen(true)}
        >
          <Plus className="h-4 w-4" />
          {t("universalProvider.add", { defaultValue: "Add provider" })}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {t("universalProvider.description", {
          defaultValue:
            "统一维护连接信息，并为每个已启用的 AI 应用生成原生供应商配置。",
        })}
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : providerList.length === 0 ? (
        <WorkbenchEmptyState
          icon={<Layers className="h-5 w-5" />}
          title={t("universalProvider.empty", {
            defaultValue: "No universal providers",
          })}
          description={t("universalProvider.emptyHint", {
            defaultValue: "Create a provider to sync it across applications.",
          })}
          actions={
            <Button type="button" size="sm" onClick={() => setIsFormOpen(true)}>
              <Plus className="h-4 w-4" />
              {t("universalProvider.add", { defaultValue: "Add provider" })}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {providerList.map((provider) => (
            <UniversalProviderCard
              key={provider.id}
              provider={provider}
              onEdit={handleEdit}
              onDelete={handleDeleteClick}
              onSync={handleSyncClick}
              onDuplicate={handleDuplicate}
            />
          ))}
        </div>
      )}

      <UniversalProviderFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingProvider(null);
        }}
        onSave={handleSave}
        onSaveAndSync={handleSaveAndSync}
        editingProvider={editingProvider}
      />

      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title={t("universalProvider.deleteConfirmTitle", {
          defaultValue: "删除统一供应商",
        })}
        message={t("universalProvider.deleteConfirmDescription", {
          defaultValue: `确定要删除 "${deleteConfirm.name}" 吗？这将同时删除它在各应用中生成的供应商配置。`,
          name: deleteConfirm.name,
        })}
        confirmText={t("common.delete", { defaultValue: "删除" })}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm({ open: false, id: "", name: "" })}
      />

      <ConfirmDialog
        isOpen={syncConfirm.open}
        title={t("universalProvider.syncConfirmTitle", {
          defaultValue: "同步统一供应商",
        })}
        message={t("universalProvider.syncConfirmDescription", {
          defaultValue: `同步 "${syncConfirm.name}" 将会更新所有已启用应用中的关联供应商配置。确定要继续吗？`,
          name: syncConfirm.name,
        })}
        confirmText={t("universalProvider.syncConfirm", {
          defaultValue: "同步",
        })}
        onConfirm={handleSync}
        onCancel={() => setSyncConfirm({ open: false, id: "", name: "" })}
      />
    </div>
  );
}
