import { useEffect, useState } from "react"
import { Download } from "lucide-react"
import type { AppUpdateStatus } from "@shared/types"
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
import { toast } from "@/components/ui/toast"
import { formatAppError } from "@/lib/format-app-error"
import * as m from "@/paraglide/messages.js"
import { ReleaseNotes } from "./release-notes"

export function AppUpdatePopup() {
  const [status, setStatus] = useState<AppUpdateStatus | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const api = window.stackferry
    if (!api) return
    const unsub = api.onAppUpdateChanged((next) => {
      setStatus(next)
      if (next.phase === "available") setOpen(true)
    })
    void (async () => {
      try {
        const current = await api.getAppUpdate()
        setStatus(current)
        if (current.phase === "available") {
          setOpen(true)
          return
        }
        if (current.phase !== "idle") return
        const next = await api.checkAppUpdate()
        setStatus(next)
        if (next.phase === "available") setOpen(true)
      } catch {
        // 启动检查失败时不弹窗；关于页仍可手动检查。
      }
    })()
    return unsub
  }, [])

  async function download(): Promise<void> {
    const api = window.stackferry
    if (!api) {
      setOpen(false)
      return
    }
    setBusy(true)
    try {
      setStatus(await api.downloadAppUpdate())
      setOpen(false)
      toast.add({ type: "success", description: m.toast_app_update_downloaded() })
    } catch (error) {
      toast.add({ type: "error", description: formatAppError(error), priority: "high" })
    } finally {
      setBusy(false)
    }
  }

  const version = status?.availableVersion ?? ""

  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Download />
          </AlertDialogMedia>
          <AlertDialogTitle>{m.app_update_popup_title()}</AlertDialogTitle>
          <AlertDialogDescription>{m.app_update_popup_description({ version })}</AlertDialogDescription>
        </AlertDialogHeader>
        {status?.releaseNotes ? <ReleaseNotes notes={status.releaseNotes} /> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{m.announcements_popup_later()}</AlertDialogCancel>
          <AlertDialogAction type="button" disabled={busy} onClick={() => void download()}>
            {busy ? m.app_update_downloading() : m.app_update_download()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
