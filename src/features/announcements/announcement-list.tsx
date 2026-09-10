import type { AnnouncementItem } from "@shared/types"
import { Badge } from "@/components/ui/badge"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item"
import * as m from "@/paraglide/messages.js"
import { announcementMeta } from "./announcement-provider"

type Props = {
  items: AnnouncementItem[]
  onSelect: (item: AnnouncementItem) => void
}

export function AnnouncementList({ items, onSelect }: Props) {
  return (
    <ItemGroup className="gap-2">
      {items.map((item) => (
        <Item
          key={item.id}
          size="xs"
          variant="outline"
          render={<button type="button" />}
          onClick={() => onSelect(item)}
        >
          <ItemContent className="min-w-0">
            <ItemTitle>
              <span className="truncate">{item.title}</span>
              {item.unread ? <Badge variant="destructive">{m.announcements_unread()}</Badge> : null}
              {item.prerelease ? <Badge variant="secondary">{m.announcements_prerelease()}</Badge> : null}
            </ItemTitle>
            <ItemDescription>{announcementMeta(item)}</ItemDescription>
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  )
}
