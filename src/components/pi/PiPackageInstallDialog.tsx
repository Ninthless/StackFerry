import { useEffect, useState } from "react";
import { FolderOpen, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { piExtensionsApi } from "@/lib/api/piExtensions";
import type { PiExtensionScope, PiScopeTarget } from "@/lib/api/piExtensions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type InstallMode =
  | "extensionFile"
  | "extensionDirectory"
  | "packageDirectory"
  | "npm"
  | "git";

interface PiPackageInstallDialogProps {
  open: boolean;
  pending: boolean;
  configMutable: boolean;
  cliAvailable: boolean;
  configUnavailableReason?: string;
  cliUnavailableReason?: string;
  projectDir?: string;
  initialScope: PiExtensionScope;
  onOpenChange: (open: boolean) => void;
  onRegisterExtension: (path: string, target: PiScopeTarget) => Promise<void>;
  onInstallPackage: (source: string, target: PiScopeTarget) => Promise<void>;
}

export function PiPackageInstallDialog({
  open,
  pending,
  configMutable,
  cliAvailable,
  configUnavailableReason,
  cliUnavailableReason,
  projectDir,
  initialScope,
  onOpenChange,
  onRegisterExtension,
  onInstallPackage,
}: PiPackageInstallDialogProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<InstallMode>("extensionFile");
  const [value, setValue] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [scope, setScope] = useState<PiExtensionScope>(initialScope);

  useEffect(() => {
    if (open) {
      setValue("");
      setConfirmed(false);
      setScope(initialScope);
    }
  }, [initialScope, open, mode]);

  const isExtension = mode === "extensionFile" || mode === "extensionDirectory";
  const targetAvailable = scope === "global" || Boolean(projectDir);
  const modeAvailable =
    configMutable && targetAvailable && (isExtension || cliAvailable);
  const unavailableReason = !configMutable
    ? configUnavailableReason
    : !isExtension && !cliAvailable
      ? cliUnavailableReason
      : undefined;
  const canBrowse =
    mode === "extensionFile" ||
    mode === "extensionDirectory" ||
    mode === "packageDirectory";

  const handleBrowse = async () => {
    const path =
      mode === "extensionFile"
        ? await piExtensionsApi.browseFile()
        : await piExtensionsApi.browseDirectory();
    if (path) setValue(path);
  };

  const handleSubmit = async () => {
    const rawSource = value.trim();
    const source =
      mode === "npm" && !rawSource.toLocaleLowerCase().startsWith("npm:")
        ? `npm:${rawSource}`
        : rawSource;
    if (!source || !confirmed) return;
    const target = {
      scope,
      projectDir: scope === "project" ? projectDir : undefined,
    };
    if (isExtension) {
      await onRegisterExtension(source, target);
    } else {
      await onInstallPackage(source, target);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("piExtensions.installDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("piExtensions.installDialog.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 overflow-y-auto px-6 py-5">
          <Tabs
            value={mode}
            onValueChange={(value) => setMode(value as InstallMode)}
          >
            <TabsList className="grid w-full grid-cols-2 gap-1 rounded-md border border-border bg-muted/35 p-1 sm:grid-cols-5">
              {(
                [
                  "extensionFile",
                  "extensionDirectory",
                  "packageDirectory",
                  "npm",
                  "git",
                ] as InstallMode[]
              ).map((item) => (
                <TabsTrigger
                  key={item}
                  value={item}
                  className="min-w-0 px-2 py-1.5 text-xs"
                >
                  {t(`piExtensions.installDialog.modes.${item}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="space-y-2">
            <Label>{t("piExtensions.installDialog.target")}</Label>
            <div
              className="grid grid-cols-2 rounded-md border border-border bg-muted/35 p-1"
              role="group"
              aria-label={t("piExtensions.installDialog.target")}
            >
              {(["global", "project"] as PiExtensionScope[]).map((item) => (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant={scope === item ? "secondary" : "ghost"}
                  className="h-7"
                  disabled={item === "project" && !projectDir}
                  onClick={() => setScope(item)}
                >
                  {t(`piExtensions.scope.${item}`)}
                </Button>
              ))}
            </div>
            {scope === "project" && projectDir && (
              <p
                className="truncate text-xs text-muted-foreground"
                title={projectDir}
              >
                {projectDir}
              </p>
            )}
            {!projectDir && (
              <p className="text-xs text-muted-foreground">
                {t("piExtensions.installDialog.projectRequired")}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="pi-extension-source">
              {t(`piExtensions.installDialog.labels.${mode}`)}
            </Label>
            <div className="flex gap-2">
              <Input
                id="pi-extension-source"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={t(
                  `piExtensions.installDialog.placeholders.${mode}`,
                )}
              />
              {canBrowse && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => void handleBrowse()}
                  aria-label={t("piExtensions.installDialog.browse")}
                  title={t("piExtensions.installDialog.browse")}
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked === true)}
              className="mt-0.5"
            />
            <span className="text-sm leading-relaxed">
              {t("piExtensions.installDialog.risk")}
            </span>
          </label>
          {unavailableReason && (
            <p className="text-sm text-destructive">{unavailableReason}</p>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!value.trim() || !confirmed || pending || !modeAvailable}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("piExtensions.installDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
