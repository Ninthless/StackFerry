import { useCallback, useEffect, useRef, useState } from "react"
import { Trash2 } from "lucide-react"
import type { CliToolId, CliToolStatus } from "@shared/types"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { cliById } from "@/features/clis/registry"
import { formatAppError } from "@/lib/format-app-error"
import * as m from "@/paraglide/messages.js"
import { HintTitle } from "./settings-hint"

type BusyAction = "install" | "update" | "uninstall"

export function CliSettings() {
  const [tools, setTools] = useState<CliToolStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [busyId, setBusyId] = useState<CliToolId | null>(null)
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null)
  const [uninstalling, setUninstalling] = useState<CliToolStatus | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    const api = window.stackferry
    if (!api) {
      setError(m.error_desktop_only())
      return
    }
    try {
      setTools(await api.listCliTools())
      setError("")
    } catch (loadError) {
      setError(formatAppError(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function run(id: CliToolId, action: BusyAction, work: () => Promise<CliToolStatus[]>): Promise<void> {
    const name = cliById(id).name
    setBusyId(id)
    setBusyAction(action)
    const toastId = `cli-${action}-${id}`
    toast.add({
      id: toastId,
      type: "loading",
      description: loadingMessage(action, name),
      timeout: 0,
    })
    try {
      setTools(await work())
      toast.add({ id: toastId, type: "success", description: successMessage(action, name) })
    } catch (actionError) {
      toast.close(toastId)
      toast.add({ type: "error", description: formatAppError(actionError), priority: "high" })
    } finally {
      setBusyId(null)
      setBusyAction(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <HintTitle hint={m.cli_description()}>
            <CardTitle>{m.cli_legend()}</CardTitle>
          </HintTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>{m.status_read_failed()}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {loading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <ItemGroup>
              {tools.map((tool) => (
                <CliToolRow
                  key={tool.id}
                  tool={tool}
                  busy={busyId === tool.id}
                  busyAction={busyId === tool.id ? busyAction : null}
                  onInstall={() => {
                    const api = window.stackferry
                    if (!api) return
                    void run(tool.id, "install", () => api.installCliTool(tool.id))
                  }}
                  onUpdate={() => {
                    const api = window.stackferry
                    if (!api) return
                    void run(tool.id, "update", () => api.updateCliTool(tool.id))
                  }}
                  onUninstall={() => setUninstalling(tool)}
                />
              ))}
            </ItemGroup>
          )}
        </CardContent>
      </Card>
      <CliUninstallDialog
        tool={uninstalling}
        onOpenChange={(open) => {
          if (!open) setUninstalling(null)
        }}
        onConfirm={async () => {
          const tool = uninstalling
          const api = window.stackferry
          if (!tool || !api) return
          setUninstalling(null)
          await run(tool.id, "uninstall", () => api.uninstallCliTool(tool.id))
        }}
      />
    </div>
  )
}

function CliToolRow({
  tool,
  busy,
  busyAction,
  onInstall,
  onUpdate,
  onUninstall,
}: {
  tool: CliToolStatus
  busy: boolean
  busyAction: BusyAction | null
  onInstall: () => void
  onUpdate: () => void
  onUninstall: () => void
}) {
  const cli = cliById(tool.id)
  const Icon = cli.icon
  const managed = tool.method !== null && tool.method !== "unknown"

  return (
    <Item variant="outline" className="flex-nowrap">
      <ItemMedia variant="icon">
        <Icon />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>
          <span>{cli.name}</span>
          {tool.installed && tool.version ? <Badge variant="secondary">{tool.version}</Badge> : null}
          {tool.method ? <Badge variant="outline">{methodLabel(tool.method)}</Badge> : null}
        </ItemTitle>
        <ItemDescription title={tool.path ?? undefined}>{rowDescription(tool)}</ItemDescription>
      </ItemContent>
      <ItemActions>
        {tool.installed ? (
          managed ? (
            <>
              {tool.updateAvailable ? (
                <BusyButton
                  busy={busy && busyAction === "update"}
                  disabled={busy}
                  label={m.cli_update()}
                  busyLabel={m.cli_updating()}
                  onClick={onUpdate}
                />
              ) : null}
              <BusyButton
                busy={busy && busyAction === "uninstall"}
                disabled={busy}
                variant="destructive"
                label={m.cli_uninstall()}
                busyLabel={m.cli_uninstalling()}
                onClick={onUninstall}
              />
            </>
          ) : null
        ) : (
          <BusyButton
            busy={busy && busyAction === "install"}
            disabled={busy}
            label={m.cli_install()}
            busyLabel={m.cli_installing()}
            onClick={onInstall}
          />
        )}
      </ItemActions>
    </Item>
  )
}

function BusyButton({
  busy,
  disabled,
  variant,
  label,
  busyLabel,
  onClick,
}: {
  busy: boolean
  disabled: boolean
  variant?: "destructive"
  label: string
  busyLabel: string
  onClick: () => void
}) {
  return (
    <Button type="button" size="sm" variant={variant} disabled={disabled} onClick={onClick}>
      {busy ? <Spinner data-icon="inline-start" /> : null}
      {busy ? busyLabel : label}
    </Button>
  )
}

function CliUninstallDialog({
  tool,
  onOpenChange,
  onConfirm,
}: {
  tool: CliToolStatus | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
}) {
  const displayedRef = useRef(tool)
  if (tool) displayedRef.current = tool
  const name = displayedRef.current ? cliById(displayedRef.current.id).name : ""

  return (
    <AlertDialog open={Boolean(tool)} onOpenChange={(open) => !open && onOpenChange(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Trash2 />
          </AlertDialogMedia>
          <AlertDialogTitle>{m.cli_uninstall_title()}</AlertDialogTitle>
          <AlertDialogDescription>{m.cli_uninstall_description({ name })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{m.action_cancel()}</AlertDialogCancel>
          <AlertDialogAction type="button" variant="destructive" onClick={() => void onConfirm()}>
            {m.cli_uninstall()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function rowDescription(tool: CliToolStatus): string {
  if (!tool.installed) return m.cli_not_installed()
  if (tool.method === "unknown") return m.cli_unknown_description()
  return tool.path ?? ""
}

function methodLabel(method: NonNullable<CliToolStatus["method"]>): string {
  if (method === "native") return m.cli_method_native()
  if (method === "npm") return m.cli_method_npm()
  if (method === "homebrew") return m.cli_method_homebrew()
  if (method === "winget") return m.cli_method_winget()
  return m.cli_method_unknown()
}

function loadingMessage(action: BusyAction, name: string): string {
  if (action === "install") return m.toast_cli_installing({ name })
  if (action === "update") return m.toast_cli_updating({ name })
  return m.toast_cli_uninstalling({ name })
}

function successMessage(action: BusyAction, name: string): string {
  if (action === "install") return m.toast_cli_installed({ name })
  if (action === "update") return m.toast_cli_updated({ name })
  return m.toast_cli_uninstalled({ name })
}
