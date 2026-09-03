import { Pencil, Trash2 } from "lucide-react"
import type { ProviderListItem } from "@shared/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

type Props = {
  provider: ProviderListItem
  busy: boolean
  onEnable: () => void
  onEdit: () => void
  onDelete: () => void
}

export function ProviderCard({ provider, busy, onEnable, onEdit, onDelete }: Props) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{provider.name}</CardTitle>
        <CardDescription>
          {provider.kind === "official"
            ? "ChatGPT / Codex 官方登录，不改写 auth.json"
            : `${provider.model} · ${provider.baseUrl}`}
        </CardDescription>
        {provider.enabled ? (
          <CardAction>
            <Badge variant="secondary">当前启用</Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardFooter className="justify-end gap-2">
        <Button type="button" disabled={provider.enabled || busy} onClick={onEnable}>
          {provider.enabled ? "已启用" : busy ? "写入中…" : "启用"}
        </Button>
        <Tooltip>
          <TooltipTrigger
            render={<Button type="button" variant="outline" size="icon" onClick={onEdit} />}
          >
            <Pencil />
            <span className="sr-only">编辑</span>
          </TooltipTrigger>
          <TooltipContent>编辑</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={<Button type="button" variant="destructive" size="icon" onClick={onDelete} />}
          >
            <Trash2 />
            <span className="sr-only">删除</span>
          </TooltipTrigger>
          <TooltipContent>删除</TooltipContent>
        </Tooltip>
      </CardFooter>
    </Card>
  )
}
