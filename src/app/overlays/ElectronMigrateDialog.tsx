import { useState } from "react";
import { ArrowUpCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { settingsApi } from "@/platform/tauri/api";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  ELECTRON_DOWNLOAD_URL,
  ELECTRON_MIGRATE_DISMISSED_KEY,
} from "@/lib/electronMigrate";

export function ElectronMigrateDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(
    () => localStorage.getItem(ELECTRON_MIGRATE_DISMISSED_KEY) !== "1",
  );
  const [opening, setOpening] = useState(false);

  async function handleDownload(): Promise<void> {
    setOpening(true);
    try {
      await settingsApi.openExternal(ELECTRON_DOWNLOAD_URL);
    } finally {
      setOpening(false);
    }
  }

  function handleLater(): void {
    localStorage.setItem(ELECTRON_MIGRATE_DISMISSED_KEY, "1");
    setOpen(false);
  }

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-md"
        zIndex="top"
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpCircle className="h-5 w-5" />
            {t("electronMigrate.title")}
          </DialogTitle>
          <DialogDescription>{t("electronMigrate.summary")}</DialogDescription>
        </DialogHeader>
        <div className="whitespace-pre-line px-6 py-5 text-sm leading-6 text-foreground/85">
          {t("electronMigrate.body")}
        </div>
        <DialogFooter className="justify-between sm:justify-between">
          <Button type="button" variant="outline" onClick={handleLater}>
            {t("electronMigrate.later")}
          </Button>
          <Button
            type="button"
            onClick={() => void handleDownload()}
            disabled={opening}
          >
            {opening
              ? t("electronMigrate.opening")
              : t("electronMigrate.download")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
