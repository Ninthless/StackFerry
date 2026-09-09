import { EllipsisVertical } from "lucide-react"
import { Empty } from "antd"
import { useMemo, type ReactNode } from "react"
import type { TableColumnsType } from "antd"
import type { GrokProviderListItem } from "@shared/types"
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
import { DeleteProviderDialog } from "@/features/providers/delete-provider-dialog"
import { ProviderListScroll } from "@/features/providers/provider-list-scroll"
import { SortableAntdTable } from "@/features/providers/sortable-antd-table"
import * as m from "@/paraglide/messages.js"
import { GrokProviderEditor } from "./grok-editor"
import type { GrokProvidersSession } from "./use-grok-providers"

type Props = {
  session: GrokProvidersSession
}

function providerDescription(provider: GrokProviderListItem): string {
  if (provider.kind === "official") return m.grok_official_description()
  return [provider.model, provider.baseUrl].filter(Boolean).join(" · ") || m.grok_custom_fallback()
}

export function GrokWorkspace({ session }: Props) {
  const columns = useMemo<TableColumnsType<GrokProviderListItem>>(
    () => [
      {
        title: m.field_name(),
        dataIndex: "name",
        render: (_value, provider) => (
          <>
            <div>{provider.name}</div>
            <div className="text-sm text-muted-foreground">{providerDescription(provider)}</div>
          </>
        ),
      },
      {
        key: "actions",
        align: "right",
        width: 220,
        render: (_value, provider) => {
          const official = provider.kind === "official"
          const queueIndex = session.routing.queue.indexOf(provider.id)
          const queued = queueIndex >= 0
          const busy = session.busyId === provider.id
          return (
            <div className="flex items-center justify-end gap-2">
              {official || provider.enabled ? null : queued ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Badge
                        variant="secondary"
                        className="cursor-pointer"
                        onClick={() => void session.setProviderQueued(provider.id, false)}
                      />
                    }
                  >
                    {m.routing_queue_position({ position: queueIndex + 1 })}
                  </TooltipTrigger>
                  <TooltipContent>
                    {m.routing_queue_leave_hint({ position: queueIndex + 1 })}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Badge
                        variant="outline"
                        className="cursor-pointer"
                        onClick={() => void session.setProviderQueued(provider.id, true)}
                      />
                    }
                  >
                    {m.routing_queue_join()}
                  </TooltipTrigger>
                  <TooltipContent>{m.routing_queue_join_hint()}</TooltipContent>
                </Tooltip>
              )}
              {provider.enabled ? (
                <Badge variant="secondary">
                  {session.routing.queue.length > 0 && !official
                    ? m.routing_badge_current()
                    : m.provider_enabled_badge()}
                </Badge>
              ) : (
                <Button size="sm" disabled={busy} onClick={() => void session.enableProvider(provider.id)}>
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
                  {official || provider.enabled ? null : (
                    <DropdownMenuItem
                      disabled={busy}
                      onClick={() => void session.setProviderQueued(provider.id, !queued)}
                    >
                      {queued ? m.routing_queue_leave() : m.routing_queue_join()}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => session.openEdit(provider)}>
                    {m.provider_edit()}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => session.setDeleting(provider)}>
                    {m.provider_delete()}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
      },
    ],
    [session],
  )

  let body: ReactNode
  if (session.providers.length === 0) {
    body = (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={m.grok_empty_description()}>
        <Button onClick={session.openCreate}>{m.action_add()}</Button>
      </Empty>
    )
  } else {
    body = (
      <ProviderListScroll>
        <SortableAntdTable
          dataSource={session.providers}
          columns={columns}
          onReorder={session.reorderProviders}
        />
      </ProviderListScroll>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-5xl min-h-0 flex-1 flex-col overflow-hidden px-6 py-6">
        {body}
      </main>
      <GrokProviderEditor
        open={session.editorOpen}
        presets={session.presets}
        editing={session.editing}
        onOpenChange={(open) => {
          if (!open) session.closeEditor()
        }}
        onSubmit={session.saveProvider}
      />
      <DeleteProviderDialog
        provider={session.deleting}
        onOpenChange={(open) => {
          if (!open) session.setDeleting(null)
        }}
        onConfirm={session.confirmDelete}
      />
    </div>
  )
}
