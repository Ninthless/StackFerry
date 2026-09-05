import { useRef } from "react"
import { ArrowLeftIcon, SettingsIcon } from "lucide-react"
import { BrandMark } from "@/components/brand-mark"
import { clis, defaultCliId, type CliId } from "@/features/clis/registry"
import {
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from "@/features/settings/sections"
import * as m from "@/paraglide/messages.js"
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

export type NavId = CliId | `settings:${SettingsSectionId}`

type Props = {
  activeId: NavId
  onSelect: (id: NavId) => void
}

function isSettingsNav(id: NavId): id is `settings:${SettingsSectionId}` {
  return id.startsWith("settings:")
}

export function AppSidebar({ activeId, onSelect }: Props) {
  const burst = useRef({ count: 0, lastAt: 0 })
  const settingsMode = isSettingsNav(activeId)
  const settingsSection = settingsMode ? activeId.slice("settings:".length) : null

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
            {settingsMode ? (
              <SidebarMenuButton
                size="lg"
                type="button"
                tooltip={m.settings_back()}
                onClick={() => onSelect(defaultCliId)}
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg">
                  <ArrowLeftIcon />
                </div>
                <span>{m.settings_title()}</span>
              </SidebarMenuButton>
            ) : (
              <SidebarMenuButton size="lg" type="button" onClick={handleBrandClick}>
                <BrandMark />
                <span>StackFerry</span>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {settingsMode ? (
          <SidebarGroup>
            <SidebarGroupLabel>{m.settings_title()}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {SETTINGS_SECTIONS.map((section) => (
                  <SidebarMenuItem key={section.id}>
                    <SidebarMenuButton
                      isActive={section.id === settingsSection}
                      tooltip={section.label()}
                      onClick={() => onSelect(`settings:${section.id}`)}
                    >
                      <section.icon />
                      <span>{section.label()}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <SidebarGroup>
            <SidebarGroupLabel>{m.nav_cli()}</SidebarGroupLabel>
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
        )}
      </SidebarContent>
      {settingsMode ? null : (
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={m.nav_settings()}
                onClick={() => onSelect("settings:appearance")}
              >
                <SettingsIcon />
                <span>{m.nav_settings()}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}
      <SidebarRail />
    </Sidebar>
  )
}
