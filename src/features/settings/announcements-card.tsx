import { Megaphone } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { HintTitle } from "@/features/settings/settings-hint"
import * as m from "@/paraglide/messages.js"
import { AnnouncementList } from "@/features/announcements/announcement-list"
import { useAnnouncements } from "@/features/announcements/announcement-provider"

export function AnnouncementsCard() {
  const { snapshot, loading, refreshing, error, refresh, openItem, markAllRead } = useAnnouncements()

  return (
    <Card>
      <CardHeader>
        <HintTitle hint={m.announcements_description()}>
          <CardTitle>{m.announcements_legend()}</CardTitle>
        </HintTitle>
        <CardAction>
          <div className="flex flex-wrap justify-end gap-2">
            {snapshot.unreadCount > 0 ? (
              <Button type="button" variant="ghost" size="sm" disabled={refreshing} onClick={() => void markAllRead()}>
                {m.announcements_mark_all_read()}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={refreshing}
              onClick={() => void refresh(true)}
            >
              {refreshing ? <Spinner data-icon="inline-start" /> : null}
              {refreshing ? m.announcements_refreshing() : m.announcements_refresh()}
            </Button>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>{m.status_read_failed()}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {loading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : snapshot.items.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Megaphone />
              </EmptyMedia>
              <EmptyTitle>{m.announcements_empty_title()}</EmptyTitle>
              <EmptyDescription>{m.announcements_empty_description()}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <AnnouncementList items={snapshot.items} onSelect={(item) => void openItem(item)} />
        )}
      </CardContent>
    </Card>
  )
}
