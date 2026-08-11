import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Import, MoreHorizontal, Search, Trash2 } from "lucide-react";
import { type AppId } from "@/lib/api";
import { usePromptActions } from "@/hooks/usePromptActions";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import PromptFormPanel from "./PromptFormPanel";
import { ConfirmDialog } from "../ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkbenchEmptyState } from "@/components/common/WorkbenchEmptyState";
import {
  ManagementSummary,
  ManagementSummaryItem,
  ManagementWorkbench,
  ResourceToolbar,
  StatusBadge,
  StatusReason,
} from "@/components/common/ManagementWorkbench";
import PromptToggle from "./PromptToggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface PromptPanelProps {
  appId: AppId;
  requestedMode?: PromptPageState["mode"];
  onPageStateChange?: (state: PromptPageState) => void;
}

export type PromptPageState =
  | { mode: "list" }
  | { mode: "create" }
  | { mode: "edit"; name: string };

export interface PromptPanelHandle {
  openAdd: () => void;
  closeEditor: () => void;
}

const PromptPanel = React.forwardRef<PromptPanelHandle, PromptPanelProps>(
  ({ appId, requestedMode, onPageStateChange }, ref) => {
    const { t } = useTranslation();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [currentFileContent, setCurrentFileContent] = useState<
      string | null
    >();
    const [currentFileOpen, setCurrentFileOpen] = useState(false);
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
      pendingToggleId,
      importFromFile,
      getCurrentFileContent,
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
      setSelectedId(null);
      setCreating(true);
    };

    const closeEditor = () => {
      setCreating(false);
      setSelectedId(null);
      onPageStateChange?.({ mode: "list" });
    };

    React.useImperativeHandle(ref, () => ({
      openAdd: handleAdd,
      closeEditor,
    }));

    const isCreating = creating || requestedMode === "create";

    useEffect(() => {
      if (requestedMode === "create" && !creating) {
        setSelectedId(null);
        setCreating(true);
      }
    }, [creating, requestedMode]);

    const handleSelect = (id: string) => {
      setSelectedId(id);
      setCreating(false);
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
    const filteredEntries = useMemo(() => {
      const query = searchQuery.trim().toLocaleLowerCase();
      if (!query) return promptEntries;
      return promptEntries.filter(([id, prompt]) =>
        [id, prompt.name, prompt.description, prompt.content].some((value) =>
          value?.toLocaleLowerCase().includes(query),
        ),
      );
    }, [promptEntries, searchQuery]);

    const enabledPrompt = promptEntries.find(([_, p]) => p.enabled);
    const selectedPrompt = selectedId ? prompts[selectedId] : undefined;
    const targetFile: Record<AppId, string> = {
      claude: "CLAUDE.md",
      "claude-desktop": "CLAUDE.md",
      codex: "AGENTS.md",
      pi: "AGENTS.md",
      gemini: "GEMINI.md",
      grokbuild: "AGENTS.md",
      opencode: "AGENTS.md",
      openclaw: "AGENTS.md",
      hermes: "SOUL.md",
    };
    useEffect(() => {
      if (selectedId && !prompts[selectedId]) {
        setSelectedId(null);
      }
    }, [prompts, selectedId]);

    useEffect(() => {
      if (isCreating) {
        onPageStateChange?.({ mode: "create" });
        return;
      }
      if (selectedPrompt) {
        onPageStateChange?.({ mode: "edit", name: selectedPrompt.name });
        return;
      }
      onPageStateChange?.({ mode: "list" });
    }, [isCreating, onPageStateChange, selectedPrompt]);

    useEffect(
      () => () => {
        onPageStateChange?.({ mode: "list" });
      },
      [onPageStateChange],
    );

    const handleImport = async () => {
      const id = await importFromFile?.();
      if (id) {
        setSelectedId(id);
        setCreating(false);
      }
    };

    const handleShowCurrentFile = async () => {
      const content = await getCurrentFileContent?.();
      setCurrentFileContent(content ?? null);
      setCurrentFileOpen(true);
    };

    const detail = selectedPrompt || isCreating;

    return (
      <TooltipProvider delayDuration={300}>
        {detail ? (
          <div className="prompt-editor-page flex min-h-0 flex-1 flex-col overflow-hidden px-6">
            <div className="flex min-h-0 flex-1 justify-center overflow-hidden">
              <div className="flex min-h-0 w-full max-w-5xl flex-col py-5">
                <div className="mb-4 flex shrink-0 items-center gap-2 border-b border-border pb-4 text-sm text-muted-foreground">
                  <StatusBadge
                    status={selectedPrompt?.enabled ? "success" : "muted"}
                  >
                    {selectedPrompt?.enabled
                      ? t("prompts.enabled")
                      : t("prompts.disabled")}
                  </StatusBadge>
                  <span>{t(`apps.${appId}`)}</span>
                  <span>{targetFile[appId]}</span>
                </div>
                {selectedPrompt?.enabled && (
                  <StatusReason
                    status="protected"
                    title={t("prompts.deleteEnabledTitle")}
                    className="mb-4 shrink-0"
                  >
                    {t("prompts.deleteEnabledReason")}
                  </StatusReason>
                )}
                <PromptFormPanel
                  key={isCreating ? `new-${appId}` : selectedId}
                  appId={appId}
                  editingId={selectedId || undefined}
                  initialData={selectedPrompt}
                  onSave={async (id, prompt) => {
                    await savePrompt(id, prompt);
                    closeEditor();
                  }}
                  onCancel={closeEditor}
                />
              </div>
            </div>
          </div>
        ) : (
          <ManagementWorkbench
            className="prompts-list-workbench px-6"
            summary={
              <ManagementSummary className="prompts-list-summary">
                <ManagementSummaryItem
                  label={t("prompts.summary.total")}
                  value={promptEntries.length}
                />
                <ManagementSummaryItem
                  label={t("prompts.summary.active")}
                  value={enabledPrompt?.[1].name ?? t("prompts.noneEnabled")}
                  status={enabledPrompt ? "success" : "muted"}
                />
                <ManagementSummaryItem
                  label={t("prompts.summary.target")}
                  value={targetFile[appId]}
                />
                <ManagementSummaryItem
                  label={t("prompts.summary.sync")}
                  value={
                    enabledPrompt
                      ? t("prompts.summary.synced")
                      : t("prompts.summary.idle")
                  }
                  status={enabledPrompt ? "success" : "muted"}
                />
              </ManagementSummary>
            }
            toolbar={
              <ResourceToolbar
                className="prompts-list-toolbar"
                aria-label={t("prompts.toolbar")}
                search={
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder={t("prompts.searchPlaceholder")}
                      aria-label={t("prompts.searchAriaLabel")}
                      className="h-8 pl-8"
                    />
                  </div>
                }
                actions={
                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={t("common.moreActions")}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent>{t("common.moreActions")}</TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => void handleImport()}>
                        <Import className="h-4 w-4" />
                        {t("prompts.import")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => void handleShowCurrentFile()}
                      >
                        <FileText className="h-4 w-4" />
                        {t("prompts.viewCurrentFile")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                }
              />
            }
          >
            <div className="h-full overflow-y-auto">
              {loading ? (
                <div className="text-center py-12 text-muted-foreground">
                  {t("prompts.loading")}
                </div>
              ) : promptEntries.length === 0 ? (
                <WorkbenchEmptyState
                  icon={<FileText className="h-5 w-5" />}
                  title={t("prompts.empty")}
                  description={t("prompts.emptyDescription")}
                />
              ) : filteredEntries.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {t("prompts.noSearchResults")}
                </div>
              ) : (
                <div className="prompts-list divide-y divide-border border-x border-b border-border">
                  {filteredEntries.map(([id, prompt]) => (
                    <div
                      key={id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelect(id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          handleSelect(id);
                        }
                      }}
                      className={cn(
                        "prompts-list-item flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                        selectedId === id && "bg-muted",
                      )}
                    >
                      <div onClick={(event) => event.stopPropagation()}>
                        <PromptToggle
                          enabled={prompt.enabled}
                          disabled={Boolean(pendingToggleId)}
                          onChange={(enabled) =>
                            void toggleEnabled(id, enabled).catch(() => {})
                          }
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {prompt.name}
                          </span>
                          <StatusBadge
                            status={prompt.enabled ? "success" : "muted"}
                            className="h-5 px-1.5"
                          >
                            {prompt.enabled
                              ? t("prompts.enabled")
                              : t("prompts.disabled")}
                          </StatusBadge>
                        </div>
                        <div className="prompts-list-metadata mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                          <span className="truncate">
                            {prompt.description || t("prompts.noDescription")}
                          </span>
                          <span className="prompts-list-target shrink-0">
                            {targetFile[appId]}
                          </span>
                          <span className="prompts-list-updated shrink-0">
                            {prompt.updatedAt
                              ? new Date(
                                  prompt.updatedAt * 1000,
                                ).toLocaleString()
                              : t("prompts.notAvailable")}
                          </span>
                        </div>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
                              disabled={prompt.enabled}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDelete(id);
                              }}
                              aria-label={t("common.delete")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {prompt.enabled
                            ? t("prompts.deleteEnabledReason")
                            : t("common.delete")}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ManagementWorkbench>
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
        <Dialog open={currentFileOpen} onOpenChange={setCurrentFileOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {t("prompts.currentFile", { filename: targetFile[appId] })}
              </DialogTitle>
              <DialogDescription>
                {t("prompts.currentFileDescription")}
              </DialogDescription>
            </DialogHeader>
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap border-t border-border px-6 py-4 text-xs">
              {currentFileContent || t("prompts.currentFileEmpty")}
            </pre>
          </DialogContent>
        </Dialog>
      </TooltipProvider>
    );
  },
);

PromptPanel.displayName = "PromptPanel";

export default PromptPanel;
