import { useRef } from "react"
import { Settings } from "lucide-react"
import { BrandMark } from "@/components/brand-mark"
import { clis, type CliId } from "@/features/clis/registry"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { registerBurstClick } from "./burst-click"

const DEVTOOLS_CLICKS = 7
const DEVTOOLS_CLICK_WINDOW_MS = 1000

export type NavId = CliId | "settings"

type Props = {
  activeId: NavId
  onSelect: (id: NavId) => void
}

export function AppSidebar({ activeId, onSelect }: Props) {
  const burst = useRef({ count: 0, lastAt: 0 })

  function handleBrandClick(): void {
    const next = registerBurstClick(burst.current, Date.now(), {
      target: DEVTOOLS_CLICKS,
      windowMs: DEVTOOLS_CLICK_WINDOW_MS,
    })
    burst.current = { count: next.count, lastAt: next.lastAt }
    if (next.fired) {
      void window.stackferry?.openDevTools()
    }
  }

  return (
    <Sidebar className="app-region-no-drag" collapsible="icon" variant="sidebar">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" type="button" onClick={handleBrandClick}>
              <BrandMark />
              <span>StackFerry</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>CLI</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {clis.map((cli) => (
                <SidebarMenuItem key={cli.id}>
                  <SidebarMenuButton
                    isActive={cli.id === activeId}
                    tooltip={cli.name}
                    onClick={() => onSelect(cli.id)}
                  >
                    <cli.icon />
                    <span>{cli.name}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={activeId === "settings"}
              tooltip="设置"
              onClick={() => onSelect("settings")}
            >
              <Settings />
              <span>设置</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
