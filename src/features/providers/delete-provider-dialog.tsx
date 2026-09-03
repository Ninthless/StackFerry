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

type Props = {
  provider: ProviderListItem | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
}

export function DeleteProviderDialog({ provider, onOpenChange, onConfirm }: Props) {
  return (
    <AlertDialog open={Boolean(provider)} onOpenChange={(open) => !open && onOpenChange(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Trash2 />
          </AlertDialogMedia>
          <AlertDialogTitle>删除供应商</AlertDialogTitle>
          <AlertDialogDescription>
            {provider?.enabled
              ? `「${provider.name}」是当前启用项，删除后不会自动改回官方配置。确定删除？`
              : `确定删除「${provider?.name ?? ""}」？此操作只移除 StackFerry 中的配置。`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction type="button" variant="destructive" onClick={() => void onConfirm()}>
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
