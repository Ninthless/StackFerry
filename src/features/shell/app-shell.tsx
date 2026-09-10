import { type CSSProperties, type ReactNode, useState } from "react"
import { FolderInput, Plus, Store } from "lucide-react"
import { ClaudeWorkspace } from "@/features/claude/claude-workspace"
import { useClaudeProviders } from "@/features/claude/use-claude-providers"
import { cliById, defaultCliId } from "@/features/clis/registry"
import { GrokWorkspace } from "@/features/grok/grok-workspace"
import { useGrokProviders } from "@/features/grok/use-grok-providers"
import { McpWorkspace } from "@/features/mcp/mcp-workspace"
import { useMcps } from "@/features/mcp/use-mcp"
import { ProviderWorkspace } from "@/features/providers/provider-workspace"
import { useProviders } from "@/features/providers/use-providers"
import { SettingsPage } from "@/features/settings/settings-page"
import { SkillWorkspace } from "@/features/skills/skill-workspace"
import { useSkills } from "@/features/skills/use-skills"
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
  const session = useClaudeProviders()
  const cli = cliById("claude-code")

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
      <ClaudeWorkspace session={session} />
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

function GrokView() {
  const session = useGrokProviders()
  const cli = cliById("grok-build")

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
      <GrokWorkspace session={session} />
    </>
  )
}

function SkillsView() {
  const session = useSkills()

  return (
    <>
      <AppTitlebar
        title={m.nav_skills()}
        action={
          <div className="flex items-center gap-2">
            <Button className="app-region-no-drag" type="button" onClick={() => void session.openImport()}>
              <FolderInput data-icon="inline-start" />
              {m.skills_import()}
            </Button>
            <Button
              className="app-region-no-drag"
              type="button"
              variant={session.pane === "market" ? "default" : "outline"}
              onClick={() => session.setPane(session.pane === "market" ? "local" : "market")}
            >
              <Store data-icon="inline-start" />
              {m.skills_market()}
            </Button>
          </div>
        }
      />
      <Separator />
      <SkillWorkspace session={session} />
    </>
  )
}

function McpView() {
  const session = useMcps()

  return (
    <>
      <AppTitlebar
        title={m.nav_mcp()}
        action={
          <div className="flex items-center gap-2">
            <Button
              className="app-region-no-drag"
              type="button"
              variant="outline"
              disabled={session.importing}
              onClick={() => void session.importFromLive()}
            >
              <FolderInput data-icon="inline-start" />
              {session.importing ? m.mcp_importing() : m.mcp_import()}
            </Button>
            <Button className="app-region-no-drag" type="button" onClick={() => session.openCreate()}>
              <Plus data-icon="inline-start" />
              {m.action_add()}
            </Button>
          </div>
        }
      />
      <Separator />
      <McpWorkspace session={session} />
    </>
  )
}

function KeepAlivePane({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div
      className={
        active
          ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          : "hidden"
      }
      inert={!active}
    >
      {children}
    </div>
  )
}

export function AppShell() {
  const [navId, setNavId] = useState<NavId>(defaultCliId)
  const settingsSection = settingsSectionFromNav(navId)
  const macChrome = window.stackferry?.usesMacChrome === true

  return (
    <SidebarProvider
      className="h-svh overflow-hidden"
      style={
        {
          "--sidebar-width": "13rem",
          ...(macChrome ? { "--sidebar-width-icon": "4.5rem" } : {}),
        } as CSSProperties
      }
    >
      <AppSidebar activeId={navId} onSelect={setNavId} />
      <SidebarInset className="min-h-0 overflow-hidden bg-background">
        <KeepAlivePane active={navId === "codex"}>
          <CodexView />
        </KeepAlivePane>
        <KeepAlivePane active={navId === "claude-code"}>
          <ClaudeCodeView />
        </KeepAlivePane>
        <KeepAlivePane active={navId === "grok-build"}>
          <GrokView />
        </KeepAlivePane>
        <KeepAlivePane active={navId === "skills"}>
          <SkillsView />
        </KeepAlivePane>
        {navId === "mcp" ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <McpView />
          </div>
        ) : null}
        {settingsSection ? <SettingsView section={settingsSection} /> : null}
      </SidebarInset>
    </SidebarProvider>
  )
}
