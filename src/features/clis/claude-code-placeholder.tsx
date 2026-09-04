import { Bot } from "lucide-react"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

export function ClaudeCodePlaceholder() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-5xl min-h-0 flex-1 flex-col overflow-hidden px-6 py-6">
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Bot />
            </EmptyMedia>
            <EmptyTitle>Claude Code 即将接入</EmptyTitle>
            <EmptyDescription>
              这里会管理 Claude Code 的供应商配置。当前只做占位，不会读写任何配置文件。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    </div>
  )
}
