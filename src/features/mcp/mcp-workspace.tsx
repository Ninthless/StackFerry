import { useMemo, type ReactNode } from "react"
import { Plug } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { ItemGroup } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { ProviderListScroll } from "@/features/providers/provider-list-scroll"
import { cn } from "@/lib/utils"
import * as m from "@/paraglide/messages.js"
import { McpDeleteDialog } from "./mcp-delete-dialog"
import { McpEditor } from "./mcp-editor"
import { McpRow, type McpRowActions } from "./mcp-row"
import type { McpSession } from "./use-mcp"

type Props = {
  session: McpSession
}

export function McpWorkspace({ session }: Props) {
  const actions = useMemo<McpRowActions>(
    () => ({
      busyId: session.busyId,
      setTarget: session.setTarget,
      openEdit: session.openEdit,
      setDeleting: session.setDeleting,
    }),
    [session.busyId, session.openEdit, session.setDeleting, session.setTarget],
  )

  let body: ReactNode
  if (session.sourceEmpty) {
    body = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">{session.importing ? <Spinner /> : <Plug />}</EmptyMedia>
          <EmptyTitle>{m.mcp_empty_title()}</EmptyTitle>
          <EmptyDescription>{m.mcp_empty_description()}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button type="button" variant="outline" disabled={session.importing} onClick={() => void session.importFromLive()}>
            {session.importing ? <Spinner data-icon="inline-start" /> : null}
            {session.importing ? m.mcp_importing() : m.mcp_import()}
          </Button>
          <Button type="button" onClick={() => session.openCreate()}>
            {m.action_add()}
          </Button>
        </EmptyContent>
      </Empty>
    )
  } else if (session.servers.length === 0) {
    body = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Plug />
          </EmptyMedia>
          <EmptyTitle>{m.mcp_filter_empty_title()}</EmptyTitle>
          <EmptyDescription>{m.mcp_filter_empty_description()}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  } else {
    body = (
      <ProviderListScroll>
        <ItemGroup className="gap-2 pb-2">
          {session.servers.map((server) => (
            <McpRow key={server.id} server={server} actions={actions} />
          ))}
        </ItemGroup>
      </ProviderListScroll>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-5xl shrink-0 flex-col gap-3 px-6 pt-4">
        <Input
          value={session.query}
          placeholder={m.mcp_search_placeholder()}
          onChange={(event) => session.setQuery(event.target.value)}
        />
      </div>
      <main className="mx-auto flex w-full max-w-5xl min-h-0 flex-1 flex-col overflow-hidden px-6 py-4">
        <div className={cn("flex min-h-0 flex-1 flex-col", session.importing && "pointer-events-none opacity-60")}>
          {body}
        </div>
      </main>
      <McpEditor
        open={session.editorOpen}
        editing={session.editing}
        onOpenChange={(open) => {
          if (!open) session.closeEditor()
        }}
        onSubmit={session.save}
      />
      <McpDeleteDialog
        name={session.deleting?.name ?? null}
        onOpenChange={(open) => {
          if (!open) session.setDeleting(null)
        }}
        onConfirm={session.confirmDelete}
      />
    </div>
  )
}
