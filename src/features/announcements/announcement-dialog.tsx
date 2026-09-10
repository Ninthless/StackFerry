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
  const { selected, snapshot, closeItem } = useAnnouncements()
  const displayed = selected
    ? (snapshot.items.find((item) => item.id === selected.id) ?? selected)
    : null

  return (
    <Dialog open={Boolean(displayed)} onOpenChange={(open) => !open && closeItem()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{displayed?.title ?? ""}</DialogTitle>
          <DialogDescription>{displayed ? announcementMeta(displayed) : ""}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-80">
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
          {displayed?.htmlUrl ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => window.open(displayed.htmlUrl, "_blank", "noopener")}
            >
              {m.announcements_open_github()}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
