import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCheck,
  Info,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Announcement, AnnouncementSeverity } from "@/platform/tauri/api";
import { useAnnouncements } from "@/contexts/AnnouncementContext";
import { AnnouncementActions } from "@/features/announcements/AnnouncementActions";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { cn } from "@/lib/utils";

const severityIcon: Record<AnnouncementSeverity, typeof Info> = {
  info: Info,
  important: AlertTriangle,
  critical: ShieldAlert,
};

function formatDate(value: string, language: string) {
  return new Intl.DateTimeFormat(language, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function AnnouncementListItem({
  announcement,
  selected,
  onSelect,
}: {
  announcement: Announcement;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t, i18n } = useTranslation();
  const Icon = severityIcon[announcement.severity];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full border-b border-border px-4 py-4 text-left transition-colors",
        selected ? "bg-muted/65" : "hover:bg-muted/35",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
            announcement.severity === "critical"
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-border bg-background text-muted-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">
              {announcement.title}
            </span>
            {!announcement.read && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                title={t("announcements.unread")}
              />
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {announcement.summary}
          </p>
          <div className="mt-2 text-[11px] text-muted-foreground/80">
            {formatDate(announcement.publishedAt, i18n.language)}
          </div>
        </div>
      </div>
    </button>
  );
}

export function AnnouncementCenter({
  requestedAnnouncementId,
  onOpenUpdate,
}: {
  requestedAnnouncementId?: string | null;
  onOpenUpdate: () => void;
}) {
  const { t, i18n } = useTranslation();
  const {
    feed,
    isLoading,
    isRefreshing,
    error,
    refresh,
    markRead,
    markAllRead,
  } = useAnnouncements();
  const [selectedId, setSelectedId] = useState<string | null>(
    requestedAnnouncementId ?? null,
  );
  const [compactDetailOpen, setCompactDetailOpen] = useState(
    Boolean(requestedAnnouncementId),
  );

  const selected = useMemo(
    () =>
      feed?.announcements.find(
        (announcement) => announcement.id === selectedId,
      ) ??
      feed?.announcements[0] ??
      null,
    [feed, selectedId],
  );

  useEffect(() => {
    if (requestedAnnouncementId) {
      setSelectedId(requestedAnnouncementId);
      setCompactDetailOpen(true);
    }
  }, [requestedAnnouncementId]);

  useEffect(() => {
    if (selected && selectedId && !selected.read) {
      void markRead(selected.id);
    }
  }, [markRead, selected, selectedId]);

  if (isLoading && !feed) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          {t("announcements.loading")}
        </div>
      </div>
    );
  }

  const announcements = feed?.announcements ?? [];

  return (
    <div
      className="announcement-center flex min-h-0 flex-1 flex-col overflow-hidden"
      data-compact-detail={compactDetailOpen}
    >
      <div className="announcement-list-toolbar flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 text-xs text-muted-foreground">
          {error
            ? t("announcements.cachedNotice")
            : t("announcements.count", { count: announcements.length })}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {feed && feed.unreadCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void markAllRead()}
            >
              <CheckCheck className="h-4 w-4" />
              <span className="hidden sm:inline">
                {t("announcements.markAllRead")}
              </span>
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => void refresh()}
            disabled={isRefreshing}
            title={t("common.refresh")}
            aria-label={t("common.refresh")}
          >
            <RefreshCw
              className={cn("h-4 w-4", isRefreshing && "animate-spin")}
            />
          </Button>
        </div>
      </div>

      {announcements.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted/40">
            <Bell className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-medium">{t("announcements.empty")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("announcements.emptyDescription")}
            </p>
          </div>
        </div>
      ) : (
        <div className="announcement-layout grid min-h-0 flex-1 grid-cols-[minmax(260px,34%)_minmax(0,1fr)] overflow-hidden">
          <div className="announcement-list min-h-0 overflow-y-auto border-r border-border">
            {announcements.map((announcement) => (
              <AnnouncementListItem
                key={announcement.id}
                announcement={announcement}
                selected={announcement.id === selected?.id}
                onSelect={() => {
                  setSelectedId(announcement.id);
                  setCompactDetailOpen(true);
                }}
              />
            ))}
          </div>

          {selected && (
            <article className="announcement-detail min-h-0 overflow-y-auto px-5 py-6 sm:px-8 md:px-10">
              <div className="mx-auto max-w-3xl">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCompactDetailOpen(false)}
                  className="announcement-detail-back mb-5 hidden"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {t("common.back")}
                </Button>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      selected.severity === "critical"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {t(`announcements.severity.${selected.severity}`)}
                  </Badge>
                  {selected.relatedVersion && (
                    <Badge variant="outline">v{selected.relatedVersion}</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatDate(selected.publishedAt, i18n.language)}
                  </span>
                </div>
                <h2 className="mt-4 text-xl font-semibold leading-tight">
                  {selected.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {selected.summary}
                </p>
                <div className="my-6 border-t border-border" />
                <div className="whitespace-pre-line text-sm leading-7 text-foreground/85">
                  {selected.body}
                </div>
                <div className="mt-8">
                  <AnnouncementActions
                    announcement={selected}
                    onOpenUpdate={onOpenUpdate}
                  />
                </div>
              </div>
            </article>
          )}
        </div>
      )}
    </div>
  );
}
