import { ArrowRight, Megaphone, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAnnouncements } from "@/contexts/AnnouncementContext";
import { Button } from "@/shared/ui/button";

export function AnnouncementBanner({
  onOpen,
}: {
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { banner, dismiss } = useAnnouncements();

  if (!banner) return null;

  return (
    <div className="shrink-0 border-b border-border bg-muted/45 px-4 py-2">
      <div className="mx-auto flex max-w-[1200px] items-center gap-3">
        <Megaphone className="h-4 w-4 shrink-0 text-foreground/70" />
        <button
          type="button"
          onClick={() => onOpen(banner.id)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-sm font-medium">
            {banner.title}
          </span>
          <span className="hidden truncate text-xs text-muted-foreground md:block">
            {banner.summary}
          </span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onOpen(banner.id)}
          className="hidden shrink-0 sm:inline-flex"
        >
          {t("announcements.view")}
          <ArrowRight className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => void dismiss(banner.id)}
          title={t("announcements.dismiss")}
          aria-label={t("announcements.dismiss")}
          className="h-8 w-8 shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
