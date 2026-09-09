import { useRef } from "react"
import { ArrowLeftIcon, CircleHelp, SettingsIcon, SparklesIcon } from "lucide-react"
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
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { registerBurstClick } from "./burst-click"

const DEVTOOLS_CLICKS = 7
const DEVTOOLS_CLICK_WINDOW_MS = 1000

export type NavId = CliId | "skills" | `settings:${SettingsSectionId}`

type Props = {
  activeId: NavId
  onSelect: (id: NavId) => void
}

function isSettingsNav(id: NavId): id is `settings:${SettingsSectionId}` {
  return id.startsWith("settings:")
}

function ClaudeDesktopHint() {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<SidebarMenuAction type="button" aria-label={m.field_hint()} />}
      >
        <CircleHelp />
      </TooltipTrigger>
      <TooltipContent side="right">{m.claude_hint_description()}</TooltipContent>
    </Tooltip>
  )
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
      {window.stackferry?.usesMacChrome ? (
        <div
          className="app-region-drag h-10 w-full shrink-0"
          onDoubleClick={() => {
            void window.stackferry?.windowTitleBarDoubleClick()
          }}
        />
      ) : null}
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
          <>
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
                      {cli.id === "claude-code" ? <ClaudeDesktopHint /> : null}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>{m.nav_skills()}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeId === "skills"}
                      tooltip={m.nav_skills()}
                      onClick={() => onSelect("skills")}
                    >
                      <SparklesIcon />
                      <span>{m.nav_skills()}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup className="mt-auto">
              <SidebarGroupContent>
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
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
