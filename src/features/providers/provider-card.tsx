import { KeyRound, Pencil, Sparkles, Trash2 } from "lucide-react"
import type { ProviderListItem } from "@shared/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

type Props = {
  provider: ProviderListItem
  busy: boolean
  onEnable: () => void
  onEdit: () => void
  onDelete: () => void
}

export function ProviderCard({ provider, busy, onEnable, onEdit, onDelete }: Props) {
  const official = provider.kind === "official"
  const description = official
    ? "ChatGPT / Codex 官方登录，不改写 auth.json"
    : [provider.model, provider.baseUrl].filter(Boolean).join(" · ") || "自定义 config.toml 覆盖片段"

  return (
    <Item variant="outline" className="flex-nowrap">
      <ItemMedia variant="icon">
        {official ? <Sparkles /> : <KeyRound />}
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="max-w-full min-w-0 truncate">{provider.name}</ItemTitle>
        <ItemDescription>{description}</ItemDescription>
      </ItemContent>
      <ItemActions className="ml-auto shrink-0">
        {provider.enabled ? (
          <Badge variant="secondary">当前启用</Badge>
        ) : (
          <Button type="button" size="sm" disabled={busy} onClick={onEnable}>
            {busy ? "写入中…" : "启用"}
          </Button>
        )}
        <Tooltip>
          <TooltipTrigger
            render={<Button type="button" variant="outline" size="icon-sm" onClick={onEdit} />}
          >
            <Pencil />
            <span className="sr-only">编辑</span>
          </TooltipTrigger>
          <TooltipContent>编辑</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={<Button type="button" variant="destructive" size="icon-sm" onClick={onDelete} />}
          >
            <Trash2 />
            <span className="sr-only">删除</span>
          </TooltipTrigger>
          <TooltipContent>删除</TooltipContent>
        </Tooltip>
      </ItemActions>
    </Item>
  )
}
