import { useEffect, useRef, useState } from "react"
import { FolderInput } from "lucide-react"
import type { ProviderImportOffer } from "@shared/types"
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

const TARGET_LABELS = {
  codex: () => m.tray_cli_codex(),
  claude: () => m.tray_cli_claude(),
  grok: () => m.tray_cli_grok(),
} as const

export function ProviderImportDialog() {
  const [offer, setOffer] = useState<ProviderImportOffer | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  useEffect(() => {
    const api = window.stackferry
    if (!api) return
    const unsub = api.onProviderImportOffer(setOffer)
    void api.getProviderImportOffer().then(setOffer)
    return unsub
  }, [])

  async function dismiss(): Promise<void> {
    if (busyRef.current) return
    await window.stackferry?.dismissProviderImport()
    setOffer(null)
  }

  async function confirm(): Promise<void> {
    const api = window.stackferry
    if (!api || !offer || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    const added: string[] = []
    try {
      if (offer.drafts.codex) {
        await api.addProvider(offer.drafts.codex)
        added.push(TARGET_LABELS.codex())
      }
      if (offer.drafts.claude) {
        await api.addClaudeProvider(offer.drafts.claude)
        added.push(TARGET_LABELS.claude())
      }
      if (offer.drafts.grok) {
        await api.addGrokProvider(offer.drafts.grok)
        added.push(TARGET_LABELS.grok())
      }
      toast.add({ type: "success", description: m.toast_import_provider({ targets: added.join(" · ") }) })
      busyRef.current = false
      await dismiss()
    } catch (error) {
      toast.add({ type: "error", description: formatAppError(error), priority: "high" })
      if (added.length > 0) {
        toast.add({
          type: "success",
          description: m.toast_import_provider_partial({ targets: added.join(" · ") }),
        })
        busyRef.current = false
        await dismiss()
      }
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const targets = offer?.targets.map((target) => TARGET_LABELS[target]()).join(" · ") ?? ""

  return (
    <AlertDialog open={Boolean(offer)} onOpenChange={(open) => !open && !busyRef.current && void dismiss()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <FolderInput />
          </AlertDialogMedia>
          <AlertDialogTitle>{m.import_provider_title()}</AlertDialogTitle>
          <AlertDialogDescription>
            {m.import_provider_description({ name: offer?.name ?? "", targets })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-muted-foreground text-sm">
          {offer?.baseUrl}
          <br />
          {offer?.maskedKey}
        </p>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{m.action_cancel()}</AlertDialogCancel>
          <AlertDialogAction type="button" disabled={busy} onClick={() => void confirm()}>
            {busy ? m.action_saving() : m.import_provider_confirm()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
