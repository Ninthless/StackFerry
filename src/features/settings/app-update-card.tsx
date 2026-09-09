import { useCallback, useEffect, useState } from "react"
import { Progress } from "antd"
import { Download } from "lucide-react"
import type { AppUpdateStatus } from "@shared/types"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { formatAppError } from "@/lib/format-app-error"
import * as m from "@/paraglide/messages.js"
import { HintTitle } from "./settings-hint"

export function AppUpdateCard() {
  const [status, setStatus] = useState<AppUpdateStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [confirmInstall, setConfirmInstall] = useState(false)

  const check = useCallback(async (manual: boolean) => {
    const api = window.stackferry
    if (!api) return
    setChecking(true)
    const toastId = "app-update-check"
    if (manual) {
      toast.add({ id: toastId, type: "loading", description: m.toast_app_update_checking(), timeout: 0 })
    }
    try {
      const next = await api.checkAppUpdate()
      setStatus(next)
      if (manual) {
        toast.add({
          id: toastId,
          type: "success",
          description: checkToast(next),
        })
      }
    } catch (error) {
      if (manual) {
        toast.close(toastId)
        toast.add({ type: "error", description: formatAppError(error), priority: "high" })
      }
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    const api = window.stackferry
    if (!api) return
    const unsub = api.onAppUpdateChanged(setStatus)
    void (async () => {
      const current = await api.getAppUpdate()
      setStatus(current)
      if (current.phase === "idle") await check(false)
    })()
    return unsub
  }, [check])

  async function download(): Promise<void> {
    const api = window.stackferry
    if (!api) return
    setDownloading(true)
    try {
      setStatus(await api.downloadAppUpdate())
      toast.add({ type: "success", description: m.toast_app_update_downloaded() })
    } catch (error) {
      toast.add({ type: "error", description: formatAppError(error), priority: "high" })
    } finally {
      setDownloading(false)
    }
  }

  async function install(): Promise<void> {
    const api = window.stackferry
    if (!api) return
    setConfirmInstall(false)
    try {
      setStatus(await api.installAppUpdate())
    } catch (error) {
      toast.add({ type: "error", description: formatAppError(error), priority: "high" })
    }
  }

  const busy = checking || downloading || status?.phase === "downloading"
  const percent =
    status && status.totalBytes > 0
      ? Math.min(100, Math.round((status.downloadedBytes / status.totalBytes) * 100))
      : 0

  return (
    <Card>
      <CardHeader>
        <HintTitle hint={m.app_update_description()}>
          <CardTitle>{m.app_update_legend()}</CardTitle>
        </HintTitle>
        <CardAction>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!status || busy}
            onClick={() => void check(true)}
          >
            {checking ? <Spinner data-icon="inline-start" /> : null}
            {checking ? m.app_update_checking() : m.app_update_check()}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {!status ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="app-update-version">{m.version_label()}</FieldLabel>
              <Input id="app-update-version" value={status.currentVersion} readOnly />
            </Field>
            <UpdateStatusBody
              status={status}
              percent={percent}
              busy={busy}
              downloading={downloading}
              onDownload={() => void download()}
              onInstall={() => setConfirmInstall(true)}
            />
          </FieldGroup>
        )}
      </CardContent>
      <AlertDialog open={confirmInstall} onOpenChange={setConfirmInstall}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Download />
            </AlertDialogMedia>
            <AlertDialogTitle>{m.app_update_install_title()}</AlertDialogTitle>
            <AlertDialogDescription>
              {m.app_update_install_description({ version: status?.availableVersion ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.action_cancel()}</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={() => void install()}>
              {m.app_update_install()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function checkToast(status: AppUpdateStatus): string {
  if (status.phase === "available" && status.availableVersion) {
    return m.toast_app_update_available({ version: status.availableVersion })
  }
  if (status.phase === "unpackaged") return m.app_update_unpackaged()
  if (status.phase === "unsupported") return m.app_update_unsupported()
  return m.toast_app_update_none()
}

function UpdateStatusBody({
  status,
  percent,
  busy,
  downloading,
  onDownload,
  onInstall,
}: {
  status: AppUpdateStatus
  percent: number
  busy: boolean
  downloading: boolean
  onDownload: () => void
  onInstall: () => void
}) {
  if (status.phase === "unpackaged") {
    return <Alert><AlertDescription>{m.app_update_unpackaged()}</AlertDescription></Alert>
  }
  if (status.phase === "unsupported") {
    return <Alert><AlertDescription>{m.app_update_unsupported()}</AlertDescription></Alert>
  }
  if (status.phase === "upToDate") {
    return <Alert><AlertDescription>{m.app_update_up_to_date()}</AlertDescription></Alert>
  }
  if (status.phase === "downloading") {
    return (
      <div className="flex flex-col gap-2">
        <Progress percent={percent} />
        <p className="text-muted-foreground text-sm">{m.app_update_downloading()}</p>
      </div>
    )
  }
  if (status.phase === "available" || status.phase === "ready") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{status.availableVersion}</Badge>
          <span className="text-sm">{m.app_update_available()}</span>
        </div>
        {status.releaseNotes ? (
          <pre className="bg-muted text-muted-foreground max-h-40 overflow-auto rounded-lg p-3 whitespace-pre-wrap">
            {status.releaseNotes}
          </pre>
        ) : null}
        {status.phase === "ready" ? (
          <Alert><AlertDescription>{m.app_update_ready()}</AlertDescription></Alert>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {status.phase === "available" ? (
            <Button type="button" size="sm" disabled={busy} onClick={onDownload}>
              {downloading ? <Spinner data-icon="inline-start" /> : null}
              {downloading ? m.app_update_downloading() : m.app_update_download()}
            </Button>
          ) : (
            <Button type="button" size="sm" disabled={busy} onClick={onInstall}>
              {m.app_update_install()}
            </Button>
          )}
        </div>
      </div>
    )
  }
  return null
}
