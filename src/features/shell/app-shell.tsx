import { type CSSProperties, useState } from "react"
import { Plus } from "lucide-react"
import { ClaudeCodePlaceholder } from "@/features/clis/claude-code-placeholder"
import { cliById, defaultCliId } from "@/features/clis/registry"
import { ProviderWorkspace } from "@/features/providers/provider-workspace"
import { useProviders } from "@/features/providers/use-providers"
import { SettingsPage } from "@/features/settings/settings-page"
import {
  defaultSettingsSectionId,
  isSettingsSectionId,
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from "@/features/settings/sections"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import * as m from "@/paraglide/messages.js"
import { AppSidebar, type NavId } from "./app-sidebar"
import { AppTitlebar } from "./app-titlebar"

function settingsSectionFromNav(id: NavId): SettingsSectionId | null {
  if (!id.startsWith("settings:")) return null
  const section = id.slice("settings:".length)
  return isSettingsSectionId(section) ? section : defaultSettingsSectionId
}

function SettingsView({ section }: { section: SettingsSectionId }) {
  const current = SETTINGS_SECTIONS.find((item) => item.id === section)

  return (
    <>
      <AppTitlebar title={current?.label() ?? m.settings_title()} />
      <Separator />
      <SettingsPage section={section} />
    </>
  )
}

function ClaudeCodeView() {
  const cli = cliById("claude-code")

  return (
    <>
      <AppTitlebar title={cli.name} />
      <Separator />
      <ClaudeCodePlaceholder />
    </>
  )
}

function CodexView() {
  const session = useProviders()
  const cli = cliById("codex")

  return (
    <>
      <AppTitlebar
        title={cli.name}
        action={
          <Button className="app-region-no-drag" type="button" onClick={session.openCreate}>
            <Plus data-icon="inline-start" />
            {m.action_add()}
          </Button>
        }
      />
      <Separator />
      <ProviderWorkspace session={session} />
    </>
  )
}

export function AppShell() {
  const [navId, setNavId] = useState<NavId>(defaultCliId)
  const settingsSection = settingsSectionFromNav(navId)

  return (
    <SidebarProvider
      className="h-svh overflow-hidden"
      style={{ "--sidebar-width": "13rem" } as CSSProperties}
    >
      <AppSidebar activeId={navId} onSelect={setNavId} />
      <SidebarInset className="min-h-0 overflow-hidden">
        {navId === "codex" ? <CodexView /> : null}
        {navId === "claude-code" ? <ClaudeCodeView /> : null}
        {settingsSection ? <SettingsView section={settingsSection} /> : null}
      </SidebarInset>
    </SidebarProvider>
  )
}
