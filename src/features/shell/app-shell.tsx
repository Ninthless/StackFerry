import { type CSSProperties, useState } from "react"
import { Plus } from "lucide-react"
import { ClaudeCodePlaceholder } from "@/features/clis/claude-code-placeholder"
import { cliById, defaultCliId } from "@/features/clis/registry"
import { ProviderWorkspace } from "@/features/providers/provider-workspace"
import { useProviders } from "@/features/providers/use-providers"
import { SettingsPage } from "@/features/settings/settings-page"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar, type NavId } from "./app-sidebar"
import { AppTitlebar } from "./app-titlebar"

function SettingsView() {
  return (
    <>
      <AppTitlebar title="设置" />
      <Separator />
      <SettingsPage />
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
            添加
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

  return (
    <SidebarProvider
      className="h-svh overflow-hidden"
      style={{ "--sidebar-width": "13rem" } as CSSProperties}
    >
      <AppSidebar activeId={navId} onSelect={setNavId} />
      <SidebarInset className="min-h-0 overflow-hidden">
        {navId === "codex" ? <CodexView /> : null}
        {navId === "claude-code" ? <ClaudeCodeView /> : null}
        {navId === "settings" ? <SettingsView /> : null}
      </SidebarInset>
    </SidebarProvider>
  )
}
