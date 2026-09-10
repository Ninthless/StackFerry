import { Empty } from "antd"
import { useMemo, type ReactNode } from "react"
import type { TableColumnsType } from "antd"
import type { GrokProviderListItem } from "@shared/types"
import { Button } from "@/components/ui/button"
import { DeleteProviderDialog } from "@/features/providers/delete-provider-dialog"
import { ProviderListScroll } from "@/features/providers/provider-list-scroll"
import { ProviderRoutingActions } from "@/features/providers/provider-routing-actions"
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
        render: (_value, provider) => (
          <ProviderRoutingActions
            official={provider.kind === "official"}
            enabled={provider.enabled}
            providerId={provider.id}
            queue={session.routing.queue}
            busy={session.busyId === provider.id}
            onSetQueued={(id, queued) => void session.setProviderQueued(id, queued)}
            onEnable={(id) => void session.enableProvider(id)}
            onEdit={() => session.openEdit(provider)}
            onDelete={() => session.setDeleting(provider)}
          />
        ),
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
