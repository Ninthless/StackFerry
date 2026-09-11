import { useCallback, useEffect, useState } from "react"
import { DatabaseZap } from "lucide-react"
import type { CcswImportCandidate } from "@shared/types"
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
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { formatAppError } from "@/lib/format-app-error"
import * as m from "@/paraglide/messages.js"
import { HintTitle } from "./settings-hint"

export function CcswImportCard() {
  const [detected, setDetected] = useState<CcswImportCandidate | null>(null)
  const [loading, setLoading] = useState(true)
  const [candidate, setCandidate] = useState<CcswImportCandidate | null>(null)
  const [importing, setImporting] = useState(false)

  const detect = useCallback(async () => {
    const api = window.stackferry
    if (!api) return
    try {
      setDetected(await api.detectCcswImport())
    } catch {
      setDetected(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void detect()
  }, [detect])

  async function choose(): Promise<void> {
    const api = window.stackferry
    if (!api) return
    try {
      const next = await api.chooseCcswImport()
      if (next) setCandidate(next)
    } catch (error) {
      toast.add({ type: "error", description: formatAppError(error), priority: "high" })
    }
  }

  async function runImport(): Promise<void> {
    const api = window.stackferry
    if (!api || !candidate) return
    setImporting(true)
    try {
      const result = await api.importCcswProviders(candidate.dbPath)
      setCandidate(null)
      toast.add({
        type: "success",
        description: m.toast_ccsw_imported({
          codex: result.importedCodex,
          claude: result.importedClaude,
          skipped: result.skipped,
        }),
      })
      void detect()
    } catch (error) {
      setCandidate(null)
      toast.add({ type: "error", description: formatAppError(error), priority: "high" })
    } finally {
      setImporting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <HintTitle hint={m.ccsw_description()}>
          <CardTitle>{m.ccsw_legend()}</CardTitle>
        </HintTitle>
        <CardAction>
          <Button type="button" variant="outline" size="sm" disabled={importing} onClick={() => void choose()}>
            {m.ccsw_choose()}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading ? null : detected ? (
          <div className="flex flex-col gap-3">
            <Alert>
              <AlertDescription>
                {m.ccsw_detected({
                  path: detected.dbPath,
                  codex: detected.codex,
                  claude: detected.claude,
                  skipped: detected.skipped,
                })}
              </AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={importing || (detected.codex === 0 && detected.claude === 0)}
                onClick={() => setCandidate(detected)}
              >
                {importing ? <Spinner data-icon="inline-start" /> : null}
                {m.ccsw_import()}
              </Button>
            </div>
          </div>
        ) : (
          <Alert>
            <AlertDescription>{m.ccsw_none()}</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <AlertDialog open={candidate !== null} onOpenChange={(open) => (!open ? setCandidate(null) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <DatabaseZap />
            </AlertDialogMedia>
            <AlertDialogTitle>{m.ccsw_confirm_title()}</AlertDialogTitle>
            <AlertDialogDescription>
              {m.ccsw_confirm_description({
                path: candidate?.dbPath ?? "",
                codex: candidate?.codex ?? 0,
                claude: candidate?.claude ?? 0,
                skipped: candidate?.skipped ?? 0,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.action_cancel()}</AlertDialogCancel>
            <AlertDialogAction type="button" disabled={importing} onClick={() => void runImport()}>
              {importing ? <Spinner data-icon="inline-start" /> : null}
              {m.ccsw_import()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
