import { Bot } from "lucide-react"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import * as m from "@/paraglide/messages.js"

export function ClaudeCodePlaceholder() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-5xl min-h-0 flex-1 flex-col overflow-hidden px-6 py-6">
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Bot />
            </EmptyMedia>
            <EmptyTitle>{m.claude_placeholder_title()}</EmptyTitle>
            <EmptyDescription>{m.claude_placeholder_description()}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    </div>
  )
}
