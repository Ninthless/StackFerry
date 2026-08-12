import { ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAnnouncements } from "@/contexts/AnnouncementContext";
import { AnnouncementActions } from "@/components/announcements/AnnouncementActions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function CriticalAnnouncementDialog({
  onOpenUpdate,
}: {
  onOpenUpdate: () => void;
}) {
  const { t } = useTranslation();
  const { critical, acknowledge } = useAnnouncements();

  return (
    <Dialog open={Boolean(critical)}>
      <DialogContent
        className="max-w-xl"
        zIndex="top"
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        {critical && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-destructive" />
                {critical.title}
              </DialogTitle>
              <DialogDescription>{critical.summary}</DialogDescription>
            </DialogHeader>
            <div className="max-h-[52vh] overflow-y-auto px-6 py-5">
              <div className="whitespace-pre-line text-sm leading-6 text-foreground/85">
                {critical.body}
              </div>
            </div>
            <DialogFooter className="justify-between sm:justify-between">
              <AnnouncementActions
                announcement={critical}
                onOpenUpdate={onOpenUpdate}
              />
              <Button onClick={() => void acknowledge(critical.id)}>
                {t("announcements.acknowledge")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
