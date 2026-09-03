import { type CSSProperties, useState } from "react"
import { Plus } from "lucide-react"
import { cliById, defaultCliId, type CliId } from "@/features/clis/registry"
import { ProviderWorkspace } from "@/features/providers/provider-workspace"
import { useProviders } from "@/features/providers/use-providers"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "./app-sidebar"
import { AppTitlebar } from "./app-titlebar"

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
  const [cliId, setCliId] = useState<CliId>(defaultCliId)

  return (
    <SidebarProvider
      className="h-svh overflow-hidden"
      style={{ "--sidebar-width": "13rem" } as CSSProperties}
    >
      <AppSidebar activeId={cliId} onSelect={setCliId} />
      <SidebarInset className="min-h-0 overflow-hidden">
        {cliId === "codex" ? <CodexView /> : null}
      </SidebarInset>
    </SidebarProvider>
  )
}
