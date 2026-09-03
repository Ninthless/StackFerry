import type { ReactNode } from "react"
import { SidebarTrigger } from "@/components/ui/sidebar"

type Props = {
  title: string
  action?: ReactNode
}

export function AppTitlebar({ title, action }: Props) {
  return (
    <header
      className="app-region-drag bg-background flex w-full shrink-0 items-center select-none"
      style={{
        height: "env(titlebar-area-height, 2.5rem)",
        marginTop: "env(titlebar-area-y, 0px)",
        paddingRight:
          "calc(100vw - env(titlebar-area-width, 100vw) - env(titlebar-area-x, 0px))",
      }}
    >
      <div className="flex h-full w-full items-center gap-2 px-2">
        <SidebarTrigger className="app-region-no-drag" />
        <h1 className="font-heading truncate text-sm font-medium">{title}</h1>
        {action ? <div className="app-region-no-drag ml-auto">{action}</div> : null}
      </div>
    </header>
  )
}
