import type { ReactNode } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"

type Props = {
  children: ReactNode
}

export function SettingsSection({ children }: Props) {
  return (
    <ScrollArea className="min-h-0 flex-1 overflow-hidden">
      <div className="px-6 py-6">{children}</div>
    </ScrollArea>
  )
}
