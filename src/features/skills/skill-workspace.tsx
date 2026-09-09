import { FolderOpen, Store } from "lucide-react"
import { useMemo, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ProviderListScroll } from "@/features/providers/provider-list-scroll"
import { cn } from "@/lib/utils"
import * as m from "@/paraglide/messages.js"
import { MARKET_REPO_ALL, MARKET_STATUSES, skillRepoSelectLabel, type MarketStatus } from "./filter"
import { SkillImportDialog } from "./skill-import-dialog"
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
      setDeleting: session.setDeleting,
    }),
    [
      session.adopt,
      session.busyId,
      session.install,
      session.setDeleting,
      session.setTarget,
      session.update,
    ],
  )

  const market = session.pane === "market"
  const repoItems = useMemo(
    () => [
      { value: MARKET_REPO_ALL, label: m.skills_filter_repo_all() },
      ...session.repos.map((repo) => ({ value: repo.id, label: skillRepoSelectLabel(repo) })),
    ],
    [session.repos],
  )

  let body: ReactNode
  if (session.sourceEmpty) {
    body = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            {market && session.refreshing ? <Spinner /> : market ? <Store /> : <FolderOpen />}
          </EmptyMedia>
          <EmptyTitle>{market ? m.skills_market_empty_title() : m.skills_local_empty_title()}</EmptyTitle>
          <EmptyDescription>
            {market ? m.skills_market_empty_description() : m.skills_local_empty_description()}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {market ? (
            <RefreshCatalogButton refreshing={session.refreshing} onRefresh={session.refreshCatalog} />
          ) : (
            <Button type="button" onClick={() => void session.openImport()}>
              {m.skills_import()}
            </Button>
          )}
        </EmptyContent>
      </Empty>
    )
  } else if (session.skills.length === 0) {
    body = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">{market ? <Store /> : <FolderOpen />}</EmptyMedia>
          <EmptyTitle>{m.skills_filter_empty_title()}</EmptyTitle>
          <EmptyDescription>{m.skills_filter_empty_description()}</EmptyDescription>
        </EmptyHeader>
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
      <div className="mx-auto flex w-full max-w-5xl shrink-0 flex-col gap-3 px-6 pt-4">
        <div className="flex items-center gap-2">
          <Input
            value={session.query}
            placeholder={market ? m.skills_market_search_placeholder() : m.skills_search_placeholder()}
            onChange={(event) => session.setQuery(event.target.value)}
          />
          {market ? (
            <>
              <RefreshCatalogButton
                variant="outline"
                refreshing={session.refreshing}
                onRefresh={session.refreshCatalog}
              />
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
        {market ? (
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              value={[session.status]}
              onValueChange={(value) => {
                const next = value[0]
                if (typeof next === "string") session.setStatus(next)
              }}
              variant="outline"
              size="sm"
            >
              {MARKET_STATUSES.map((status) => (
                <ToggleGroupItem key={status} value={status}>
                  {marketStatusLabel(status)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Select
              items={repoItems}
              value={session.repoId}
              onValueChange={(value) => {
                if (typeof value === "string") session.setRepoId(value)
              }}
            >
              <SelectTrigger size="sm" className="max-w-none *:data-[slot=select-value]:line-clamp-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                align="start"
                alignItemWithTrigger={false}
                side="bottom"
                className="w-max min-w-(--anchor-width) overflow-x-visible"
              >
                <SelectGroup>
                  {repoItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>
      <main
        aria-busy={session.refreshing || undefined}
        className="mx-auto flex w-full max-w-5xl min-h-0 flex-1 flex-col overflow-hidden px-6 py-4"
      >
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            session.refreshing && "pointer-events-none opacity-60",
          )}
        >
          {body}
        </div>
      </main>
      <SkillImportDialog
        candidates={session.importCandidates}
        onOpenChange={(open) => {
          if (!open) session.closeImport()
        }}
        onConfirm={session.confirmImport}
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

function RefreshCatalogButton({
  refreshing,
  onRefresh,
  variant,
}: {
  refreshing: boolean
  onRefresh: () => Promise<void>
  variant?: "outline"
}) {
  return (
    <Button type="button" variant={variant} disabled={refreshing} onClick={() => void onRefresh()}>
      {refreshing ? <Spinner data-icon="inline-start" /> : null}
      {refreshing ? m.skills_refreshing() : m.skills_refresh()}
    </Button>
  )
}

function marketStatusLabel(status: MarketStatus): string {
  if (status === "available") return m.skills_filter_status_available()
  if (status === "installed") return m.skills_filter_status_installed()
  if (status === "updates") return m.skills_filter_status_updates()
  return m.skills_filter_status_all()
}
