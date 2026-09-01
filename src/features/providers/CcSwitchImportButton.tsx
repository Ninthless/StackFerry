import { useState } from "react";
import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AppId } from "@/platform/tauri/api";
import { Button } from "@/shared/ui/button";
import { CcSwitchImportDialog } from "./CcSwitchImportDialog";

interface CcSwitchImportButtonProps {
  appId: AppId;
}

export function CcSwitchImportButton({ appId }: CcSwitchImportButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const label = t("provider.importFromCcSwitch");

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        data-header-action="import-cc-switch"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        <span>{label}</span>
      </Button>
      <CcSwitchImportDialog open={open} appId={appId} onOpenChange={setOpen} />
    </>
  );
}
