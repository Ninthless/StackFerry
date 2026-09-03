import { BrandMark } from "@/components/brand-mark"
import { clis, type CliId } from "@/features/clis/registry"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

type Props = {
  activeId: CliId
  onSelect: (id: CliId) => void
}

export function AppSidebar({ activeId, onSelect }: Props) {
  return (
    <Sidebar className="app-region-no-drag" collapsible="icon" variant="sidebar">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg">
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
      <SidebarRail />
    </Sidebar>
  )
}
