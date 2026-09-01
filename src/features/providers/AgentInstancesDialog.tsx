import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Eye,
  EyeOff,
  FolderOpen,
  KeyRound,
  Loader2,
  MessageSquare,
  Pencil,
  Play,
  Plus,
  RotateCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { settingsApi, type AppId } from "@/platform/tauri/api";
import {
  providersApi,
  type RuntimeEnvironment,
} from "@/platform/tauri/api/providers";
import {
  useCreateRuntimeEnvironment,
  useDeleteRuntimeEnvironment,
  useRenameRuntimeEnvironment,
  useRotateRuntimeEnvironmentKey,
  useRuntimeEnvironments,
  useSetRuntimeEnvironmentRecentProject,
  type RuntimeEnvironmentTarget,
} from "@/features/providers/model/environments";
import type { Provider } from "@/shared/contracts";
import { providerNeedsRouting } from "@/features/providers/model/providerCapabilities";
import { extractErrorMessage } from "@/shared/lib/errorUtils";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

interface AgentInstancesDialogProps {
  open: boolean;
  appId: AppId;
  provider: Provider | null;
  onOpenChange: (open: boolean) => void;
  onViewSessions?: (appId: AppId, instanceId: string) => void;
}

type EditorState =
  | { kind: "rename"; environment: RuntimeEnvironment; value: string }
  | { kind: "rotate"; environment: RuntimeEnvironment; value: string }
  | null;

type DeleteState = {
  environment: RuntimeEnvironment;
  deleteSessions: boolean;
} | null;

function getProviderEndpoint(provider: Provider): string {
  const config = provider.settingsConfig as Record<string, unknown>;
  const env =
    config.env && typeof config.env === "object"
      ? (config.env as Record<string, unknown>)
      : {};
  const candidates = [
    env.ANTHROPIC_BASE_URL,
    env.GOOGLE_GEMINI_BASE_URL,
    config.baseUrl,
    config.base_url,
  ];
  const direct = candidates.find(
    (value): value is string =>
      typeof value === "string" && value.trim() !== "",
  );
  if (direct) return direct;
  if (typeof config.config === "string") {
    const match = config.config.match(/base_url\s*=\s*["']([^"']+)["']/);
    if (match?.[1]) return match[1];
  }
  return provider.websiteUrl?.trim() || "—";
}

