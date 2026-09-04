import type { ReactNode } from "react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { WindowControls } from "./window-controls"

type Props = {
  title: string
  action?: ReactNode
}

export function AppTitlebar({ title, action }: Props) {
  return (
    <header
      className="app-region-drag bg-background flex h-10 w-full shrink-0 items-center select-none"
      onDoubleClick={() => {
        void window.stackferry?.windowToggleMaximize()
      }}
    >
      <div className="flex h-full min-w-0 flex-1 items-center gap-2 px-2">
        <SidebarTrigger
          className="app-region-no-drag"
          onDoubleClick={(event) => event.stopPropagation()}
        />
        <h1 className="font-heading truncate text-sm font-medium">{title}</h1>
        {action ? (
          <div
            className="app-region-no-drag ml-auto"
            onDoubleClick={(event) => event.stopPropagation()}
          >
            {action}
          </div>
        ) : null}
      </div>
      <WindowControls />
    </header>
  )
}
