import { memo } from "react"
import { EllipsisVertical } from "lucide-react"
import type { SkillListItem, SkillTarget } from "@shared/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item"
import { Switch } from "@/components/ui/switch"
import * as m from "@/paraglide/messages.js"

export type SkillRowActions = {
  busyId: string | null
  setTarget: (name: string, target: SkillTarget, enabled: boolean) => Promise<void>
  update: (name: string) => Promise<void>
  adopt: (name: string) => Promise<void>
  install: (name: string) => Promise<void>
  openEdit: (skill: SkillListItem) => Promise<void>
  setDeleting: (skill: SkillListItem | null) => void
}

function originBadge(skill: SkillListItem): string | null {
  if (skill.orphan) return m.skills_orphan()
  if (skill.repoLabel) return skill.repoLabel
  if (skill.installed) return m.skills_local()
  return null
}

export const SkillRow = memo(function SkillRow({
  skill,
  pane,
  actions,
}: {
  skill: SkillListItem
  pane: "local" | "market"
  actions: SkillRowActions
}) {
  const busy = actions.busyId === skill.name
  const badge = originBadge(skill)
  const local = pane === "local"

  return (
    <Item variant="outline" className="flex-nowrap">
      <ItemContent className="min-w-0">
        <ItemTitle>
          <span>{skill.name}</span>
          {badge ? <Badge variant="outline">{badge}</Badge> : null}
        </ItemTitle>
        <ItemDescription title={skill.description}>{skill.description}</ItemDescription>
      </ItemContent>
      {local ? (
        <ItemActions>
          <TargetSwitch
            label={m.skills_claude()}
            checked={skill.appliedTo.includes("claude")}
            disabled={busy}
            onCheckedChange={(checked) => void actions.setTarget(skill.name, "claude", checked)}
          />
          <TargetSwitch
            label={m.skills_codex()}
            checked={skill.appliedTo.includes("codex")}
            disabled={busy}
            onCheckedChange={(checked) => void actions.setTarget(skill.name, "codex", checked)}
          />
        </ItemActions>
      ) : null}
      <ItemActions className="w-40 justify-end">
        {local ? (
          <>
            {skill.updateAvailable ? (
              <Button size="sm" disabled={busy} onClick={() => void actions.update(skill.name)}>
                {m.skills_update()}
              </Button>
            ) : skill.orphan ? (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void actions.adopt(skill.name)}>
                {m.skills_adopt()}
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={m.provider_more()} />
                }
              >
                <EllipsisVertical />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-36">
                {skill.installed ? (
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => void actions.openEdit(skill)}>
                      {m.skills_edit()}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                ) : null}
                {skill.installed ? <DropdownMenuSeparator /> : null}
                <DropdownMenuGroup>
                  <DropdownMenuItem variant="destructive" onClick={() => actions.setDeleting(skill)}>
                    {m.skills_uninstall()}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : skill.updateAvailable ? (
          <Button size="sm" disabled={busy} onClick={() => void actions.update(skill.name)}>
            {m.skills_update()}
          </Button>
        ) : skill.installed ? (
          <Badge variant="secondary">{m.skills_installed()}</Badge>
        ) : (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void actions.install(skill.name)}>
            {m.skills_install()}
          </Button>
        )}
      </ItemActions>
    </Item>
  )
})

function TargetSwitch({
  label,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string
  checked: boolean
  disabled: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </label>
  )
}
