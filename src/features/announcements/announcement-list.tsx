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
          className="overflow-hidden"
          render={<button type="button" />}
          onClick={() => onSelect(item)}
        >
          <ItemContent className="min-w-0 overflow-hidden">
            <ItemTitle className="w-full min-w-0 max-w-full">
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
              {item.unread ? (
                <Badge variant="destructive" className="shrink-0">
                  {m.announcements_unread()}
                </Badge>
              ) : null}
              {item.prerelease ? (
                <Badge variant="secondary" className="shrink-0">
                  {m.announcements_prerelease()}
                </Badge>
              ) : null}
            </ItemTitle>
            <ItemDescription>{announcementMeta(item)}</ItemDescription>
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  )
}
