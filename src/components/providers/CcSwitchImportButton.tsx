import { useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { AppId } from "@/lib/api";
import { providersApi } from "@/lib/api/providers";
import { extractErrorMessage } from "@/utils/errorUtils";
import { Button } from "@/components/ui/button";

interface CcSwitchImportButtonProps {
  appId: AppId;
}

export function CcSwitchImportButton({ appId }: CcSwitchImportButtonProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  const [isImporting, setIsImporting] = useState(false);

  if (appId !== "codex") {
    return null;
  }

  const handleImport = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsImporting(true);
    try {
      const result = await providersApi.importCcSwitchCodexProviders();
      await queryClient.invalidateQueries({ queryKey: ["providers", "codex"] });
      toast.success(t("provider.ccSwitchImportSuccess"), {
        description: t("provider.ccSwitchImportSummary", {
          imported: result.imported,
          added: result.added,
          updated: result.updated,
          merged: result.merged,
          skipped: result.skipped,
        }),
      });
      if (result.warnings.length > 0) {
        toast.warning(
          t("provider.ccSwitchImportWarnings", {
            count: result.warnings.length,
          }),
          { description: result.warnings.slice(0, 3).join("\n") },
        );
      }
    } catch (error) {
      toast.error(t("provider.ccSwitchImportFailed"), {
        description: extractErrorMessage(error),
      });
    } finally {
      inFlight.current = false;
      setIsImporting(false);
    }
  };

  const label = isImporting
    ? t("provider.ccSwitchImporting")
    : t("provider.importFromCcSwitch");

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void handleImport()}
      disabled={isImporting}
      aria-label={label}
      title={label}
    >
      {isImporting ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="h-4 w-4" aria-hidden="true" />
      )}
      <span>{label}</span>
    </Button>
  );
}
