import { KeyRound, Pencil, Sparkles, Trash2 } from "lucide-react"
import type { ProviderListItem } from "@shared/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import * as m from "@/paraglide/messages.js"

type Props = {
  provider: ProviderListItem
  busy: boolean
  queued: boolean
  routingActive: boolean
  onEnable: () => void
  onEdit: () => void
  onDelete: () => void
  onQueueChange: (queued: boolean) => void
}

export function ProviderCard({
  provider,
  busy,
  queued,
  routingActive,
  onEnable,
  onEdit,
  onDelete,
  onQueueChange,
}: Props) {
  const official = provider.kind === "official"
  const description = official
    ? m.provider_official_description()
    : [provider.model, provider.baseUrl].filter(Boolean).join(" · ") || m.provider_custom_fallback()

  return (
    <ContextMenu>
      <ContextMenuTrigger render={<Item variant="outline" className="flex-nowrap" />}>
        <ItemMedia variant="icon">
          {official ? <Sparkles /> : <KeyRound />}
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="max-w-full min-w-0 truncate">{provider.name}</ItemTitle>
          <ItemDescription>{description}</ItemDescription>
        </ItemContent>
        <ItemActions className="ml-auto shrink-0">
          {official ? null : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="flex items-center">
                    <Switch
                      size="sm"
                      checked={queued}
                      disabled={busy}
                      onCheckedChange={onQueueChange}
                    />
                  </span>
                }
              />
              <TooltipContent>{m.routing_queued()}</TooltipContent>
            </Tooltip>
          )}
          {queued && !official && !provider.enabled ? (
            <Badge variant="outline">{m.routing_badge_standby()}</Badge>
          ) : null}
          {provider.enabled ? (
            <Badge variant="secondary">
              {routingActive && !official ? m.routing_badge_current() : m.provider_enabled_badge()}
            </Badge>
          ) : (
            <Button type="button" size="sm" disabled={busy} onClick={onEnable}>
              {busy ? m.provider_enabling() : m.provider_enable()}
            </Button>
          )}
          <Tooltip>
            <TooltipTrigger
              render={<Button type="button" variant="outline" size="icon-sm" onClick={onEdit} />}
            >
              <Pencil />
              <span className="sr-only">{m.provider_edit()}</span>
            </TooltipTrigger>
            <TooltipContent>{m.provider_edit()}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={<Button type="button" variant="destructive" size="icon-sm" onClick={onDelete} />}
            >
              <Trash2 />
              <span className="sr-only">{m.provider_delete()}</span>
            </TooltipTrigger>
            <TooltipContent>{m.provider_delete()}</TooltipContent>
          </Tooltip>
        </ItemActions>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuGroup>
          {provider.enabled ? null : (
            <ContextMenuItem disabled={busy} onClick={onEnable}>
              {busy ? m.provider_enabling() : m.provider_enable()}
            </ContextMenuItem>
          )}
          {official ? null : (
            <ContextMenuItem
              disabled={busy}
              onClick={() => onQueueChange(!queued)}
            >
              {m.routing_queued()}
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={onEdit}>
            <Pencil />
            {m.provider_edit()}
          </ContextMenuItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 />
            {m.provider_delete()}
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  )
}
