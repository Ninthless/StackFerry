import { useEffect, useState } from "react"
import { unreadAnnouncements } from "@shared/app-releases"
import type { AnnouncementItem, AnnouncementSnapshot } from "@shared/types"
import { Badge } from "@/components/ui/badge"
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

const DEV_PREVIEW: AnnouncementSnapshot = {
  unreadCount: 2,
  items: [
    {
      id: "dev-preview-2",
      title: "测试公告2",
      body: "测试公告2",
      htmlUrl: "https://ninthless.github.io/",
      tag: "更测试公告2",
      publishedAt: "2026-09-09T03:14:10.475Z",
      prerelease: true,
      unread: true,
    },
    {
      id: "dev-preview-1",
      title: "测试公告",
      body: "你好",
      htmlUrl: "",
      tag: "更新",
      publishedAt: "2026-09-09T03:13:34.134Z",
      prerelease: true,
      unread: true,
    },
  ],
}

export function AnnouncementPopup() {
  const [items, setItems] = useState<AnnouncementItem[]>([])
  const [index, setIndex] = useState(0)
  const [acking, setAcking] = useState(false)

  useEffect(() => {
    const api = window.stackferry
    if (!api) return
    void (async () => {
      try {
        setItems(unreadAnnouncements(await api.refreshAnnouncements()))
        setIndex(0)
      } catch {
        if (import.meta.env.DEV) {
          setItems(unreadAnnouncements(DEV_PREVIEW))
          setIndex(0)
        }
      }
    })()
  }, [])

  const item = items[index] ?? null
  const remaining = Math.max(0, items.length - index - 1)
  const last = remaining === 0

  function dismiss(): void {
    if (acking) return
    setItems([])
    setIndex(0)
  }

  function next(): void {
    if (acking || last) return
    setIndex((current) => current + 1)
  }

  async function ack(): Promise<void> {
    const api = window.stackferry
    if (!api) {
      dismiss()
      return
    }
    setAcking(true)
    try {
      setItems(unreadAnnouncements(await api.markAllAnnouncementsRead()))
      setIndex(0)
    } catch (error) {
      toast.add({ type: "error", description: formatAppError(error), priority: "high" })
    } finally {
      setAcking(false)
    }
  }

  const meta = item
    ? [item.tag, item.publishedAt ? item.publishedAt.slice(0, 10) : ""].filter(Boolean).join(" · ")
    : ""

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && dismiss()}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!acking}>
        <DialogHeader>
          <DialogTitle>{item?.title ?? ""}</DialogTitle>
          <DialogDescription>
            {meta}
            {remaining > 0 ? `${meta ? " · " : ""}${m.announcements_popup_more({ count: remaining })}` : ""}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea key={item?.id} className="max-h-80">
          <div className="flex flex-col gap-2">
            {item?.prerelease ? (
              <Badge variant="secondary" className="w-fit">
                {m.announcements_prerelease()}
              </Badge>
            ) : null}
            {item?.body ? <pre className="text-sm whitespace-pre-wrap">{item.body}</pre> : null}
          </div>
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
          {last ? (
            <Button type="button" disabled={acking} onClick={() => void ack()}>
              {m.announcements_popup_ack()}
            </Button>
          ) : (
            <Button type="button" disabled={acking} onClick={next}>
              {m.announcements_popup_next()}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
