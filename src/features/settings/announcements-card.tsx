import { useCallback, useEffect, useState } from "react"
import { Tag } from "antd"
import { Megaphone } from "lucide-react"
import type { AnnouncementItem, AnnouncementSnapshot } from "@shared/types"
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
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { formatAppError } from "@/lib/format-app-error"
import * as m from "@/paraglide/messages.js"
import { HintTitle } from "./settings-hint"

const EMPTY: AnnouncementSnapshot = { items: [], unreadCount: 0 }

export function AnnouncementsCard() {
  const [snapshot, setSnapshot] = useState<AnnouncementSnapshot>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [selected, setSelected] = useState<AnnouncementItem | null>(null)

  const refresh = useCallback(async (manual: boolean) => {
    const api = window.stackferry
    if (!api) {
      setError(m.error_desktop_only())
      setLoading(false)
      return
    }
    setRefreshing(true)
    const toastId = "announcements-refresh"
    if (manual) {
      toast.add({ id: toastId, type: "loading", description: m.toast_announcements_refreshing(), timeout: 0 })
    }
    try {
      const next = await api.refreshAnnouncements()
      setSnapshot(next)
      setError("")
      if (manual) toast.add({ id: toastId, type: "success", description: m.toast_announcements_refreshed() })
    } catch (refreshError) {
      const message = formatAppError(refreshError)
      setError(message)
      if (manual) {
        toast.close(toastId)
        toast.add({ type: "error", description: message, priority: "high" })
      }
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh(false)
  }, [refresh])

  async function openItem(item: AnnouncementItem): Promise<void> {
    setSelected(item)
    const api = window.stackferry
    if (!api || !item.unread) return
    try {
      setSnapshot(await api.markAnnouncementRead(item.id))
    } catch (markError) {
      toast.add({ type: "error", description: formatAppError(markError), priority: "high" })
    }
  }

  async function markAllRead(): Promise<void> {
    const api = window.stackferry
    if (!api) return
    try {
      setSnapshot(await api.markAllAnnouncementsRead())
    } catch (markError) {
      toast.add({ type: "error", description: formatAppError(markError), priority: "high" })
    }
  }

  const displayed = selected
    ? (snapshot.items.find((item) => item.id === selected.id) ?? selected)
    : null

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
          <ItemGroup>
            {snapshot.items.map((item) => (
              <Item
                key={item.id}
                variant="outline"
                render={<button type="button" />}
                onClick={() => void openItem(item)}
              >
                <ItemContent className="min-w-0">
                  <ItemTitle>
                    <span>{item.title}</span>
                    {item.unread ? <Tag color="warning">{m.announcements_unread()}</Tag> : null}
                    {item.prerelease ? <Tag>{m.announcements_prerelease()}</Tag> : null}
                  </ItemTitle>
                  <ItemDescription>
                    {[item.tag, item.publishedAt ? item.publishedAt.slice(0, 10) : ""]
                      .filter(Boolean)
                      .join(" · ")}
                  </ItemDescription>
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        )}
      </CardContent>
      <Sheet open={Boolean(displayed)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{displayed?.title ?? ""}</SheetTitle>
            <SheetDescription>
              {[displayed?.tag, displayed?.publishedAt ? displayed.publishedAt.slice(0, 10) : ""]
                .filter(Boolean)
                .join(" · ")}
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="min-h-0 flex-1">
            <pre className="px-4 pb-4 text-sm whitespace-pre-wrap">{displayed?.body ?? ""}</pre>
          </ScrollArea>
          <SheetFooter>
            {displayed?.htmlUrl ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => window.open(displayed.htmlUrl, "_blank", "noopener")}
              >
                {m.announcements_open_github()}
              </Button>
            ) : null}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </Card>
  )
}
