import React, { type ReactNode, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Sparkles,
  Trash2,
  RefreshCw,
  Loader2,
  Search,
  X,
  PanelsTopLeft,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { TooltipProvider } from "@/shared/ui/tooltip";
import {
  type ImportSkillSelection,
  type SkillBackupEntry,
  useDeleteSkillBackup,
  useInstalledSkills,
  useSkillBackups,
  useRestoreSkillBackup,
  useToggleSkillApp,
  useBulkToggleSkillApp,
  useUninstallSkill,
  useScanUnmanagedSkills,
  useImportSkillsFromApps,
  useInstallSkillsFromZip,
  useCheckSkillUpdates,
  useUpdateSkill,
  type InstalledSkill,
  type SkillUpdateInfo,
} from "@/features/skills";
import type { AppId } from "@/platform/tauri/api/types";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { settingsApi, skillsApi } from "@/platform/tauri/api";
import { toast } from "sonner";
import { SKILLS_APP_IDS } from "@/shared/platform/appRegistry";
import { AppSelect } from "@/shared/common/AppSelect";
import { AppToggleGroup } from "@/shared/common/AppToggleGroup";
import { ListItemRow } from "@/shared/common/ListItemRow";
import { WorkbenchEmptyState } from "@/shared/common/WorkbenchEmptyState";
import { SkillTargetAppDialog } from "@/features/skills/SkillTargetAppDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  ManagementSummary,
  ManagementSummaryItem,
  ManagementWorkbench,
  ResourceToolbar,
  StatusBadge,
} from "@/shared/common/ManagementWorkbench";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { APP_ICON_MAP } from "@/shared/platform/appRegistry";
import { cn } from "@/lib/utils";

interface UnifiedSkillsPanelProps {
  onOpenDiscovery: () => void;
  availableApps: readonly AppId[];
  workbenchTabs?: ReactNode;
  requestedMode?: InstalledSkillsPageState["mode"];
  onPageStateChange?: (state: InstalledSkillsPageState) => void;
}

export type InstalledSkillsPageState =
  | { mode: "list" }
  | { mode: "detail"; name: string };

export interface UnifiedSkillsPanelHandle {
  openDiscovery: () => void;
  openImport: () => void;
  openInstallFromZip: () => void;
  openRestoreFromBackup: () => void;
  checkUpdates: () => void;
  closeDetail: () => void;
}

function formatSkillBackupDate(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  return Number.isNaN(date.getTime())
    ? String(unixSeconds)
    : date.toLocaleString();
}

const UnifiedSkillsPanel = React.forwardRef<
  UnifiedSkillsPanelHandle,
  UnifiedSkillsPanelProps
