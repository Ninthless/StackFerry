import { useState } from "react"
import { unreadAnnouncements } from "@shared/app-releases"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import * as m from "@/paraglide/messages.js"
import { announcementMeta, useAnnouncements } from "./announcement-provider"

export function AnnouncementDialog() {
  const { selected, snapshot, closeItem, nextItem, markAllRead } = useAnnouncements()
  const [acking, setAcking] = useState(false)
  const displayed = selected
    ? (snapshot.items.find((item) => item.id === selected.id) ?? selected)
    : null
  const unread = unreadAnnouncements(snapshot)
  const queueIndex = displayed ? unread.findIndex((item) => item.id === displayed.id) : -1
  const queued = queueIndex >= 0
  const remaining = queued ? unread.length - queueIndex - 1 : 0
  const meta = displayed ? announcementMeta(displayed) : ""

  async function ack(): Promise<void> {
    setAcking(true)
    try {
      if (await markAllRead()) closeItem()
    } finally {
      setAcking(false)
    }
  }

  return (
    <Dialog open={Boolean(displayed)} onOpenChange={(open) => !acking && !open && closeItem()}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!acking}>
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle className="min-w-0 truncate">{displayed?.title ?? ""}</DialogTitle>
          <DialogDescription>
            {meta}
            {remaining > 0 ? `${meta ? " · " : ""}${m.announcements_popup_more({ count: remaining })}` : ""}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea key={displayed?.id} className="max-h-80">
          <div className="flex flex-col gap-2">
            {displayed?.prerelease ? (
              <Badge variant="secondary" className="w-fit">
                {m.announcements_prerelease()}
              </Badge>
            ) : null}
            {displayed?.body ? <pre className="whitespace-pre-wrap">{displayed.body}</pre> : null}
          </div>
        </ScrollArea>
        <DialogFooter>
          {queued ? (
            <Button type="button" variant="outline" disabled={acking} onClick={closeItem}>
              {m.announcements_popup_later()}
            </Button>
          ) : null}
          {displayed?.htmlUrl ? (
            <Button
              type="button"
              variant="outline"
              disabled={acking}
              onClick={() => window.open(displayed.htmlUrl, "_blank", "noopener")}
            >
              {m.announcements_open_github()}
            </Button>
          ) : null}
          {queued ? (
            remaining > 0 ? (
              <Button type="button" disabled={acking} onClick={nextItem}>
                {m.announcements_popup_next()}
              </Button>
            ) : (
              <Button type="button" disabled={acking} onClick={() => void ack()}>
                {m.announcements_popup_ack()}
              </Button>
            )
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
