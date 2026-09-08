import { useRef } from "react"
import { GripVertical, ListOrdered, RotateCcw } from "lucide-react"
import type { BreakerStateName } from "@shared/routing"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Field } from "@/components/ui/field"
import { HintLabel } from "./settings-hint"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import {
  Sortable,
  SortableContent,
  SortableItem,
  SortableItemHandle,
  SortableOverlay,
} from "@/components/ui/sortable"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import * as m from "@/paraglide/messages.js"

type Props = {
  queue: string[]
  names: Map<string, string>
  breakers: Map<string, BreakerStateName>
  currentId: string | null
  onReorder: (ids: string[]) => void
  onResetBreaker: (id: string) => void
}

export function RoutingQueueField({
  queue,
  names,
  breakers,
  currentId,
  onReorder,
  onResetBreaker,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null)

  return (
    <Field>
      <HintLabel hint={m.routing_queue_description()}>{m.routing_queue_label()}</HintLabel>
      {queue.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListOrdered />
            </EmptyMedia>
            <EmptyTitle>{m.routing_queue_empty_title()}</EmptyTitle>
            <EmptyDescription>{m.routing_queue_empty()}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Sortable value={queue} onValueChange={onReorder}>
          <SortableContent render={<ItemGroup ref={listRef} data-size="sm" className="gap-0 has-data-[size=sm]:gap-0" />}>
            {queue.map((id, index) => {
              const state = breakers.get(id)
              return (
                <SortableItem key={id} value={id} className="mb-2.5 w-full last:mb-0">
                  <Item variant="outline" size="sm" className="w-full flex-nowrap bg-background">
                    <QueueRow
                      id={id}
                      index={index}
                      name={names.get(id) ?? id}
                      state={state}
                      current={id === currentId}
                      onResetBreaker={onResetBreaker}
                    />
                  </Item>
                </SortableItem>
              )
            })}
          </SortableContent>
          <SortableOverlay
            dropAnimation={{ duration: 180, easing: "cubic-bezier(0.25, 1, 0.5, 1)", sideEffects: null }}
          >
            {({ value }) => {
              const id = String(value)
              return (
                <Item
                  variant="outline"
                  size="sm"
                  className="flex-nowrap bg-background shadow-sm"
                  style={{ width: listRef.current?.offsetWidth }}
                >
                  <ItemMedia>
                    <Button type="button" variant="ghost" size="icon-sm">
                      <GripVertical />
                    </Button>
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{names.get(id) ?? id}</ItemTitle>
                  </ItemContent>
                  <ItemActions>
                    {id === currentId ? <Badge>{m.routing_badge_current()}</Badge> : null}
                  </ItemActions>
                </Item>
              )
            }}
          </SortableOverlay>
        </Sortable>
      )}
    </Field>
  )
}

function QueueRow({
  id,
  index,
  name,
  state,
  current,
  onResetBreaker,
}: {
  id: string
  index: number
  name: string
  state: BreakerStateName | undefined
  current: boolean
  onResetBreaker: (id: string) => void
}) {
  const canReset = state === "open" || state === "halfOpen"
  return (
    <>
      <ItemMedia>
        <SortableItemHandle render={<Button type="button" variant="ghost" size="icon-sm" />}>
          <GripVertical />
          <span className="sr-only">{m.routing_queue_drag()}</span>
        </SortableItemHandle>
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{name}</ItemTitle>
      </ItemContent>
      <ItemActions>
        <span className="text-muted-foreground tabular-nums">{index + 1}</span>
        {current ? <Badge>{m.routing_badge_current()}</Badge> : null}
        <Badge variant={breakerBadge(state)}>{breakerLabel(state)}</Badge>
        {canReset ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => onResetBreaker(id)} />
              }
            >
              <RotateCcw />
              <span className="sr-only">{m.routing_breaker_reset()}</span>
            </TooltipTrigger>
            <TooltipContent>{m.routing_breaker_reset()}</TooltipContent>
          </Tooltip>
        ) : null}
      </ItemActions>
    </>
  )
}

function breakerLabel(state: BreakerStateName | undefined): string {
  if (state === "open") return m.routing_breaker_open()
  if (state === "halfOpen") return m.routing_breaker_half_open()
  return m.routing_breaker_closed()
}

function breakerBadge(state: BreakerStateName | undefined): "secondary" | "destructive" | "outline" {
  if (state === "open") return "destructive"
  if (state === "halfOpen") return "outline"
  return "secondary"
}