>(
  (
    {
      onOpenDiscovery,
      availableApps,
      workbenchTabs,
      requestedMode,
      onPageStateChange,
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const [confirmDialog, setConfirmDialog] = useState<{
      isOpen: boolean;
      title: string;
      message: string;
      confirmText?: string;
      variant?: "destructive" | "info";
      onConfirm: () => void;
    } | null>(null);
    const [importDialogOpen, setImportDialogOpen] = useState(false);
    const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
    const [zipTargetDialogOpen, setZipTargetDialogOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
    const [actionTargetApp, setActionTargetApp] = useState<AppId>(
      () => availableApps[0] ?? "claude",
    );

    useEffect(() => {
      if (!availableApps.includes(actionTargetApp)) {
        setActionTargetApp(availableApps[0] ?? "claude");
      }
    }, [actionTargetApp, availableApps]);

    const { data: skills, isLoading } = useInstalledSkills();
    const {
      data: skillBackups = [],
      refetch: refetchSkillBackups,
      isFetching: isFetchingSkillBackups,
    } = useSkillBackups();
    const deleteBackupMutation = useDeleteSkillBackup();
    const toggleAppMutation = useToggleSkillApp();
    const bulkToggleAppMutation = useBulkToggleSkillApp();
    const uninstallMutation = useUninstallSkill();
    const restoreBackupMutation = useRestoreSkillBackup();
    // enabled: true —— 进入 Skill 页面时自动静默扫描一次（绿点提示来源）
    const { data: unmanagedSkills, refetch: scanUnmanaged } =
      useScanUnmanagedSkills({ enabled: true });
    const importMutation = useImportSkillsFromApps();
    const installFromZipMutation = useInstallSkillsFromZip();
    const {
      data: skillUpdates,
      refetch: checkUpdates,
      isFetching: isCheckingUpdates,
    } = useCheckSkillUpdates();
    const updateSkillMutation = useUpdateSkill();
    const [isUpdatingAll, setIsUpdatingAll] = useState(false);

    const updatesMap = useMemo(() => {
      const map: Record<string, SkillUpdateInfo> = {};
      if (skillUpdates) {
        for (const u of skillUpdates) {
          map[u.id] = u;
        }
      }
      return map;
    }, [skillUpdates]);

    const enabledCounts = useMemo(() => {
      const counts = {
        claude: 0,
        "claude-desktop": 0,
        codex: 0,
        pi: 0,
        gemini: 0,
        grokbuild: 0,
        opencode: 0,
        openclaw: 0,
        hermes: 0,
      };
      if (!skills) return counts;
      skills.forEach((skill) => {
        for (const app of SKILLS_APP_IDS) {
          if (skill.apps[app]) counts[app]++;
        }
      });
      return counts;
    }, [skills]);

    const filteredSkills = useMemo(() => {
      if (!skills) return [];
      const query = searchQuery.trim().toLocaleLowerCase();
      if (!query) return skills;

      return skills.filter((skill) =>
        [
          skill.name,
          skill.id,
          skill.description,
          skill.directory,
          skill.repoOwner,
          skill.repoName,
          skill.repoOwner && skill.repoName
            ? `${skill.repoOwner}/${skill.repoName}`
            : undefined,
        ].some((value) => value?.toLocaleLowerCase().includes(query)),
      );
    }, [searchQuery, skills]);

    const pendingApp = bulkToggleAppMutation.isPending
      ? bulkToggleAppMutation.variables?.app
      : toggleAppMutation.isPending
        ? toggleAppMutation.variables?.app
        : null;
    const selectedSkill = skills?.find((skill) => skill.id === selectedSkillId);
    const enabledTotal = skills?.reduce(
      (total, skill) =>
        total +
        SKILLS_APP_IDS.reduce(
          (count, app) => count + (skill.apps[app] ? 1 : 0),
          0,
        ),
      0,
    );

    const closeDetail = () => {
      setSelectedSkillId(null);
      onPageStateChange?.({ mode: "list" });
    };

    useEffect(() => {
      if (requestedMode === "list" && selectedSkillId) {
        setSelectedSkillId(null);
      }
    }, [requestedMode, selectedSkillId]);

    useEffect(() => {
      if (selectedSkillId && skills && !selectedSkill) {
        closeDetail();
      }
    }, [selectedSkill, selectedSkillId, skills]);

    const handleToggleApp = async (
      id: string,
      app: AppId,
      enabled: boolean,
    ) => {
      try {
        await toggleAppMutation.mutateAsync({ id, app, enabled });
      } catch (error) {
        toast.error(t("common.error"), { description: String(error) });
      }
    };

    const handleToggleAll = async (app: AppId, enabled: boolean) => {
      if (!skills) return;
      const ids = skills
        .filter((skill) => Boolean(skill.apps[app]) !== enabled)
        .map((skill) => skill.id);
      if (ids.length === 0) return;

      const result = await bulkToggleAppMutation.mutateAsync({
        ids,
        app,
        enabled,
      });
      if (result.failed.length > 0) {
        toast.error(
          t("common.bulkToggleFailed", { count: result.failed.length }),
          { description: String(result.failed[0].error) },
        );
      }
    };

    const handleUninstall = (skill: InstalledSkill) => {
      setConfirmDialog({
        isOpen: true,
        title: t("skills.uninstall"),
        message: t("skills.uninstallConfirm", { name: skill.name }),
        onConfirm: async () => {
          try {
            // 构建 skillKey 用于更新 discoverable 缓存
            const installName =
              skill.directory.split(/[/\\]/).pop()?.toLowerCase() ||
              skill.directory.toLowerCase();
            const skillKey = `${installName}:${skill.repoOwner?.toLowerCase() || ""}:${skill.repoName?.toLowerCase() || ""}`;

            const result = await uninstallMutation.mutateAsync({
              id: skill.id,
              skillKey,
            });
            setConfirmDialog(null);
            toast.success(t("skills.uninstallSuccess", { name: skill.name }), {
              description: result.backupPath
                ? t("skills.backup.location", { path: result.backupPath })
                : undefined,
              closeButton: true,
            });
            if (selectedSkillId === skill.id) closeDetail();
          } catch (error) {
            toast.error(t("common.error"), { description: String(error) });
          }
        },
      });
    };

    const handleOpenImport = async () => {
      try {
        const result = await scanUnmanaged();
        if (!result.data || result.data.length === 0) {
          toast.success(t("skills.noUnmanagedFound"), { closeButton: true });
          return;
        }
        setImportDialogOpen(true);
      } catch (error) {
        toast.error(t("common.error"), { description: String(error) });
      }
    };

    const handleImport = async (imports: ImportSkillSelection[]) => {
      try {
        const imported = await importMutation.mutateAsync(imports);
        setImportDialogOpen(false);
        toast.success(t("skills.importSuccess", { count: imported.length }), {
          closeButton: true,
        });
      } catch (error) {
        toast.error(t("common.error"), { description: String(error) });
      }
    };

    const handleInstallFromZip = async () => {
      setZipTargetDialogOpen(false);
      try {
        const filePath = await skillsApi.openZipFileDialog();
        if (!filePath) return;

        const installed = await installFromZipMutation.mutateAsync({
          filePath,
          currentApp: actionTargetApp,
        });

        if (installed.length === 0) {
          toast.info(t("skills.installFromZip.noSkillsFound"), {
            closeButton: true,
          });
        } else if (installed.length === 1) {
          toast.success(
            t("skills.installFromZip.successSingle", {
              name: installed[0].name,
            }),
            { closeButton: true },
          );
        } else {
          toast.success(
            t("skills.installFromZip.successMultiple", {
              count: installed.length,
            }),
            { closeButton: true },
          );
        }
      } catch (error) {
        toast.error(t("skills.installFailed"), { description: String(error) });
      }
    };

    const handleCheckUpdates = async () => {
      try {
        const result = await checkUpdates();
        const updates = result.data || [];
        if (updates.length === 0) {
          toast.success(t("skills.noUpdates"), { closeButton: true });
        } else {
          toast.info(t("skills.updatesFound", { count: updates.length }), {
            closeButton: true,
          });
        }
      } catch (error) {
        toast.error(t("common.error"), { description: String(error) });
      }
    };

    const handleUpdateSkill = async (skill: InstalledSkill) => {
      try {
        const updated = await updateSkillMutation.mutateAsync(skill.id);
        toast.success(t("skills.updateSuccess", { name: updated.name }), {
          closeButton: true,
        });
      } catch (error) {
        toast.error(t("skills.updateFailed"), { description: String(error) });
      }
    };

    const handleUpdateAll = async () => {
      if (!skillUpdates || skillUpdates.length === 0) return;
      setIsUpdatingAll(true);
      let successCount = 0;
      for (const update of skillUpdates) {
        try {
          await updateSkillMutation.mutateAsync(update.id);
          successCount++;
        } catch (error) {
          toast.error(t("skills.updateFailed"), {
            description: `${update.name}: ${String(error)}`,
          });
        }
      }
      setIsUpdatingAll(false);
      if (successCount > 0) {
        toast.success(t("skills.updateAllSuccess", { count: successCount }), {
          closeButton: true,
        });
      }
    };

    const handleOpenRestoreFromBackup = async () => {
      setRestoreDialogOpen(true);
      try {
        await refetchSkillBackups();
      } catch (error) {
        toast.error(t("common.error"), { description: String(error) });
      }
    };

    const handleRestoreFromBackup = async (backupId: string) => {
      try {
        const restored = await restoreBackupMutation.mutateAsync({
          backupId,
          currentApp: actionTargetApp,
        });
        setRestoreDialogOpen(false);
        toast.success(
          t("skills.restoreFromBackup.success", { name: restored.name }),
          {
            closeButton: true,
          },
        );
      } catch (error) {
        toast.error(t("skills.restoreFromBackup.failed"), {
          description: String(error),
        });
      }
    };

    const handleDeleteBackup = (backup: SkillBackupEntry) => {
      setConfirmDialog({
        isOpen: true,
        title: t("skills.restoreFromBackup.deleteConfirmTitle"),
        message: t("skills.restoreFromBackup.deleteConfirmMessage", {
          name: backup.skill.name,
        }),
        confirmText: t("skills.restoreFromBackup.delete"),
        variant: "destructive",
        onConfirm: async () => {
          try {
            await deleteBackupMutation.mutateAsync(backup.backupId);
            await refetchSkillBackups();
            setConfirmDialog(null);
            toast.success(
              t("skills.restoreFromBackup.deleteSuccess", {
                name: backup.skill.name,
              }),
              {
                closeButton: true,
              },
            );
          } catch (error) {
            toast.error(t("skills.restoreFromBackup.deleteFailed"), {
              description: String(error),
            });
          }
        },
      });
    };

    React.useImperativeHandle(ref, () => ({
      openDiscovery: onOpenDiscovery,
      openImport: handleOpenImport,
      openInstallFromZip: () => setZipTargetDialogOpen(true),
      openRestoreFromBackup: handleOpenRestoreFromBackup,
      checkUpdates: handleCheckUpdates,
      closeDetail,
    }));

    if (selectedSkill) {
      return (
        <TooltipProvider delayDuration={300}>
          <InstalledSkillDetailPage
            skill={selectedSkill}
            hasUpdate={Boolean(updatesMap[selectedSkill.id])}
            isUpdating={
              updateSkillMutation.isPending &&
              updateSkillMutation.variables === selectedSkill.id
            }
            onToggleApp={handleToggleApp}
            onUpdate={() => handleUpdateSkill(selectedSkill)}
            onUninstall={() => handleUninstall(selectedSkill)}
          />
          {confirmDialog && (
            <ConfirmDialog
              isOpen={confirmDialog.isOpen}
              title={confirmDialog.title}
              message={confirmDialog.message}
              confirmText={confirmDialog.confirmText}
              variant={confirmDialog.variant}
              zIndex="top"
              onConfirm={confirmDialog.onConfirm}
              onCancel={() => setConfirmDialog(null)}
            />
          )}
        </TooltipProvider>
      );
    }

    return (
      <TooltipProvider delayDuration={300}>
        <ManagementWorkbench
          className="skills-installed-workbench px-6"
          mode="list"
          summary={
            <ManagementSummary
              className="skills-installed-summary"
              trailing={workbenchTabs}
            >
              <ManagementSummaryItem
                label={t("skills.summary.installed")}
                value={skills?.length ?? 0}
              />
              <ManagementSummaryItem
                label={t("skills.summary.assignments")}
                value={enabledTotal ?? 0}
                status={enabledTotal ? "success" : "muted"}
              />
              <ManagementSummaryItem
                label={t("skills.summary.updates")}
                value={skillUpdates?.length ?? 0}
                status={skillUpdates?.length ? "warning" : "muted"}
              />
              <ManagementSummaryItem
                label={t("skills.summary.importable")}
                value={unmanagedSkills?.length ?? 0}
                status={unmanagedSkills?.length ? "info" : "muted"}
              />
            </ManagementSummary>
          }
          toolbar={
            <ResourceToolbar
              className="skills-installed-toolbar"
              aria-label={t("skills.toolbar")}
              search={
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={t("skills.installedSearchPlaceholder")}
                    aria-label={t("skills.installedSearchAriaLabel")}
                    className="h-8 pl-8 pr-8"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      aria-label={t("common.clearSearch")}
                      className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              }
              actions={
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                      >
                        <PanelsTopLeft className="h-4 w-4" />
                        {t("skills.bulkAssignments")}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      <DropdownMenuLabel className="flex items-center justify-between gap-3">
                        <span>{t("skills.bulkAssignments")}</span>
                        <span className="font-normal text-muted-foreground">
                          {t("skills.installedCount", {
                            count: skills?.length ?? 0,
                          })}
                        </span>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {SKILLS_APP_IDS.map((app) => {
                        const count = enabledCounts[app] ?? 0;
                        const total = skills?.length ?? 0;
                        const allEnabled = total > 0 && count === total;
                        const partiallyEnabled = count > 0 && count < total;

                        return (
                          <DropdownMenuCheckboxItem
                            key={app}
                            checked={
                              allEnabled
                                ? true
                                : partiallyEnabled
                                  ? "indeterminate"
                                  : false
                            }
                            disabled={Boolean(pendingApp) || total === 0}
                            onSelect={(event) => event.preventDefault()}
                            onCheckedChange={() =>
                              void handleToggleAll(app, !allEnabled)
                            }
                            className="pl-8"
                          >
                            <span className="flex min-w-0 flex-1 items-center gap-2">
                              <span className="shrink-0">
                                {APP_ICON_MAP[app].icon}
                              </span>
                              <span className="min-w-0 flex-1 truncate">
                                {APP_ICON_MAP[app].label}
                              </span>
                              <span className="shrink-0 tabular-nums text-muted-foreground">
                                {count}/{total}
                              </span>
                            </span>
                          </DropdownMenuCheckboxItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {skillUpdates && skillUpdates.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1 whitespace-nowrap"
                      onClick={handleUpdateAll}
                      disabled={isUpdatingAll || updateSkillMutation.isPending}
                    >
                      {isUpdatingAll ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <RefreshCw size={12} />
                      )}
                      {isUpdatingAll
                        ? t("skills.updatingAll")
                        : t("skills.updateAll", {
                            count: skillUpdates?.length ?? 0,
                          })}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={handleCheckUpdates}
                    disabled={
                      isCheckingUpdates || !skills || skills.length === 0
                    }
                  >
                    {isCheckingUpdates ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RefreshCw size={12} />
                    )}
                    {isCheckingUpdates
                      ? t("skills.checkingUpdates")
                      : t("skills.checkUpdates")}
                  </Button>
                </>
              }
            />
          }
        >
          <div className="h-full overflow-y-auto overflow-x-hidden">
            {isLoading ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                {t("skills.loading")}
              </div>
            ) : !skills || skills.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <WorkbenchEmptyState
                  icon={<Sparkles className="h-5 w-5" />}
                  title={t("skills.noInstalled")}
                  description={t("skills.noInstalledDescription")}
                  actions={
                    <Button type="button" size="sm" onClick={onOpenDiscovery}>
                      {t("skills.discover")}
                    </Button>
                  }
                />
              </div>
            ) : filteredSkills.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                {t("skills.noInstalledSearchResults")}
              </div>
            ) : (
              <TooltipProvider delayDuration={300}>
                <div className="skills-installed-list divide-y divide-border border-x border-b border-border">
                  {filteredSkills.map((skill, index) => (
                    <InstalledSkillListItem
                      key={skill.id}
                      skill={skill}
                      hasUpdate={!!updatesMap[skill.id]}
                      isUpdating={
                        updateSkillMutation.isPending &&
                        updateSkillMutation.variables === skill.id
                      }
                      onUninstall={() => handleUninstall(skill)}
                      onUpdate={() => handleUpdateSkill(skill)}
                      isLast={index === filteredSkills.length - 1}
                      selected={selectedSkillId === skill.id}
                      onSelect={() => {
                        setSelectedSkillId(skill.id);
                        onPageStateChange?.({
                          mode: "detail",
                          name: skill.name,
                        });
                      }}
                    />
                  ))}
                </div>
              </TooltipProvider>
            )}
          </div>
        </ManagementWorkbench>

        {confirmDialog && (
          <ConfirmDialog
            isOpen={confirmDialog.isOpen}
            title={confirmDialog.title}
            message={confirmDialog.message}
            confirmText={confirmDialog.confirmText}
            variant={confirmDialog.variant}
            zIndex="top"
            onConfirm={confirmDialog.onConfirm}
            onCancel={() => setConfirmDialog(null)}
          />
        )}

        {importDialogOpen && unmanagedSkills && (
          <ImportSkillsDialog
            skills={unmanagedSkills}
            isImporting={importMutation.isPending}
            onImport={handleImport}
            onClose={() => setImportDialogOpen(false)}
          />
        )}

        <SkillTargetAppDialog
          open={zipTargetDialogOpen}
          appIds={availableApps}
          value={actionTargetApp}
          title={t("skills.installFromZip.button")}
          description={t("skills.installTargetDescription")}
          confirmLabel={t("skills.install")}
          isPending={installFromZipMutation.isPending}
          onValueChange={setActionTargetApp}
          onConfirm={() => void handleInstallFromZip()}
          onClose={() => setZipTargetDialogOpen(false)}
        />

        <RestoreSkillsDialog
          backups={skillBackups}
          appIds={availableApps}
          targetApp={actionTargetApp}
          isDeleting={deleteBackupMutation.isPending}
          isLoading={isFetchingSkillBackups}
          onDelete={handleDeleteBackup}
          isRestoring={restoreBackupMutation.isPending}
          onTargetAppChange={setActionTargetApp}
          onRestore={handleRestoreFromBackup}
          onClose={() => setRestoreDialogOpen(false)}
          open={restoreDialogOpen}
        />
      </TooltipProvider>
    );
  },
);

UnifiedSkillsPanel.displayName = "UnifiedSkillsPanel";

interface InstalledSkillListItemProps {
  skill: InstalledSkill;
  hasUpdate?: boolean;
  isUpdating?: boolean;
  onUninstall: () => void;
  onUpdate?: () => void;
  isLast?: boolean;
  selected?: boolean;
  onSelect: () => void;
}

const InstalledSkillListItem: React.FC<InstalledSkillListItemProps> = ({
  skill,
  hasUpdate,
  isUpdating,
  onUninstall,
  onUpdate,
  isLast,
  selected,
  onSelect,
}) => {
  const { t } = useTranslation();

  const sourceLabel = useMemo(() => {
    if (skill.repoOwner && skill.repoName) {
      return `${skill.repoOwner}/${skill.repoName}`;
    }
    return t("skills.local");
  }, [skill.repoOwner, skill.repoName, t]);

  return (
    <ListItemRow
      isLast={isLast}
      className={cn(
        "skills-installed-list-item cursor-pointer py-2.5",
        selected && "bg-muted",
      )}
      actions={
        <div className="list-item-responsive-actions flex min-w-0 flex-shrink-0 items-center gap-2">
          <div
            className="flex shrink-0 items-center gap-0.5"
            style={hasUpdate ? { opacity: 1 } : undefined}
          >
            {hasUpdate && onUpdate && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 hover:bg-primary/10 hover:text-primary"
                onClick={onUpdate}
                disabled={isUpdating}
                title={t("skills.update")}
              >
                {isUpdating ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
              onClick={onUninstall}
              title={t("skills.uninstall")}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        </div>
      }
    >
      <button
        type="button"
        onClick={onSelect}
        className="skills-installed-list-main flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="skills-installed-list-title flex items-center gap-1.5">
            <span className="font-medium text-sm text-foreground truncate">
              {skill.name}
            </span>
            <span className="text-xs text-muted-foreground/50 flex-shrink-0">
              {sourceLabel}
            </span>
            {hasUpdate && (
              <StatusBadge status="warning" className="h-5 px-1.5">
                {t("skills.updateAvailable")}
              </StatusBadge>
            )}
          </div>
          {skill.description && (
            <p
              className="text-xs text-muted-foreground truncate"
              title={skill.description}
            >
              {skill.description}
            </p>
          )}
        </div>
        <StatusBadge
          status="info"
          className="skills-installed-assignment-count h-5 px-1.5"
        >
          {t("skills.assignments", {
            count: SKILLS_APP_IDS.filter((app) => skill.apps[app]).length,
          })}
        </StatusBadge>
      </button>
    </ListItemRow>
  );
};

interface InstalledSkillDetailPageProps {
  skill: InstalledSkill;
  hasUpdate: boolean;
  isUpdating: boolean;
  onToggleApp: (id: string, app: AppId, enabled: boolean) => void;
  onUpdate: () => void;
  onUninstall: () => void;
}

const InstalledSkillDetailPage: React.FC<InstalledSkillDetailPageProps> = ({
  skill,
  hasUpdate,
  isUpdating,
  onToggleApp,
  onUpdate,
  onUninstall,
}) => {
  const { t } = useTranslation();
  const source =
    skill.repoOwner && skill.repoName
      ? `${skill.repoOwner}/${skill.repoName}`
      : t("skills.local");

  const openDocs = async () => {
    if (!skill.readmeUrl) return;
    try {
      await settingsApi.openExternal(skill.readmeUrl);
    } catch {}
  };

  return (
    <section
      className="installed-skill-detail-page flex min-h-0 flex-1 flex-col overflow-hidden px-6"
      aria-label={t("skills.detail")}
    >
      <div className="min-h-0 flex-1 overflow-y-auto py-6">
        <div className="mx-auto w-full max-w-5xl space-y-6">
          <div className="flex min-w-0 items-start justify-between gap-4 border-b border-border pb-5">
            <div className="min-w-0">
              <p className="text-sm leading-6 text-muted-foreground">
                {skill.description || t("skills.noDescription")}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={hasUpdate ? "warning" : "success"}>
                  {hasUpdate
                    ? t("skills.updateAvailable")
                    : t("skills.noUpdates")}
                </StatusBadge>
                <StatusBadge status="info">
                  {t("skills.assignments", {
                    count: SKILLS_APP_IDS.filter((app) => skill.apps[app])
                      .length,
                  })}
                </StatusBadge>
              </div>
            </div>
            {skill.readmeUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openDocs}
              >
                {t("skills.view")}
              </Button>
            )}
          </div>
          <section className="space-y-4" aria-labelledby="skill-installation">
            <h2 id="skill-installation" className="text-sm font-semibold">
              {t("skills.detail")}
            </h2>
            <dl className="grid grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)] gap-x-8 gap-y-3 text-sm">
              <dt className="text-muted-foreground">
                {t("skills.detailPath")}
              </dt>
              <dd className="break-all">{skill.directory}</dd>
              <dt className="text-muted-foreground">
                {t("skills.detailRepository")}
              </dt>
              <dd>{source}</dd>
              <dt className="text-muted-foreground">
                {t("skills.detailBranch")}
              </dt>
              <dd>{skill.repoBranch || t("prompts.notAvailable")}</dd>
              <dt className="text-muted-foreground">
                {t("skills.detailUpdated")}
              </dt>
              <dd>{new Date(skill.updatedAt * 1000).toLocaleString()}</dd>
              <dt className="text-muted-foreground">
                {t("skills.detailStatus")}
              </dt>
              <dd>
                <StatusBadge status={hasUpdate ? "warning" : "success"}>
                  {hasUpdate
                    ? t("skills.updateAvailable")
                    : t("skills.noUpdates")}
                </StatusBadge>
              </dd>
            </dl>
          </section>
          <section
            className="space-y-3 border-t border-border pt-5"
            aria-labelledby="skill-app-assignments"
          >
            <h2 id="skill-app-assignments" className="text-sm font-semibold">
              {t("skills.appAssignments")}
            </h2>
            <AppToggleGroup
              apps={skill.apps}
              onToggle={(app, enabled) => onToggleApp(skill.id, app, enabled)}
              appIds={SKILLS_APP_IDS}
              disabled={isUpdating}
            />
          </section>
        </div>
      </div>
      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border py-3">
        {hasUpdate && (
          <Button
            type="button"
            variant="outline"
            onClick={onUpdate}
            disabled={isUpdating}
          >
            {isUpdating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {t("skills.update")}
          </Button>
        )}
        <Button type="button" variant="destructive" onClick={onUninstall}>
          <Trash2 className="h-4 w-4" />
          {t("skills.uninstall")}
        </Button>
      </footer>
    </section>
  );
};

interface ImportSkillsDialogProps {
  skills: Array<{
    directory: string;
    name: string;
    description?: string;
    foundIn: string[];
    path: string;
  }>;
  isImporting: boolean;
  onImport: (imports: ImportSkillSelection[]) => void;
  onClose: () => void;
}

interface RestoreSkillsDialogProps {
  backups: SkillBackupEntry[];
  appIds: readonly AppId[];
  targetApp: AppId;
  isDeleting: boolean;
  isLoading: boolean;
  isRestoring: boolean;
  onTargetAppChange: (app: AppId) => void;
  onDelete: (backup: SkillBackupEntry) => void;
  onRestore: (backupId: string) => void;
  onClose: () => void;
  open: boolean;
}

const RestoreSkillsDialog: React.FC<RestoreSkillsDialogProps> = ({
  backups,
  appIds,
  targetApp,
  isDeleting,
  isLoading,
  isRestoring,
  onTargetAppChange,
  onDelete,
  onRestore,
  onClose,
  open,
}) => {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        className="max-w-2xl max-h-[85vh] flex flex-col"
        zIndex="alert"
      >
        <DialogHeader>
          <DialogTitle>{t("skills.restoreFromBackup.title")}</DialogTitle>
          <DialogDescription>
            {t("skills.restoreFromBackup.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pt-4">
          <AppSelect
            value={targetApp}
            appIds={appIds}
            onValueChange={onTargetAppChange}
            ariaLabel={t("skills.selectTargetApplication")}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {t("common.loading")}
            </div>
          ) : backups.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {t("skills.restoreFromBackup.empty")}
            </div>
          ) : (
            <div className="space-y-3">
              {backups.map((backup) => (
                <div
                  key={backup.backupId}
                  className="rounded-md border border-border bg-background p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-sm text-foreground">
                          {backup.skill.name}
                        </div>
                        <div className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {backup.skill.directory}
                        </div>
                      </div>
                      {backup.skill.description && (
                        <div className="mt-2 text-sm text-muted-foreground">
                          {backup.skill.description}
                        </div>
                      )}
                      <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                        <div>
                          {t("skills.restoreFromBackup.createdAt")}:{" "}
                          {formatSkillBackupDate(backup.createdAt)}
                        </div>
                        <div className="break-all" title={backup.backupPath}>
                          {t("skills.restoreFromBackup.path")}:{" "}
                          {backup.backupPath}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:min-w-28">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => onRestore(backup.backupId)}
                        disabled={isRestoring || isDeleting}
                      >
                        {isRestoring
                          ? t("skills.restoreFromBackup.restoring")
                          : t("skills.restoreFromBackup.restore")}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => onDelete(backup)}
                        disabled={isRestoring || isDeleting}
                      >
                        {isDeleting
                          ? t("skills.restoreFromBackup.deleting")
                          : t("skills.restoreFromBackup.delete")}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ImportSkillsDialog: React.FC<ImportSkillsDialogProps> = ({
  skills,
  isImporting,
  onImport,
  onClose,
}) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(skills.map((s) => s.directory)),
  );
  const [selectedApps, setSelectedApps] = useState<
    Record<string, ImportSkillSelection["apps"]>
  >(() =>
    Object.fromEntries(
      skills.map((skill) => [
        skill.directory,
        {
          claude: skill.foundIn.includes("claude"),
          codex: skill.foundIn.includes("codex"),
          pi: skill.foundIn.includes("pi"),
          gemini: skill.foundIn.includes("gemini"),
          grokbuild: skill.foundIn.includes("grokbuild"),
          opencode: skill.foundIn.includes("opencode"),
          openclaw: false,
          hermes: skill.foundIn.includes("hermes"),
        },
      ]),
    ),
  );

  const toggleSelect = (directory: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(directory)) {
      newSelected.delete(directory);
    } else {
      newSelected.add(directory);
    }
    setSelected(newSelected);
  };

  const handleImport = () => {
    onImport(
      Array.from(selected).map((directory) => ({
        directory,
        apps: selectedApps[directory] ?? {
          claude: false,
          codex: false,
          pi: false,
          gemini: false,
          grokbuild: false,
          opencode: false,
          openclaw: false,
          hermes: false,
        },
      })),
    );
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
          <DialogHeader>
            <DialogTitle>{t("skills.import")}</DialogTitle>
            <DialogDescription>
              {t("skills.importDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="divide-y divide-border border-y border-border">
              {skills.map((skill) => (
                <div
                  key={skill.directory}
                  className="flex items-start gap-3 py-3"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(skill.directory)}
                    onChange={() => toggleSelect(skill.directory)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{skill.name}</div>
                    {skill.description && (
                      <div className="text-sm text-muted-foreground line-clamp-1">
                        {skill.description}
                      </div>
                    )}
                    <div className="mt-2">
                      <AppToggleGroup
                        apps={
                          selectedApps[skill.directory] ?? {
                            claude: false,
                            codex: false,
                            pi: false,
                            gemini: false,
                            grokbuild: false,
                            opencode: false,
                            openclaw: false,
                            hermes: false,
                          }
                        }
                        onToggle={(app, enabled) => {
                          setSelectedApps((prev) => ({
                            ...prev,
                            [skill.directory]: {
                              ...(prev[skill.directory] ?? {
                                claude: false,
                                codex: false,
                                pi: false,
                                gemini: false,
                                grokbuild: false,
                                opencode: false,
                                openclaw: false,
                                hermes: false,
                              }),
                              [app]: enabled,
                            },
                          }));
                        }}
                        appIds={SKILLS_APP_IDS}
                      />
                    </div>
                    <div
                      className="text-xs text-muted-foreground/50 mt-1 truncate"
                      title={skill.path}
                    >
                      {skill.path}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={isImporting}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleImport}
              disabled={selected.size === 0 || isImporting}
            >
              {t("skills.importSelected", { count: selected.size })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};

export default UnifiedSkillsPanel;
