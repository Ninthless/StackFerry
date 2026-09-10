import { EllipsisVertical } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import * as m from "@/paraglide/messages.js"

type Props = {
  official: boolean
  enabled: boolean
  providerId: string
  queue: readonly string[]
  busy: boolean
  onSetQueued: (id: string, queued: boolean) => void
  onEnable: (id: string) => void
  onEdit: () => void
  onDelete: () => void
}

export function ProviderRoutingActions({
  official,
  enabled,
  providerId,
  queue,
  busy,
  onSetQueued,
  onEnable,
  onEdit,
  onDelete,
}: Props) {
  const queueIndex = queue.indexOf(providerId)
  const queued = queueIndex >= 0

  return (
    <div className="flex items-center justify-end gap-2">
      {official || enabled ? null : queued ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Badge
                variant="secondary"
                className="cursor-pointer"
                onClick={() => onSetQueued(providerId, false)}
              />
            }
          >
            {m.routing_queue_position({ position: queueIndex + 1 })}
          </TooltipTrigger>
          <TooltipContent>{m.routing_queue_leave_hint({ position: queueIndex + 1 })}</TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger
            render={
              <Badge
                variant="outline"
                className="cursor-pointer"
                onClick={() => onSetQueued(providerId, true)}
              />
            }
          >
            {m.routing_queue_join()}
          </TooltipTrigger>
          <TooltipContent>{m.routing_queue_join_hint()}</TooltipContent>
        </Tooltip>
      )}
      {enabled ? (
        <Badge variant="secondary">
          {queue.length > 0 && !official ? m.routing_badge_current() : m.provider_enabled_badge()}
        </Badge>
      ) : queued ? (
        <Tooltip>
          <TooltipTrigger render={<Badge variant="outline" />}>
            {m.routing_badge_standby()}
          </TooltipTrigger>
          <TooltipContent>{m.routing_queued_cannot_enable()}</TooltipContent>
        </Tooltip>
      ) : (
        <Button size="sm" disabled={busy} onClick={() => onEnable(providerId)}>
          {m.provider_enable()}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button type="button" variant="ghost" size="icon-sm" aria-label={m.provider_more()} />
          }
        >
          <EllipsisVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-36">
          {official || enabled ? null : (
            <DropdownMenuItem disabled={busy} onClick={() => onSetQueued(providerId, !queued)}>
              {queued ? m.routing_queue_leave() : m.routing_queue_join()}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onEdit}>{m.provider_edit()}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            {m.provider_delete()}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
