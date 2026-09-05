import { useRef } from "react"
import type { ProviderListItem } from "@shared/types"
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
import { Trash2 } from "lucide-react"
import * as m from "@/paraglide/messages.js"

type Props = {
  provider: ProviderListItem | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
}

export function DeleteProviderDialog({ provider, onOpenChange, onConfirm }: Props) {
  const displayedRef = useRef(provider)
  if (provider) displayedRef.current = provider
  const displayed = displayedRef.current

  return (
    <AlertDialog open={Boolean(provider)} onOpenChange={(open) => !open && onOpenChange(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Trash2 />
          </AlertDialogMedia>
          <AlertDialogTitle>{m.delete_title()}</AlertDialogTitle>
          <AlertDialogDescription>
            {displayed?.enabled
              ? m.delete_enabled_description({ name: displayed.name })
              : m.delete_description({ name: displayed?.name ?? "" })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{m.action_cancel()}</AlertDialogCancel>
          <AlertDialogAction type="button" variant="destructive" onClick={() => void onConfirm()}>
            {m.action_delete()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
