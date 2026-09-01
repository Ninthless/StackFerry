import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AppId } from "@/platform/tauri/api/types";
import { AppSelect } from "@/shared/common/AppSelect";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

interface SkillTargetAppDialogProps {
  open: boolean;
  appIds: readonly AppId[];
  value: AppId;
  title: string;
  description: string;
  confirmLabel: string;
  isPending?: boolean;
  onValueChange: (app: AppId) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function SkillTargetAppDialog({
  open,
  appIds,
  value,
  title,
  description,
  confirmLabel,
  isPending = false,
  onValueChange,
  onConfirm,
  onClose,
}: SkillTargetAppDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => !nextOpen && !isPending && onClose()}
    >
      <DialogContent className="max-w-sm" zIndex="alert">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4">
          <AppSelect
            value={value}
            appIds={appIds}
            onValueChange={onValueChange}
            ariaLabel={t("skills.selectTargetApplication")}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isPending}
          >
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
