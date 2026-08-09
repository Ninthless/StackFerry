import { useEffect, useState } from "react";
import { FolderOpen, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { piExtensionsApi } from "@/lib/api/piExtensions";
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
  disabled: boolean;
  disabledReason?: string;
  onOpenChange: (open: boolean) => void;
  onRegisterExtension: (path: string) => Promise<void>;
  onInstallPackage: (source: string) => Promise<void>;
}

export function PiPackageInstallDialog({
  open,
  pending,
  disabled,
  disabledReason,
  onOpenChange,
  onRegisterExtension,
  onInstallPackage,
}: PiPackageInstallDialogProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<InstallMode>("extensionFile");
  const [value, setValue] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (open) {
      setValue("");
      setConfirmed(false);
    }
  }, [open, mode]);

  const isExtension = mode === "extensionFile" || mode === "extensionDirectory";
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
    const source = value.trim();
    if (!source || !confirmed) return;
    if (isExtension) {
      await onRegisterExtension(source);
    } else {
      await onInstallPackage(source);
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
          {disabledReason && (
            <p className="text-sm text-destructive">{disabledReason}</p>
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
            disabled={!value.trim() || !confirmed || pending || disabled}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("piExtensions.installDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
