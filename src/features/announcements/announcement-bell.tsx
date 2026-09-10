import { useState } from "react"
import { Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import * as m from "@/paraglide/messages.js"
import { AnnouncementList } from "./announcement-list"
import { useAnnouncements } from "./announcement-provider"

export function AnnouncementBell() {
  const { snapshot, loading, refreshing, openItem, markAllRead, refresh } = useAnnouncements()
  const [peekOpen, setPeekOpen] = useState(false)
  const unread = snapshot.unreadCount

  return (
    <HoverCard open={peekOpen} onOpenChange={setPeekOpen}>
      <HoverCardTrigger
        delay={120}
        closeDelay={200}
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="relative"
            aria-label={
              unread > 0
                ? m.announcements_bell_unread({ count: unread })
                : m.announcements_legend()
            }
          />
        }
      >
        <Bell />
        {unread > 0 ? (
          <span
            className="bg-destructive ring-background absolute top-1 right-1 size-2 rounded-full ring-2"
            aria-hidden
          />
        ) : null}
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <p className="text-sm font-medium">{m.announcements_legend()}</p>
          <div className="flex items-center gap-1">
            {unread > 0 ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => void markAllRead()}>
                {m.announcements_mark_all_read()}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={refreshing}
              onClick={() => void refresh(true)}
            >
              {refreshing ? <Spinner data-icon="inline-start" /> : null}
              {refreshing ? m.announcements_refreshing() : m.announcements_refresh()}
            </Button>
          </div>
        </div>
        <ScrollArea className="max-h-80 px-3 pb-3">
          {loading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : snapshot.items.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{m.announcements_empty_title()}</EmptyTitle>
                <EmptyDescription>{m.announcements_empty_description()}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <AnnouncementList
              items={snapshot.items}
              onSelect={(item) => {
                setPeekOpen(false)
                void openItem(item)
              }}
            />
          )}
        </ScrollArea>
      </HoverCardContent>
    </HoverCard>
  )
}