export function AgentInstancesDialog({
  open,
  appId,
  provider,
  onOpenChange,
  onViewSessions,
}: AgentInstancesDialogProps) {
  const { t } = useTranslation();
  const target = useMemo<RuntimeEnvironmentTarget | null>(
    () => (provider ? { appId, providerId: provider.id } : null),
    [appId, provider?.id],
  );
  const environmentsQuery = useRuntimeEnvironments(target, open);
  const createMutation = useCreateRuntimeEnvironment(target);
  const renameMutation = useRenameRuntimeEnvironment(target);
  const rotateKeyMutation = useRotateRuntimeEnvironmentKey(target);
  const recentProjectMutation = useSetRuntimeEnvironmentRecentProject(target);
  const deleteMutation = useDeleteRuntimeEnvironment(target);
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [operation, setOperation] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteState>(null);
  const environments = environmentsQuery.data ?? [];
  const busy = operation !== null;

  useEffect(() => {
    if (open) return;
    setName("");
    setApiKey("");
    setShowApiKey(false);
    setEditor(null);
    setDeleteTarget(null);
  }, [open]);

  useEffect(() => {
    if (!environmentsQuery.error) return;
    toast.error(extractErrorMessage(environmentsQuery.error));
  }, [environmentsQuery.error]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!target || !name.trim() || !apiKey.trim()) return;
    setOperation("create");
    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        apiKey: apiKey.trim(),
      });
      setName("");
      setApiKey("");
      toast.success(t("runtimeEnvironments.createSuccess"));
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setOperation(null);
    }
  };

  const saveEditor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor || !editor.value.trim()) return;
    setOperation(`${editor.kind}:${editor.environment.id}`);
    try {
      if (editor.kind === "rename") {
        await renameMutation.mutateAsync({
          id: editor.environment.id,
          name: editor.value.trim(),
        });
        toast.success(t("runtimeEnvironments.renameSuccess"));
      } else {
        await rotateKeyMutation.mutateAsync({
          id: editor.environment.id,
          apiKey: editor.value.trim(),
        });
        toast.success(t("runtimeEnvironments.rotateKeySuccess"));
      }
      setEditor(null);
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setOperation(null);
    }
  };

  const launch = async (
    environment: RuntimeEnvironment,
    mode: "recent" | "choose",
  ) => {
    if (!provider) return;
    setOperation(`launch:${environment.id}`);
    try {
      const cwd =
        mode === "recent" && environment.recentProjectDir
          ? environment.recentProjectDir
          : await settingsApi.pickDirectory();
      if (!cwd) return;
      await providersApi.openTerminal(provider.id, appId, {
        cwd,
        instanceId: environment.id,
      });
      await recentProjectMutation.mutateAsync({
        id: environment.id,
        recentProjectDir: cwd,
      });
      toast.success(t("runtimeEnvironments.launchSuccess"));
      onOpenChange(false);
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setOperation(null);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setOperation(`delete:${deleteTarget.environment.id}`);
    try {
      await deleteMutation.mutateAsync({
        id: deleteTarget.environment.id,
        deleteSessions: deleteTarget.deleteSessions,
      });
      setDeleteTarget(null);
      toast.success(t("runtimeEnvironments.deleteSuccess"));
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setOperation(null);
    }
  };

  const rebuildConfig = async (environment: RuntimeEnvironment) => {
    setOperation(`rebuild:${environment.id}`);
    try {
      await providersApi.rebuildAgentInstanceConfig(environment.id);
      await environmentsQuery.refetch();
      toast.success(t("runtimeEnvironments.rebuildConfigSuccess"));
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setOperation(null);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && busy) return;
    onOpenChange(nextOpen);
  };

  const endpoint = provider ? getProviderEndpoint(provider) : "—";
  const routing = provider ? providerNeedsRouting(appId, provider) : false;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-3xl overflow-hidden">
          <DialogHeader className="relative pr-16">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <DialogTitle>{t("runtimeEnvironments.title")}</DialogTitle>
            </div>
            <DialogDescription className="max-w-2xl leading-relaxed">
              {t("runtimeEnvironments.description")}
            </DialogDescription>
            <DialogClose
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-45"
              aria-label={t("common.close")}
              disabled={busy}
            >
              <X className="h-4 w-4" />
            </DialogClose>
          </DialogHeader>

          <div className="grid gap-5 overflow-y-auto px-6 py-5">
            <div className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground">
                  {t("runtimeEnvironments.application")}
                </span>
                <div className="mt-0.5 font-medium">{appId}</div>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {t("runtimeEnvironments.provider")}
                </span>
                <div className="mt-0.5 font-medium">
                  {provider?.name ?? "—"}
                </div>
              </div>
              <div className="min-w-0">
                <span className="text-muted-foreground">
                  {t("runtimeEnvironments.endpoint")}
                </span>
                <div className="mt-0.5 truncate font-mono" title={endpoint}>
                  {endpoint}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {t("runtimeEnvironments.routeAndIsolation")}
                </span>
                <div className="mt-0.5 font-medium">
                  {t(
                    routing
                      ? "runtimeEnvironments.routedIsolation"
                      : "runtimeEnvironments.directIsolation",
                  )}
                </div>
              </div>
            </div>

            <form
              className="rounded-lg border border-border bg-muted/20 p-4"
              onSubmit={create}
            >
              <div className="mb-3">
                <h3 className="text-sm font-medium">
                  {t("runtimeEnvironments.createTitle")}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("runtimeEnvironments.credentialHint")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("runtimeEnvironments.sessionKeyHint")}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] sm:items-end">
                <div className="grid gap-1.5">
                  <Label htmlFor="runtime-environment-name">
                    {t("runtimeEnvironments.name")}
                  </Label>
                  <Input
                    id="runtime-environment-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t("runtimeEnvironments.namePlaceholder")}
                    disabled={busy}
                    autoComplete="off"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="runtime-environment-api-key">API Key</Label>
                  <div className="relative">
                    <Input
                      id="runtime-environment-api-key"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder={t("runtimeEnvironments.apiKeyPlaceholder")}
                      type={showApiKey ? "text" : "password"}
                      autoComplete="new-password"
                      disabled={busy}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((visible) => !visible)}
                      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30"
                      aria-label={t(
                        showApiKey
                          ? "runtimeEnvironments.hideApiKey"
                          : "runtimeEnvironments.showApiKey",
                      )}
                      disabled={busy}
                    >
                      {showApiKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={busy || !name.trim() || !apiKey.trim()}
                  className="sm:min-w-24"
                >
                  {operation === "create" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {t("runtimeEnvironments.create")}
                </Button>
              </div>
            </form>

            <section aria-labelledby="runtime-environment-list-title">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3
                    id="runtime-environment-list-title"
                    className="text-sm font-medium"
                  >
                    {t("runtimeEnvironments.listTitle")}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("runtimeEnvironments.count", {
                      count: environments.length,
                    })}
                  </p>
                </div>
                {environmentsQuery.isError ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void environmentsQuery.refetch()}
                    disabled={environmentsQuery.isFetching || busy}
                  >
                    {t("runtimeEnvironments.retry")}
                  </Button>
                ) : null}
              </div>

              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {environmentsQuery.isLoading ? (
                  <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("runtimeEnvironments.loading")}
                  </div>
                ) : environmentsQuery.isError ? (
                  <div className="flex min-h-28 flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 px-6 text-center">
                    <p className="text-sm font-medium text-destructive">
                      {t("runtimeEnvironments.loadFailed")}
                    </p>
                    <p className="mt-1 max-w-md text-xs text-muted-foreground">
                      {extractErrorMessage(environmentsQuery.error)}
                    </p>
                  </div>
                ) : environments.length === 0 ? (
                  <div className="flex min-h-28 flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center">
                    <KeyRound className="h-5 w-5 text-muted-foreground" />
                    <p className="mt-2 text-sm font-medium">
                      {t("runtimeEnvironments.empty")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("runtimeEnvironments.emptyHint")}
                    </p>
                  </div>
                ) : (
                  environments.map((environment) => (
                    <div
                      key={environment.id}
                      className="rounded-lg border border-border bg-background p-3 transition-colors hover:border-primary/30 hover:bg-muted/20"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground">
                          <KeyRound className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">
                              {environment.name}
                            </span>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {t(
                                `runtimeEnvironments.status.${environment.runtimeStatus ?? "ready"}`,
                              )}
                            </span>
                          </div>
                          <div
                            className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground"
                            title={environment.id}
                          >
                            {environment.id}
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {environment.recentProjectDir
                              ? t("runtimeEnvironments.recentProject", {
                                  path: environment.recentProjectDir,
                                })
                              : t("runtimeEnvironments.noRecentProject")}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap justify-end gap-1.5">
                        {environment.recentProjectDir ? (
                          <Button
                            size="sm"
                            onClick={() => void launch(environment, "recent")}
                            disabled={busy}
                          >
                            {operation === `launch:${environment.id}` ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                            {t("runtimeEnvironments.launchRecent")}
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant={
                            environment.recentProjectDir ? "outline" : "default"
                          }
                          onClick={() => void launch(environment, "choose")}
                          disabled={busy}
                        >
                          <FolderOpen className="h-4 w-4" />
                          {t(
                            environment.recentProjectDir
                              ? "runtimeEnvironments.chooseDirectory"
                              : "runtimeEnvironments.chooseProjectAndLaunch",
                            {
                              cli:
                                appId === "claude" ? "Claude CLI" : "Codex CLI",
                            },
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            setEditor({
                              kind: "rename",
                              environment,
                              value: environment.name,
                            })
                          }
                          disabled={busy}
                          aria-label={t("runtimeEnvironments.renameAria", {
                            name: environment.name,
                          })}
                          title={t("runtimeEnvironments.rename")}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            setEditor({
                              kind: "rotate",
                              environment,
                              value: "",
                            })
                          }
                          disabled={busy}
                          aria-label={t("runtimeEnvironments.rotateKeyAria", {
                            name: environment.name,
                          })}
                          title={t("runtimeEnvironments.rotateKey")}
                        >
                          <RotateCw className="h-4 w-4" />
                        </Button>
                        {[
                          "runtimeHomeMissing",
                          "runtimeConfigMissing",
                          "runtimeConfigInvalid",
                        ].includes(environment.runtimeStatus ?? "") ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => void rebuildConfig(environment)}
                            disabled={busy}
                            aria-label={t(
                              "runtimeEnvironments.rebuildConfigAria",
                              { name: environment.name },
                            )}
                            title={t("runtimeEnvironments.rebuildConfig")}
                          >
                            {operation === `rebuild:${environment.id}` ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ShieldCheck className="h-4 w-4" />
                            )}
                          </Button>
                        ) : null}
                        {onViewSessions ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() =>
                              onViewSessions(appId, environment.id)
                            }
                            disabled={busy}
                            aria-label={t(
                              "runtimeEnvironments.viewSessionsAria",
                              { name: environment.name },
                            )}
                            title={t("runtimeEnvironments.viewSessions")}
                          >
                            <MessageSquare className="h-4 w-4" />
                          </Button>
                        ) : null}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            setDeleteTarget({
                              environment,
                              deleteSessions: appId === "codex",
                            })
                          }
                          disabled={busy}
                          aria-label={t("runtimeEnvironments.deleteAria", {
                            name: environment.name,
                          })}
                          title={t("common.delete")}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <DialogFooter>
            <DialogClose asChild disabled={busy}>
              <Button type="button" variant="outline" disabled={busy}>
                {t("common.close")}
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editor !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !busy) setEditor(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t(
                editor?.kind === "rotate"
                  ? "runtimeEnvironments.rotateKey"
                  : "runtimeEnvironments.rename",
              )}
            </DialogTitle>
            <DialogDescription>
              {t(
                editor?.kind === "rotate"
                  ? "runtimeEnvironments.rotateKeyImpactDescription"
                  : "runtimeEnvironments.renameDescription",
                { name: editor?.environment.name ?? "" },
              )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveEditor}>
            <div className="grid gap-2 px-6 py-5">
              <Label htmlFor="runtime-environment-editor">
                {editor?.kind === "rotate"
                  ? "API Key"
                  : t("runtimeEnvironments.name")}
              </Label>
              <Input
                id="runtime-environment-editor"
                value={editor?.value ?? ""}
                onChange={(event) =>
                  setEditor((current) =>
                    current ? { ...current, value: event.target.value } : null,
                  )
                }
                type={editor?.kind === "rotate" ? "password" : "text"}
                autoComplete={
                  editor?.kind === "rotate" ? "new-password" : "off"
                }
                autoFocus
                disabled={busy}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditor(null)}
                disabled={busy}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={busy || !editor?.value.trim()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title={t("runtimeEnvironments.deleteTitle")}
        message={
          deleteTarget
            ? t(
                deleteTarget.deleteSessions
                  ? "runtimeEnvironments.deleteWithSessionsMessage"
                  : "runtimeEnvironments.deleteKeepSessionsMessage",
                { name: deleteTarget.environment.name },
              )
            : ""
        }
        confirmText={t(
          deleteTarget?.deleteSessions
            ? "runtimeEnvironments.deleteWithSessions"
            : "runtimeEnvironments.deleteKeepSessions",
        )}
        pending={operation?.startsWith("delete:") ?? false}
        onConfirm={() => void remove()}
        onCancel={() => {
          if (!busy) setDeleteTarget(null);
        }}
      />
    </>
  );
}
