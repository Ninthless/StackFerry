import { FolderOpen, Store } from "lucide-react"
import { useMemo, type ReactNode } from "react"
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
import { ProviderListScroll } from "@/features/providers/provider-list-scroll"
import * as m from "@/paraglide/messages.js"
import { SkillEditor } from "./skill-editor"
import { SkillReposDialog } from "./skill-repos-dialog"
import { SkillRow, type SkillRowActions } from "./skill-row"
import { SkillUninstallDialog } from "./skill-uninstall-dialog"
import type { SkillsSession } from "./use-skills"

type Props = {
  session: SkillsSession
}

export function SkillWorkspace({ session }: Props) {
  const actions = useMemo<SkillRowActions>(
    () => ({
      busyId: session.busyId,
      setTarget: session.setTarget,
      update: session.update,
      adopt: session.adopt,
      install: session.install,
      openEdit: session.openEdit,
      setDeleting: session.setDeleting,
    }),
    [
      session.adopt,
      session.busyId,
      session.install,
      session.openEdit,
      session.setDeleting,
      session.setTarget,
      session.update,
    ],
  )

  const market = session.pane === "market"
  const empty = session.skills.length === 0

  let body: ReactNode
  if (empty) {
    body = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">{market ? <Store /> : <FolderOpen />}</EmptyMedia>
          <EmptyTitle>{market ? m.skills_market_empty_title() : m.skills_local_empty_title()}</EmptyTitle>
          <EmptyDescription>
            {market ? m.skills_market_empty_description() : m.skills_local_empty_description()}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {market ? (
            <Button type="button" disabled={session.refreshing} onClick={() => void session.refreshCatalog()}>
              {m.skills_refresh()}
            </Button>
          ) : (
            <Button type="button" onClick={session.openCreate}>
              {m.skills_create()}
            </Button>
          )}
        </EmptyContent>
      </Empty>
    )
  } else {
    body = (
      <ProviderListScroll>
        <ItemGroup className="gap-2 pb-2">
          {session.skills.map((skill) => (
            <SkillRow key={skill.id} skill={skill} pane={session.pane} actions={actions} />
          ))}
        </ItemGroup>
      </ProviderListScroll>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-5xl shrink-0 items-center gap-2 px-6 pt-4">
        <Input
          value={session.query}
          placeholder={market ? m.skills_market_search_placeholder() : m.skills_search_placeholder()}
          onChange={(event) => session.setQuery(event.target.value)}
        />
        {market ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={session.refreshing}
              onClick={() => void session.refreshCatalog()}
            >
              {m.skills_refresh()}
            </Button>
            <Button type="button" variant="outline" onClick={() => session.setReposOpen(true)}>
              {m.skills_repos()}
            </Button>
            {session.updateCount > 0 ? (
              <Button type="button" disabled={session.refreshing} onClick={() => void session.updateAll()}>
                {m.skills_update_all()}
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
      <main className="mx-auto flex w-full max-w-5xl min-h-0 flex-1 flex-col overflow-hidden px-6 py-4">{body}</main>
      <SkillEditor
        open={session.editorOpen}
        editing={session.editing}
        onOpenChange={(open) => {
          if (!open) session.closeEditor()
        }}
        onSubmit={session.saveSkill}
      />
      <SkillReposDialog
        open={session.reposOpen}
        repos={session.repos}
        onOpenChange={session.setReposOpen}
        onAdd={session.addRepo}
        onRemove={session.removeRepo}
      />
      <SkillUninstallDialog
        name={session.deleting?.name ?? null}
        onOpenChange={(open) => {
          if (!open) session.setDeleting(null)
        }}
        onConfirm={session.confirmDelete}
      />
    </div>
  )
}
