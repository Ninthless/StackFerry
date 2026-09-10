import { memo } from "react"
import type { McpListItem, McpTarget } from "@shared/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
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
import { EllipsisVertical } from "lucide-react"
import * as m from "@/paraglide/messages.js"

export type McpRowActions = {
  busyId: string | null
  setTarget: (id: string, target: McpTarget, enabled: boolean) => Promise<void>
  openEdit: (server: McpListItem) => void
  setDeleting: (server: McpListItem | null) => void
}

export const McpRow = memo(function McpRow({
  server,
  actions,
}: {
  server: McpListItem
  actions: McpRowActions
}) {
  const busy = actions.busyId === server.id
  const detail = server.transport === "stdio" ? server.command : server.url

  return (
    <Item variant="outline" className="flex-nowrap">
      <ItemContent className="min-w-0">
        <ItemTitle>
          <span>{server.name}</span>
          <Badge variant="outline">
            {server.transport === "stdio" ? m.mcp_transport_stdio() : m.mcp_transport_http()}
          </Badge>
        </ItemTitle>
        <ItemDescription title={detail}>{detail || server.id}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <TargetSwitch
          label={m.skills_claude()}
          checked={server.appliedTo.includes("claude")}
          disabled={busy}
          onCheckedChange={(checked) => void actions.setTarget(server.id, "claude", checked)}
        />
        <TargetSwitch
          label={m.skills_codex()}
          checked={server.appliedTo.includes("codex")}
          disabled={busy}
          onCheckedChange={(checked) => void actions.setTarget(server.id, "codex", checked)}
        />
        <TargetSwitch
          label={m.skills_grok()}
          checked={server.appliedTo.includes("grok")}
          disabled={busy}
          onCheckedChange={(checked) => void actions.setTarget(server.id, "grok", checked)}
        />
      </ItemActions>
      <ItemActions className="w-10 justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" variant="ghost" size="icon-sm" aria-label={m.provider_more()} />}
          >
            <EllipsisVertical />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-36">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => actions.openEdit(server)}>{m.mcp_edit()}</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => actions.setDeleting(server)}>
                {m.action_delete()}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
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
