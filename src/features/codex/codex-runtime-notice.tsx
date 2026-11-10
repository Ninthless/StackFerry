import { useState } from "react"
import { RefreshCw } from "lucide-react"
import type { CodexDaemonState } from "@shared/types"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import * as m from "@/paraglide/messages.js"

type Props = {
  state: CodexDaemonState
  busy: boolean
  onRestart: () => Promise<boolean>
}

export function CodexRuntimeNotice({ state, busy, onRestart }: Props) {
  const [confirming, setConfirming] = useState(false)
  if (state !== "stale" && state !== "unknown" && !confirming) return null

  async function restart(): Promise<void> {
    if (await onRestart()) setConfirming(false)
  }

  return (
    <>
      <Alert className="mb-4 shrink-0">
        <RefreshCw />
        <AlertTitle>{m.codex_daemon_title()}</AlertTitle>
        <AlertDescription>
          <p>{state === "unknown" ? m.codex_daemon_unknown() : m.codex_daemon_stale()}</p>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirming(true)}>
            {m.codex_daemon_restart()}
          </Button>
        </AlertDescription>
      </Alert>
      <AlertDialog open={confirming} onOpenChange={(open) => !busy && setConfirming(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.codex_daemon_restart()}</AlertDialogTitle>
            <AlertDialogDescription>{m.codex_daemon_confirm()}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{m.action_cancel()}</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(event) => {
              event.preventDefault()
              void restart()
            }}>
              {busy ? m.codex_daemon_restarting() : m.codex_daemon_restart()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
