import type { ReactNode } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

export function ProviderListScroll({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        "group/list relative min-h-0 flex-1 bg-background",
        "[&_[data-slot=scroll-area-scrollbar]]:w-1 [&_[data-slot=scroll-area-scrollbar]]:border-l-0",
        "[&_[data-slot=scroll-area-thumb]]:bg-foreground/25",
      )}
    >
      <ScrollArea
        className="size-full overflow-hidden"
        viewportClassName="[scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </ScrollArea>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-3 bg-linear-to-b from-background to-transparent opacity-0 group-has-[[data-overflow-y-start]]/list:opacity-100" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-3 bg-linear-to-t from-background to-transparent opacity-0 group-has-[[data-overflow-y-end]]/list:opacity-100" />
    </div>
  )
}
