import { useRef } from "react"
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
  name: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
}

export function SkillUninstallDialog({ name, onOpenChange, onConfirm }: Props) {
  const displayedRef = useRef(name)
  if (name) displayedRef.current = name
  const displayed = displayedRef.current ?? ""

  return (
    <AlertDialog open={Boolean(name)} onOpenChange={(open) => !open && onOpenChange(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Trash2 />
          </AlertDialogMedia>
          <AlertDialogTitle>{m.skills_uninstall_title()}</AlertDialogTitle>
          <AlertDialogDescription>{m.skills_uninstall_description({ name: displayed })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{m.action_cancel()}</AlertDialogCancel>
          <AlertDialogAction type="button" variant="destructive" onClick={() => void onConfirm()}>
            {m.skills_uninstall()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
