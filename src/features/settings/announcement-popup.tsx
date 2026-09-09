import { useEffect, useState } from "react"
import { latestUnreadAnnouncement } from "@shared/app-releases"
import type { AnnouncementItem, AnnouncementSnapshot } from "@shared/types"
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
import { toast } from "@/components/ui/toast"
import { formatAppError } from "@/lib/format-app-error"
import * as m from "@/paraglide/messages.js"

export function AnnouncementPopup() {
  const [item, setItem] = useState<AnnouncementItem | null>(null)
  const [moreCount, setMoreCount] = useState(0)
  const [acking, setAcking] = useState(false)

  useEffect(() => {
    const api = window.stackferry
    if (!api) return
    void (async () => {
      try {
        show(await api.refreshAnnouncements())
      } catch {
        // 启动拉取失败时不弹窗；关于页仍会显示错误。
      }
    })()
  }, [])

  function show(snapshot: AnnouncementSnapshot): void {
    const unread = latestUnreadAnnouncement(snapshot)
    if (!unread) {
      setItem(null)
      setMoreCount(0)
      return
    }
    setItem(unread)
    setMoreCount(Math.max(0, snapshot.unreadCount - 1))
  }

  function dismiss(): void {
    if (acking) return
    setItem(null)
    setMoreCount(0)
  }

  async function ack(): Promise<void> {
    const api = window.stackferry
    const current = item
    if (!api || !current) {
      dismiss()
      return
    }
    setAcking(true)
    try {
      show(await api.markAnnouncementRead(current.id))
    } catch (error) {
      toast.add({ type: "error", description: formatAppError(error), priority: "high" })
    } finally {
      setAcking(false)
    }
  }

  const meta = item
    ? [item.tag, item.publishedAt ? item.publishedAt.slice(0, 10) : ""]
        .filter(Boolean)
        .join(" · ")
    : ""

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && dismiss()}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!acking}>
        <DialogHeader>
          <DialogTitle>{item?.title ?? ""}</DialogTitle>
          <DialogDescription>
            {meta}
            {moreCount > 0 ? ` · ${m.announcements_popup_more({ count: moreCount })}` : ""}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea key={item?.id} className="max-h-80">
          <pre className="text-sm whitespace-pre-wrap">{item?.body ?? ""}</pre>
        </ScrollArea>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={acking} onClick={dismiss}>
            {m.announcements_popup_later()}
          </Button>
          {item?.htmlUrl ? (
            <Button
              type="button"
              variant="outline"
              disabled={acking}
              onClick={() => window.open(item.htmlUrl, "_blank", "noopener")}
            >
              {m.announcements_open_github()}
            </Button>
          ) : null}
          <Button type="button" disabled={acking} onClick={() => void ack()}>
            {m.announcements_popup_ack()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
